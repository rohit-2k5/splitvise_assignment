import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { expenseService, messageService } from '../services/api';
import { io } from 'socket.io-client';
import { ArrowLeft, Send, MessageSquare, Shield, Clock, Calendar, CheckCircle } from 'lucide-react';

const ExpenseDetails = () => {
  const { id: expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const socketRef = useRef(null);
  const chatBottomRef = useRef(null);

  const fetchExpenseAndChat = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Fetch expense info
      const expRes = await expenseService.getExpenseDetails(expenseId);
      if (expRes.success) {
        setExpense(expRes.data);
      } else {
        setError(expRes.message);
        return;
      }

      // Fetch chat history
      const msgRes = await messageService.getExpenseMessages(expenseId);
      if (msgRes.success) {
        setMessages(msgRes.data);
      }
    } catch (err) {
      setError('Access Denied: You do not have access to this expense.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenseAndChat();
  }, [expenseId]);

  // Setup Socket.IO connection
  useEffect(() => {
    if (loading || error || !expense) return;

    // Connect socket
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    console.log("Connecting socket to:", socketUrl);
    
    socketRef.current = io(socketUrl);

    // Join room
    socketRef.current.emit('join_room', { expenseId });

    // Receive message listener
    socketRef.current.on('receive_message', (newMessage) => {
      setMessages((prev) => {
        // Prevent duplicate appending
        if (prev.some(m => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_room', { expenseId });
        socketRef.current.disconnect();
      }
    };
  }, [expense, loading, error]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle Send Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput || chatInput.trim() === '') return;

    if (socketRef.current) {
      socketRef.current.emit('send_message', {
        expenseId,
        senderId: user.id,
        messageText: chatInput.trim()
      });
      setChatInput('');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-500">Loading bill details...</p>
        </div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <Clock className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">An Error Occurred</h3>
          <p className="text-sm text-slate-500">{error || 'Expense not found'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Top Header Panel */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-10 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/group/${expense.group.id}`)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{expense.description}</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Group: <span className="font-semibold hover:underline cursor-pointer" onClick={() => navigate(`/group/${expense.group.id}`)}>{expense.group.name}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-medium">Total Bill</p>
            <p className="text-lg font-black text-slate-900">₹{expense.amount}</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 grid gap-8 md:grid-cols-3">
        
        {/* Left/Middle side: Splits Breakdown */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Card: Bill Meta Details */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-950 text-base border-b border-slate-100 pb-3">Bill Details</h3>
            
            <div className="space-y-3.5">
              <div className="flex items-center gap-3 text-sm">
                <Shield className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-slate-400 font-medium leading-none">Paid By</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{expense.paidBy.id === user.id ? 'You' : expense.paidBy.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400 font-medium leading-none">Recorded On</p>
                  <p className="font-semibold text-slate-700 mt-0.5">
                    {new Date(expense.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400 font-medium leading-none">Original Split Type</p>
                  <p className="font-semibold text-slate-700 mt-0.5 uppercase tracking-wide text-xs">{expense.splits[0]?.splitType || 'EQUAL'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Splits Log */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200/80 px-5 py-4 bg-slate-50/50">
              <h3 className="font-bold text-slate-950">Split Breakdown</h3>
            </div>
            
            <div className="p-4 divide-y divide-slate-100">
              {expense.splits.map(split => (
                <div key={split.id} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0 text-sm">
                  <div>
                    <span className="font-semibold text-slate-800">{split.userName}</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {split.splitType === 'PERCENTAGE' 
                        ? `${split.splitValue}% percentage` 
                        : split.splitType === 'SHARE' 
                          ? `${split.splitValue} share(s)` 
                          : 'equal split'}
                    </span>
                  </div>
                  <span className="font-extrabold text-slate-900">₹{split.amount}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right side: Real-time Chat Section */}
        <div className="md:col-span-2">
          
          {/* Chat Container */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[500px]">
            {/* Chat Header */}
            <div className="border-b border-slate-200/80 px-5 py-4 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-950 flex items-center gap-2">
                <MessageSquare className="h-4.5 w-4.5 text-emerald-500" />
                Expense Discussion
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                live chat
              </span>
            </div>

            {/* Messages Display Box */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/40 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                  <MessageSquare className="h-8 w-8 stroke-[1.5]" />
                  <p className="text-sm font-medium">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.sender.id === user.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-500">{msg.sender.name}</span>
                        <span className="text-[8px] text-slate-400">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        isMe 
                          ? 'bg-emerald-600 text-white rounded-tr-none' 
                          : 'bg-white text-slate-800 border border-slate-200/60 rounded-tl-none'
                      }`}>
                        <p className="leading-relaxed break-words">{msg.messageText}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef}></div>
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendMessage} className="border-t border-slate-100 p-4 bg-white flex gap-3">
              <input
                type="text"
                placeholder="Type your message here..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 shrink-0"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>

          </div>
        </div>

      </main>
    </div>
  );
};

export default ExpenseDetails;
