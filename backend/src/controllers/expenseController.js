const prisma = require('../config/prisma');

// Helper to calculate splits and handle rounding adjustments
const calculateSplits = (totalAmount, splitType, splitsInput) => {
  const amount = Number(totalAmount);
  let splits = [];
  let sumCalculated = 0;

  if (splitType === 'EQUAL') {
    // splitsInput: Array of userIds or objects with userId
    const userIds = splitsInput.map(s => typeof s === 'object' ? s.userId : s);
    const count = userIds.length;
    if (count === 0) throw new Error('No users specified for equal split');

    const baseShare = Math.floor((amount / count) * 100) / 100;
    let remainder = Number((amount - (baseShare * count)).toFixed(2));

    userIds.forEach((userId, index) => {
      // Distribute remainder (in 0.01 increments) to the first few users
      let userShare = baseShare;
      if (remainder > 0) {
        userShare = Number((userShare + 0.01).toFixed(2));
        remainder = Number((remainder - 0.01).toFixed(2));
      }
      splits.push({
        userId,
        amount: userShare,
        splitValue: 1, // Default share factor is 1
      });
      sumCalculated += userShare;
    });

  } else if (splitType === 'UNEQUAL') {
    // splitsInput: Array of { userId, splitValue } where splitValue is the exact amount they owe
    let totalInput = 0;
    splitsInput.forEach(s => {
      const val = Number(s.splitValue);
      totalInput = Number((totalInput + val).toFixed(2));
      splits.push({
        userId: s.userId,
        amount: val,
        splitValue: val,
      });
    });

    if (Math.abs(totalInput - amount) > 0.01) {
      throw new Error(`Sum of unequal splits (${totalInput}) must equal total expense amount (${amount})`);
    }

    // Adjust any tiny rounding gap (e.g. 0.01) on the last user
    const diff = Number((amount - totalInput).toFixed(2));
    if (diff !== 0 && splits.length > 0) {
      splits[splits.length - 1].amount = Number((splits[splits.length - 1].amount + diff).toFixed(2));
    }

  } else if (splitType === 'PERCENTAGE') {
    // splitsInput: Array of { userId, splitValue } where splitValue is the percentage (e.g. 25.5)
    let totalPercentage = 0;
    splitsInput.forEach(s => {
      totalPercentage += Number(s.splitValue);
    });

    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error(`Total percentage must equal 100% (got ${totalPercentage}%)`);
    }

    let calculatedSum = 0;
    splitsInput.forEach(s => {
      const pct = Number(s.splitValue);
      const userShare = Math.round((pct / 100) * amount * 100) / 100;
      splits.push({
        userId: s.userId,
        amount: userShare,
        splitValue: pct,
      });
      calculatedSum = Number((calculatedSum + userShare).toFixed(2));
    });

    // Adjust rounding remainder on the last user
    const remainder = Number((amount - calculatedSum).toFixed(2));
    if (remainder !== 0 && splits.length > 0) {
      splits[splits.length - 1].amount = Number((splits[splits.length - 1].amount + remainder).toFixed(2));
    }

  } else if (splitType === 'SHARE') {
    // splitsInput: Array of { userId, splitValue } where splitValue is the share multiplier (e.g. 2)
    let totalShares = 0;
    splitsInput.forEach(s => {
      totalShares += Number(s.splitValue);
    });

    if (totalShares <= 0) {
      throw new Error('Total shares must be greater than 0');
    }

    let calculatedSum = 0;
    splitsInput.forEach(s => {
      const shares = Number(s.splitValue);
      const userShare = Math.round((shares / totalShares) * amount * 100) / 100;
      splits.push({
        userId: s.userId,
        amount: userShare,
        splitValue: shares,
      });
      calculatedSum = Number((calculatedSum + userShare).toFixed(2));
    });

    // Adjust rounding remainder on the last user
    const remainder = Number((amount - calculatedSum).toFixed(2));
    if (remainder !== 0 && splits.length > 0) {
      splits[splits.length - 1].amount = Number((splits[splits.length - 1].amount + remainder).toFixed(2));
    }
  } else {
    throw new Error('Invalid split type');
  }

  return splits;
};

