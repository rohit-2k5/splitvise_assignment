const prisma = require('../config/prisma');

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
const createGroup = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Group name is required',
      });
    }

    // Run transaction to create group and add creator as a member
    const group = await prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name: name.trim(),
          creatorId: req.user.id,
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId: req.user.id,
        },
      });

      return newGroup;
    });

    return res.status(201).json({
      success: true,
      data: group,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List all groups of the logged-in user
// @route   GET /api/groups
// @access  Private
const listGroups = async (req, res, next) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            creator: {
              select: { id: true, name: true, email: true },
            },
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    const groups = memberships.map((membership) => {
      const g = membership.group;
      return {
        id: g.id,
        name: g.name,
        creator: g.creator,
        membersCount: g.members.length,
        createdAt: g.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get group details, members, expenses, and current balances
// @route   GET /api/groups/:id
// @access  Private
const getGroupDetails = async (req, res, next) => {
  try {
    const groupId = req.params.id;

    // Check if group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        expenses: {
          orderBy: { createdAt: 'desc' },
          include: {
            paidBy: {
              select: { id: true, name: true, email: true },
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
        settlements: {
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, name: true, email: true } },
            receiver: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Verify requesting user is a member of the group
    const isMember = group.members.some((m) => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this group',
      });
    }

    // DYNAMIC BALANCE CALCULATION FOR GROUP MEMBERS
    // Initialize structure for each member
    const balanceMap = {};
    group.members.forEach((m) => {
      balanceMap[m.userId] = {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        paid: 0.0,
        owed: 0.0,
        settledSent: 0.0,
        settledReceived: 0.0,
        netBalance: 0.0,
      };
    });

    // 1. Process Expenses
    group.expenses.forEach((expense) => {
      const payerId = expense.paidById;
      const amount = Number(expense.amount);

      // Add to payer's total paid if they are in the group member list
      if (balanceMap[payerId]) {
        balanceMap[payerId].paid += amount;
      }

      // Add to each split user's total owed
      expense.splits.forEach((split) => {
        const splitUserId = split.userId;
        const splitAmount = Number(split.amount);
        if (balanceMap[splitUserId]) {
          balanceMap[splitUserId].owed += splitAmount;
        }
      });
    });

    // 2. Process Settlements
    group.settlements.forEach((settlement) => {
      const senderId = settlement.senderId;
      const receiverId = settlement.receiverId;
      const amount = Number(settlement.amount);

      if (balanceMap[senderId]) {
        balanceMap[senderId].settledSent += amount;
      }
      if (balanceMap[receiverId]) {
        balanceMap[receiverId].settledReceived += amount;
      }
    });

    // 3. Compute Net Balance
    // Formula: net = paid - owed + settledSent - settledReceived
    const balances = Object.values(balanceMap).map((userBalance) => {
      userBalance.netBalance = Number(
        (
          userBalance.paid -
          userBalance.owed +
          userBalance.settledSent -
          userBalance.settledReceived
        ).toFixed(2)
      );
      // Clean up float decimals for display
      userBalance.paid = Number(userBalance.paid.toFixed(2));
      userBalance.owed = Number(userBalance.owed.toFixed(2));
      userBalance.settledSent = Number(userBalance.settledSent.toFixed(2));
      userBalance.settledReceived = Number(userBalance.settledReceived.toFixed(2));
      return userBalance;
    });

    return res.status(200).json({
      success: true,
      data: {
        id: group.id,
        name: group.name,
        creator: group.creator,
        createdAt: group.createdAt,
        members: group.members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          joinedAt: m.joinedAt,
        })),
        expenses: group.expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amount: Number(e.amount),
          paidBy: e.paidBy,
          createdAt: e.createdAt,
          splits: e.splits.map((s) => ({
            userId: s.userId,
            userName: s.user.name,
            amount: Number(s.amount),
          })),
        })),
        balances,
        settlements: group.settlements,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add registered user to group by email
// @route   POST /api/groups/:id/members
// @access  Private (Creator Only)
const addMember = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide user email to add',
      });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Only creator is allowed to add members
    if (group.creatorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only the group creator can add members',
      });
    }

    // Find the user to add
    const userToAdd = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User is not registered on this platform',
      });
    }

    // Check if user is already a member
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: userToAdd.id,
        },
      },
    });

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this group',
      });
    }

    // Add member
    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: userToAdd.id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Member added successfully',
      data: {
        userId: newMember.user.id,
        name: newMember.user.name,
        email: newMember.user.email,
        joinedAt: newMember.joinedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove member from group
// @route   DELETE /api/groups/:id/members/:userId
// @access  Private (Creator Only)
const removeMember = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userIdToRemove = req.params.userId;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Only creator is allowed to remove members
    if (group.creatorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only the group creator can remove members',
      });
    }

    // Prevent creator from removing themselves
    if (userIdToRemove === group.creatorId) {
      return res.status(400).json({
        success: false,
        message: 'Access denied: Cannot remove the group creator',
      });
    }

    // Check if target user is actually a member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: userIdToRemove,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this group',
      });
    }

    // Delete membership
    await prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId: userIdToRemove,
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup,
  listGroups,
  getGroupDetails,
  addMember,
  removeMember,
};
