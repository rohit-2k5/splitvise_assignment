const prisma = require('../config/prisma');
const { parseCSV } = require('./csvParser');
const { detectAnomalies } = require('./anomalyDetector');
const { calculateSplits } = require('../controllers/expenseController');

/**
 * Processes a CSV import run.
 * Returns the created Import record with anomalies.
 */
const processCSVImport = async (filename, csvContent) => {
  // 1. Create Import run
  const importRun = await prisma.import.create({
    data: {
      filename,
      status: 'PROCESSING'
    }
  });

  // 2. Parse CSV
  const parsedRows = parseCSV(csvContent);
  if (parsedRows.length === 0) {
    await prisma.import.update({
      where: { id: importRun.id },
      data: { status: 'FAILED' }
    });

    await prisma.importAnomaly.create({
      data: {
        importId: importRun.id,
        rowNumber: 0,
        anomalyType: 'INVALID_FILE',
        description: 'CSV file is empty or missing headers',
        actionTaken: 'Aborted Import'
      }
    });

    return importRun.id;
  }

  let successCount = 0;
  let failCount = 0;
  let approvalCount = 0;

  for (const rawRow of parsedRows) {
    const rowNumber = rawRow._rowNumber;
    try {
      // Detect anomalies
      const result = await detectAnomalies(rawRow);

      // Log all anomalies (both skippable and blocking)
      let createdAnomaly = null;
      if (result.anomalies.length > 0) {
        for (const anomaly of result.anomalies) {
          const newAnomaly = await prisma.importAnomaly.create({
            data: {
              importId: importRun.id,
              rowNumber: anomaly.rowNumber,
              anomalyType: anomaly.anomalyType,
              description: anomaly.description,
              actionTaken: anomaly.actionTaken
            }
          });
          if (anomaly.anomalyType === 'DUPLICATE_EXPENSE' || anomaly.anomalyType === 'MISSING_DESCRIPTION' || anomaly.anomalyType === 'SETTLEMENT_ROW') {
            createdAnomaly = newAnomaly;
          }
        }
      }

      // If approval is needed, create approval record instead of importing directly
      if (result.isApprovalNeeded && createdAnomaly) {
        await prisma.importApproval.create({
          data: {
            anomalyId: createdAnomaly.id,
            action: createdAnomaly.anomalyType === 'SETTLEMENT_ROW' ? 'RECORD_SETTLEMENT' : (createdAnomaly.anomalyType === 'MISSING_DESCRIPTION' ? 'AUTO_CORRECT_IMPORT' : 'FORCE_IMPORT'),
            status: 'PENDING',
            rowData: result.data
          }
        });
        approvalCount++;
        continue;
      }

      if (!result.isValid) {
        failCount++;
        continue;
      }

      const { groupId, paidById, amount, originalAmount, originalCurrency, convertedAmount, description, createdAt, splitType, splits } = result.data;

      // Create the expense and splits in a transaction
      await prisma.$transaction(async (tx) => {
        // 1. Create expense
        const newExpense = await tx.expense.create({
          data: {
            groupId,
            paidById,
            amount,
            originalAmount,
            originalCurrency,
            convertedAmount,
            description,
            createdAt
          }
        });

        // Calculate actual splits using the controller helper
        const calculatedSplits = calculateSplits(amount, splitType, splits);

        // 2. Create splits records
        const splitPromises = calculatedSplits.map(s => 
          tx.expenseSplit.create({
            data: {
              expenseId: newExpense.id,
              userId: s.userId,
              amount: s.amount,
              splitValue: s.splitValue,
              splitType
            }
          })
        );

        await Promise.all(splitPromises);
      });

      successCount++;

    } catch (rowError) {
      failCount++;
      await prisma.importAnomaly.create({
        data: {
          importId: importRun.id,
          rowNumber,
          anomalyType: 'SYSTEM_ERROR',
          description: `Internal error: ${rowError.message}`,
          actionTaken: 'Skipped Row'
        }
      });
    }
  }

  // 3. Determine final status
  let finalStatus = 'COMPLETED';
  if (successCount === 0 && approvalCount === 0) {
    finalStatus = 'FAILED';
  } else if (failCount > 0 || approvalCount > 0) {
    finalStatus = 'PARTIAL';
  }

  // Update import run status
  await prisma.import.update({
    where: { id: importRun.id },
    data: { status: finalStatus }
  });

  return importRun.id;
};

/**
 * Retrieves the full import report.
 */
const getImportReport = async (importId) => {
  const importRun = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      anomalies: {
        orderBy: [
          { rowNumber: 'asc' },
          { id: 'asc' }
        ]
      }
    }
  });

  if (!importRun) {
    return null;
  }

  // Compute statistics
  const totalAnomalies = importRun.anomalies.length;
  const skippedRows = new Set(
    importRun.anomalies
      .filter(a => a.actionTaken === 'Skipped Row' || a.actionTaken === 'Aborted Import')
      .map(a => a.rowNumber)
  ).size;

  return {
    id: importRun.id,
    filename: importRun.filename,
    status: importRun.status,
    createdAt: importRun.createdAt,
    statistics: {
      totalAnomalies,
      skippedRowsCount: skippedRows
    },
    anomalies: importRun.anomalies.map(a => ({
      id: a.id,
      rowNumber: a.rowNumber,
      anomalyType: a.anomalyType,
      description: a.description,
      actionTaken: a.actionTaken
    }))
  };
};

/**
 * Retrieves all pending import approvals.
 */