// @desc    Create an expense with splits
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res, next) => {
  try {
    const { groupId, amount, description, paidById, splitType, splits: splitsInput, originalCurrency = 'INR', createdAt } = req.body;

    // Validate inputs
    if (!groupId || !amount || !description || !paidById || !splitType || !splitsInput) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (groupId, amount, description, paidById, splitType, splits)',
      });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number',
      });
    }

    const exchangeRate = 83.0;
    const convertedAmount = originalCurrency === 'USD' ? Number((parsedAmount * exchangeRate).toFixed(2)) : parsedAmount;

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

    // Check if logged-in user is a member of the group
    const isRequesterMember = group.members.some(m => m.userId === req.user.id);
    if (!isRequesterMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You must be a member of this group to add expenses',
      });
    }

    const expenseDate = createdAt ? new Date(createdAt) : new Date();

    // Check if payer was an active member of the group on the expense date
    const payerMember = group.members.find(m => m.userId === paidById);
    if (!payerMember || !payerMember.isActive || (payerMember.leftAt && expenseDate > new Date(payerMember.leftAt)) || expenseDate < new Date(payerMember.joinedAt)) {
      return res.status(400).json({
        success: false,
        message: 'Payer was not an active member of the group on the expense date',
      });
    }

    // Calculate and validate splits in original currency first
    let calculatedSplits;
    try {
      calculatedSplits = calculateSplits(parsedAmount, splitType, splitsInput);
    } catch (calcError) {
      return res.status(400).json({
        success: false,
        message: calcError.message,
      });
    }

    // Now convert calculated splits to INR if original currency is USD
    if (originalCurrency === 'USD') {
      calculatedSplits = calculatedSplits.map(s => ({
        userId: s.userId,
        amount: Number((s.amount * exchangeRate).toFixed(2)),
        splitValue: splitType === 'UNEQUAL' ? Number((s.splitValue * exchangeRate).toFixed(2)) : s.splitValue
      }));
    }

    // Verify all split users were active members of the group on the expense date
    const invalidParticipants = calculatedSplits.filter(s => {
      const m = group.members.find(member => member.userId === s.userId);
      return !m || !m.isActive || (m.leftAt && expenseDate > new Date(m.leftAt)) || expenseDate < new Date(m.joinedAt);
    });

    if (invalidParticipants.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'One or more split participants were not active in the group on the expense date',
      });
    }

    // Run database transaction
    const expense = await prisma.$transaction(async (tx) => {
      // 1. Create Expense
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          amount: convertedAmount,
          originalAmount: parsedAmount,
          originalCurrency,
          convertedAmount,
          description: description.trim(),
          paidById,
          createdAt: expenseDate,
        },
      });

      // 2. Create splits records
      const splitPromises = calculatedSplits.map(split => 
        tx.expenseSplit.create({
          data: {
            expenseId: newExpense.id,
            userId: split.userId,
            amount: split.amount,
            splitValue: split.splitValue,
            splitType,
          },
        })
      );

      await Promise.all(splitPromises);

      // Return expense details with splits
      return tx.expense.findUnique({
        where: { id: newExpense.id },
        include: {
          paidBy: { select: { id: true, name: true, email: true } },
          splits: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });

    return res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get details of a single expense
// @route   GET /api/expenses/:id
// @access  Private
const getExpenseDetails = async (req, res, next) => {
  try {
    const expenseId = req.params.id;

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: {
          include: {
            members: true,
          },
        },
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
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

    // Verify requester is a member of the group
    const isMember = expense.group.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a member of this group',
      });
    }

    // Format response to omit raw group members list
    const formattedExpense = {
      id: expense.id,
      description: expense.description,
      amount: Number(expense.amount),
      paidBy: expense.paidBy,
      createdAt: expense.createdAt,
      group: {
        id: expense.group.id,
        name: expense.group.name,
      },
      splits: expense.splits.map(s => ({
        id: s.id,
        userId: s.userId,
        userName: s.user.name,
        email: s.user.email,
        amount: Number(s.amount),
        splitValue: Number(s.splitValue),
        splitType: s.splitType,
      })),
    };

    return res.status(200).json({
      success: true,
      data: formattedExpense,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res, next) => {
  try {
    const expenseId = req.params.id;

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
        message: 'Access denied: You are not authorized to delete expenses in this group',
      });
    }

    // Delete the expense
    await prisma.expense.delete({
      where: { id: expenseId },
    });

    return res.status(200).json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createExpense,
  getExpenseDetails,
  deleteExpense,
  calculateSplits,
};
