const prisma = require('../config/prisma');

// @desc    Record a manual settlement payment between group members
// @route   POST /api/settlements
// @access  Private
const createSettlement = async (req, res, next) => {
  try {
    const { groupId, senderId, receiverId, amount } = req.body;

    if (!groupId || !senderId || !receiverId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (groupId, senderId, receiverId, amount)',
      });
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number',
      });
    }

    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Sender and receiver cannot be the same user',
      });
    }

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Verify requesting user is a member of the group
    const isRequesterMember = group.members.some(m => m.userId === req.user.id);
    if (!isRequesterMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You must be a member of this group to record settlements',
      });
    }

    // Verify sender and receiver are members
    const isSenderMember = group.members.some(m => m.userId === senderId);
    const isReceiverMember = group.members.some(m => m.userId === receiverId);

    if (!isSenderMember || !isReceiverMember) {
      return res.status(400).json({
        success: false,
        message: 'Both sender and receiver must be members of the group',
      });
    }

    // Record settlement
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        senderId,
        receiverId,
        amount: payAmount,
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({
      success: true,
      data: settlement,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get settlement history for a group
// @route   GET /api/settlements/group/:groupId
// @access  Private
const getGroupSettlements = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Verify requesting user is a member
    const isMember = group.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this group',
      });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(200).json({
      success: true,
      data: settlements,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSettlement,
  getGroupSettlements,
};
