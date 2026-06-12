const prisma = require('../config/prisma');

// @desc    Get chat history for an expense
// @route   GET /api/messages/expense/:expenseId
// @access  Private
const getExpenseMessages = async (req, res, next) => {
  try {
    const { expenseId } = req.params;

    // Verify expense exists and user has access (is member of the group)
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    // Verify requesting user is a member of the group
    const isMember = expense.group.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this group',
      });
    }

    const messages = await prisma.message.findMany({
      where: { expenseId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(200).json({
      success: true,
      data: messages.map(msg => ({
        id: msg.id,
        expenseId: msg.expenseId,
        messageText: msg.messageText,
        createdAt: msg.createdAt,
        sender: msg.sender,
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExpenseMessages,
};