const getPendingApprovals = async () => {
  const approvals = await prisma.importApproval.findMany({
    where: { status: 'PENDING' },
    include: {
      anomaly: {
        include: {
          import: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Resolve user emails and group names to send a flat structure that matches frontend expectations
  const userIds = new Set();
  const groupIds = new Set();
  approvals.forEach(appr => {
    const rowData = appr.rowData || {};
    if (rowData.paidById) userIds.add(rowData.paidById);
    if (rowData.groupId) groupIds.add(rowData.groupId);
    if (rowData.receiverId) userIds.add(rowData.receiverId);
    if (rowData.splits && Array.isArray(rowData.splits)) {
      rowData.splits.forEach(s => {
        if (s.userId) userIds.add(s.userId);
      });
    }
  });

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, email: true }
  });
  const userMap = new Map(users.map(u => [u.id, u.email]));

  const groups = await prisma.group.findMany({
    where: { id: { in: Array.from(groupIds) } },
    select: { id: true, name: true }
  });
  const groupMap = new Map(groups.map(g => [g.id, g.name]));

  return approvals.map(appr => {
    const rowData = appr.rowData || {};
    const splits = rowData.splits || [];
    const mappedSplits = splits.map(s => ({
      email: userMap.get(s.userId) || 'unknown@example.com',
      splitValue: s.splitValue || s.amount || 0
    }));

    return {
      id: appr.id,
      anomalyId: appr.anomalyId,
      anomalyType: appr.anomaly.anomalyType,
      rowNumber: appr.anomaly.rowNumber,
      groupName: groupMap.get(rowData.groupId) || 'Group',
      description: rowData.description || appr.anomaly.description,
      action: appr.action,
      status: appr.status,
      createdAt: appr.createdAt,
      payerEmail: userMap.get(rowData.paidById) || 'payer@example.com',
      originalAmount: rowData.originalAmount || rowData.amount || 0,
      originalCurrency: rowData.originalCurrency || 'INR',
      convertedAmount: rowData.convertedAmount || rowData.amount || 0,
      splitsJson: JSON.stringify(mappedSplits)
    };
  });
};

/**
 * Processes a pending import approval (Approve / Reject).
 */
const processApproval = async (approvalId, action, approvedByUserId) => {
  const approval = await prisma.importApproval.findUnique({
    where: { id: approvalId },
    include: { anomaly: true }
  });

  if (!approval) {
    throw new Error('Approval request not found');
  }

  if (approval.status !== 'PENDING') {
    throw new Error('Approval request has already been processed');
  }

  if (action === 'REJECT') {
    await prisma.$transaction([
      prisma.importApproval.update({
        where: { id: approvalId },
        data: { status: 'REJECTED', approvedBy: approvedByUserId }
      }),
      prisma.importAnomaly.update({
        where: { id: approval.anomalyId },
        data: { actionTaken: 'Rejected by User' }
      })
    ]);
    return { success: true, status: 'REJECTED' };
  }

  if (action === 'APPROVE') {
    const rowData = approval.rowData;
    const { groupId, paidById, amount, originalAmount, originalCurrency, convertedAmount, description, createdAt, splitType, splits, isSettlement, receiverId } = rowData;

    if (isSettlement || approval.anomaly.anomalyType === 'SETTLEMENT_ROW' || approval.action === 'RECORD_SETTLEMENT') {
      await prisma.$transaction(async (tx) => {
        let finalReceiverId = receiverId;
        if (!finalReceiverId) {
          const otherMember = await tx.groupMember.findFirst({
            where: {
              groupId,
              userId: { not: paidById }
            }
          });
          finalReceiverId = otherMember ? otherMember.userId : paidById;
        }

        // 1. Create Settlement
        await tx.settlement.create({
          data: {
            groupId,
            senderId: paidById,
            receiverId: finalReceiverId,
            amount: convertedAmount,
            createdAt: new Date(createdAt)
          }
        });

        // 2. Update approval status
        await tx.importApproval.update({
          where: { id: approvalId },
          data: { status: 'APPROVED', approvedBy: approvedByUserId }
        });

        // 3. Update anomaly action taken
        await tx.importAnomaly.update({
          where: { id: approval.anomalyId },
          data: { actionTaken: 'Approved by User' }
        });
      });

      return { success: true, status: 'APPROVED' };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Create expense
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          paidById,
          amount,
          originalAmount,
          originalCurrency,
          convertedAmount,
          description,
          createdAt: new Date(createdAt)
        }
      });

      // Calculate actual splits
      const calculatedSplits = calculateSplits(Number(amount), splitType, splits);

      // 2. Create splits records
      const splitPromises = calculatedSplits.map(s => 
        tx.expenseSplit.create({
          data: {
            expenseId: newExpense.id,
            userId: s.userId,
            amount: s.amount,
            splitValue: s.splitValue,
            splitType
          }
        })
      );
      await Promise.all(splitPromises);

      // 3. Update approval status
      await tx.importApproval.update({
        where: { id: approvalId },
        data: { status: 'APPROVED', approvedBy: approvedByUserId }
      });

      // 4. Update anomaly action taken
      await tx.importAnomaly.update({
        where: { id: approval.anomalyId },
        data: { actionTaken: 'Approved by User' }
      });
    });

    return { success: true, status: 'APPROVED' };
  }

  throw new Error('Invalid action. Must be APPROVE or REJECT');
};

module.exports = {
  processCSVImport,
  getImportReport,
  getPendingApprovals,
  processApproval
};
