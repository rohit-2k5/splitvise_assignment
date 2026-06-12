const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const messageRoutes = require('./routes/messageRoutes');
const importRoutes = require('./routes/importRoutes');
const prisma = require('./config/prisma');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Setup Socket.IO Server
const io = new Server(server, {
  cors: {
    origin: '*', // Restrict this in production
    methods: ['GET', 'POST'],
  },
});

// Bind socket instance to app so we can access it inside controllers if needed
app.set('io', io);

// Global Middlewares
app.use(cors());
app.use(express.json());

// API Route Bindings
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/import', importRoutes);

// Base health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Splitwise Clone Backend API is healthy',
  });
});

// Socket.IO Connection Event Handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join expense-specific chat room
  socket.on('join_room', ({ expenseId }) => {
    if (expenseId) {
      const roomName = `expense_${expenseId}`;
      socket.join(roomName);
      console.log(`User socket ${socket.id} joined room: ${roomName}`);
    }
  });

  // Handle incoming real-time chat messages
  socket.on('send_message', async ({ expenseId, senderId, messageText }) => {
    try {
      if (!expenseId || !senderId || !messageText || messageText.trim() === '') {
        return;
      }

      // Save message to database
      const newMessage = await prisma.message.create({
        data: {
          expenseId,
          senderId,
          messageText: messageText.trim(),
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Broadcast to room
      const roomName = `expense_${expenseId}`;
      io.to(roomName).emit('receive_message', {
        id: newMessage.id,
        expenseId: newMessage.expenseId,
        messageText: newMessage.messageText,
        createdAt: newMessage.createdAt,
        sender: newMessage.sender,
      });
      console.log(`Chat message sent in room ${roomName} by sender ${senderId}`);
    } catch (err) {
      console.error('Socket send_message error:', err);
    }
  });

  // Leave expense-specific chat room
  socket.on('leave_room', ({ expenseId }) => {
    if (expenseId) {
      const roomName = `expense_${expenseId}`;
      socket.leave(roomName);
      console.log(`User socket ${socket.id} left room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Error handling middleware (MUST be loaded after routing)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
