const prisma = require('../config/prisma');

/**
 * Normalizes keys of a row to standard header fields: date, description, group, amount, paidBy, splitType, splits.
 */
const normalizeHeaders = (row) => {
  const normalized = {
    date: '',
    description: '',
    group: '',
    amount: '',
    paidBy: '',
    splitType: 'EQUAL',
    splits: '',
    _rowNumber: row._rowNumber
  };

  Object.keys(row).forEach(key => {
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanKey === 'date') {
      normalized.date = row[key];
    } else if (cleanKey === 'description' || cleanKey === 'desc' || cleanKey === 'details') {
      normalized.description = row[key];
    } else if (cleanKey === 'group' || cleanKey === 'groupname' || cleanKey === 'groupid') {
      normalized.group = row[key];
    } else if (cleanKey === 'cost' || cleanKey === 'amount') {
      normalized.amount = row[key];
    } else if (cleanKey === 'paidby' || cleanKey === 'payer' || cleanKey === 'paid') {
      normalized.paidBy = row[key];
    } else if (cleanKey === 'splittype' || cleanKey === 'split') {
      normalized.splitType = row[key].trim().toUpperCase();
    } else if (cleanKey === 'splits' || cleanKey === 'participants' || cleanKey === 'shares') {
      normalized.splits = row[key];
    }
  });

  return normalized;
};

/**
 * Checks a row for anomalies against the database.
 * Returns { isValid, anomalies, data }
 * Where:
 * - isValid: boolean (if false, this row is skipped)
 * - anomalies: Array of { rowNumber, anomalyType, description, actionTaken }
 * - data: Cleaned/Corrected row data mapping to schema structure
 */
const detectAnomalies = async (rawRow) => {
  const anomalies = [];
  let isValid = true;
  const row = normalizeHeaders(rawRow);
  const rowNumber = row._rowNumber;

  // 1. Validate Date
  let parsedDate;
  if (!row.date) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_DATE',
      description: 'Date field is missing or empty',
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else {
    parsedDate = new Date(row.date);
    if (isNaN(parsedDate.getTime())) {
      anomalies.push({
        rowNumber,
        anomalyType: 'INVALID_DATE',
        description: `Date '${row.date}' is malformed`,
        actionTaken: 'Skipped Row'
      });
      isValid = false;
    } else if (parsedDate > new Date()) {
      anomalies.push({
        rowNumber,
        anomalyType: 'INVALID_DATE',
        description: `Date '${row.date}' is in the future`,
        actionTaken: 'Skipped Row'
      });
      isValid = false;
    }
  }

  // 2. Validate Description
  let cleanDescription = row.description ? row.description.trim() : '';
  if (cleanDescription === '') {
    cleanDescription = `Imported Expense - Row ${rowNumber}`;
    anomalies.push({
      rowNumber,
      anomalyType: 'MISSING_DESCRIPTION',
      description: 'Description field was empty',
      actionTaken: `Assigned default description '${cleanDescription}'`
    });
  }

  // 3. Validate Amount
  const originalAmountStr = row.amount ? String(row.amount).trim() : '';
  const hasMinus = originalAmountStr.includes('-');
  
  let originalCurrency = 'INR';
  const lowerAmount = originalAmountStr.toLowerCase();
  if (lowerAmount.includes('$') || lowerAmount.includes('usd')) {
    originalCurrency = 'USD';
  }

  // Clean string keeping digits, decimal point, and minus sign
  const amountStr = originalAmountStr.replace(/[^0-9.-]/g, '');
  const parsedAmount = Number(amountStr);

  if (isNaN(parsedAmount)) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_AMOUNT',
      description: `Amount '${row.amount}' is invalid`,
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else if (parsedAmount < 0 || hasMinus) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_AMOUNT',
      description: `Amount '${row.amount}' is negative (negative amounts are not allowed)`,
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else if (parsedAmount === 0) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_AMOUNT',
      description: `Amount '${row.amount}' is zero`,
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  }

  // If already invalid, we can stop heavy database checks for this row
  if (!isValid) {
    return { isValid, anomalies, data: null };
  }

  // Exchange rate decision: 1 USD = 83 INR (Fixed rate for simplicity and consistency)
  const EXCHANGE_RATE = 83.0;
  const convertedAmount = originalCurrency === 'USD' ? Number((parsedAmount * EXCHANGE_RATE).toFixed(2)) : parsedAmount;

  // 4. Validate Group
  let group = null;
  if (!row.group) {
    anomalies.push({
      rowNumber,
      anomalyType: 'GROUP_NOT_FOUND',
      description: 'Group field is empty',
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else {
    // Lookup by ID or Name
    group = await prisma.group.findFirst({
      where: {
        OR: [
          { id: row.group },
          { name: { equals: row.group, mode: 'insensitive' } }
        ]
      },
      include: {
        members: {
          include: {
            user: true
          }
        }
      }
    });

    if (!group) {
      anomalies.push({
        rowNumber,
        anomalyType: 'GROUP_NOT_FOUND',
        description: `Group '${row.group}' does not exist in the database`,
        actionTaken: 'Skipped Row'
      });
      isValid = false;
    }
  }

  if (!isValid || !group) {
    return { isValid, anomalies, data: null };
  }

  // 5. Validate Payer
  let payer = null;
  if (!row.paidBy) {
    anomalies.push({
      rowNumber,
      anomalyType: 'PAYER_NOT_FOUND',
      description: 'Paid By field is empty',
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else {
    const payerEmailClean = row.paidBy.trim().toLowerCase();
    // Validate that payer was active on the parsed date (joinedAt <= parsedDate <= leftAt)
    const groupMemberObj = group.members.find(m => 
      m.user.email.toLowerCase() === payerEmailClean &&
      new Date(parsedDate) >= new Date(m.joinedAt) &&
      (!m.leftAt || new Date(parsedDate) <= new Date(m.leftAt))
    );

    if (!groupMemberObj) {
      // Check if user exists but wasn't active on that date, or is not in group, or not registered
      const anyMembership = group.members.find(m => m.user.email.toLowerCase() === payerEmailClean);
      if (anyMembership) {
        anomalies.push({
          rowNumber,
          anomalyType: 'PAYER_NOT_FOUND',
          description: `Payer '${row.paidBy}' was not an active member of group on ${row.date}`,
          actionTaken: 'Skipped Row'
        });
      } else {
        const userExists = await prisma.user.findUnique({
          where: { email: payerEmailClean }
        });

        if (!userExists) {
          anomalies.push({
            rowNumber,
            anomalyType: 'PAYER_NOT_FOUND',
            description: `Payer email '${row.paidBy}' is not registered on this platform`,
            actionTaken: 'Skipped Row'
          });
        } else {
          anomalies.push({
            rowNumber,
            anomalyType: 'PAYER_NOT_FOUND',
            description: `Payer '${row.paidBy}' is registered but not a member of the group '${group.name}'`,
            actionTaken: 'Skipped Row'
          });
        }
      }
      isValid = false;
    } else {
      payer = groupMemberObj.user;
    }
  }

  if (!isValid || !payer) {
    return { isValid, anomalies, data: null };
  }

  // 6. Validate Splits and Participants
  let splitsArray = [];
  const splitType = ['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'].includes(row.splitType) ? row.splitType : 'EQUAL';

  if (!row.splits) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_SPLITS',
      description: 'Splits column is empty',
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  } else {
    const rawSplits = row.splits.split(';').map(s => s.trim()).filter(s => s !== '');
    if (rawSplits.length === 0) {
      anomalies.push({
        rowNumber,
        anomalyType: 'INVALID_SPLITS',
        description: 'No participants found in split entries',
        actionTaken: 'Skipped Row'
      });
      isValid = false;
    } else {
      let splitSum = 0;
      const validatedSplits = [];

      for (const entry of rawSplits) {
        let email = '';
        let splitValue = 1; // Default for EQUAL

        if (splitType === 'EQUAL') {
          email = entry.trim().toLowerCase();
        } else {
          const parts = entry.split(':');
          email = parts[0]?.trim().toLowerCase();
          splitValue = Number(parts[1]?.trim() || 0);

          if (isNaN(splitValue) || splitValue < 0) {
            anomalies.push({
              rowNumber,
              anomalyType: 'INVALID_SPLITS',
              description: `Split value '${parts[1]}' for participant '${email}' is invalid`,
              actionTaken: 'Skipped Row'
            });
            isValid = false;
            break;
          }
        }

        // Verify participant is active in group on this date
        const participantObj = group.members.find(m => 
          m.user.email.toLowerCase() === email &&
          new Date(parsedDate) >= new Date(m.joinedAt) &&
          (!m.leftAt || new Date(parsedDate) <= new Date(m.leftAt))
        );

        if (!participantObj) {
          const anyMembership = group.members.find(m => m.user.email.toLowerCase() === email);
          if (anyMembership) {
            anomalies.push({
              rowNumber,
              anomalyType: 'PARTICIPANT_NOT_FOUND',
              description: `Participant '${email}' was not active in group on ${row.date}`,
              actionTaken: 'Skipped Row'
            });
          } else {
            const userExists = await prisma.user.findUnique({ where: { email } });
            if (!userExists) {
              anomalies.push({
                rowNumber,
                anomalyType: 'PARTICIPANT_NOT_FOUND',
                description: `Participant email '${email}' is not registered on this platform`,
                actionTaken: 'Skipped Row'
              });
            } else {
              anomalies.push({
                rowNumber,
                anomalyType: 'PARTICIPANT_NOT_FOUND',
                description: `Participant '${email}' is not a member of the group '${group.name}'`,
                actionTaken: 'Skipped Row'
              });
            }
          }
          isValid = false;
          break;
        }

        splitSum += splitValue;
        validatedSplits.push({
          userId: participantObj.userId,
          splitValue
        });
      }

      if (isValid) {
        // Mathematical validation of totals
        if (splitType === 'UNEQUAL') {
          // Validate splits in original currency
          if (Math.abs(splitSum - parsedAmount) > 0.01) {
            anomalies.push({
              rowNumber,
              anomalyType: 'INVALID_SPLITS',
              description: `Sum of unequal splits (${originalCurrency === 'USD' ? '$' : '₹'}${splitSum.toFixed(2)}) must equal total cost (${originalCurrency === 'USD' ? '$' : '₹'}${parsedAmount.toFixed(2)})`,
              actionTaken: 'Skipped Row'
            });
            isValid = false;
          }
        } else if (splitType === 'PERCENTAGE') {
          if (Math.abs(splitSum - 100) > 0.01) {
            anomalies.push({
              rowNumber,
              anomalyType: 'INVALID_SPLITS',
              description: `Sum of split percentages (${splitSum.toFixed(2)}%) must equal 100%`,
              actionTaken: 'Skipped Row'
            });
            isValid = false;
          }
        } else if (splitType === 'SHARE') {
          if (splitSum <= 0) {
            anomalies.push({
              rowNumber,
              anomalyType: 'INVALID_SPLITS',
              description: 'Sum of split shares must be greater than 0',
              actionTaken: 'Skipped Row'
            });
            isValid = false;
          }
        }
        
        // Convert split values to converted amount (INR) if UNEQUAL
        splitsArray = validatedSplits.map(s => {
          if (splitType === 'UNEQUAL' && originalCurrency === 'USD') {
            return {
              userId: s.userId,
              splitValue: Number((s.splitValue * EXCHANGE_RATE).toFixed(2))
            };
          }
          return s;
        });
      }
    }
  }

  if (!isValid) {
    return { isValid, anomalies, data: null };
  }

  // Check if it is a settlement/payment row
  const settlementKeywords = ['payment', 'settlement', 'settle', 'refund', 'transfer', 'repayment', 'payback'];
  const isSettlementRow = settlementKeywords.some(kw => cleanDescription.toLowerCase().includes(kw));

  if (isSettlementRow) {
    let receiverId = null;
    const otherParticipant = splitsArray.find(s => s.userId !== payer.id);
    if (otherParticipant) {
      receiverId = otherParticipant.userId;
    } else if (splitsArray.length > 0) {
      receiverId = splitsArray[0].userId;
    }

    const rowDataPayload = {
      groupId: group.id,
      paidById: payer.id,
      amount: convertedAmount,
      originalAmount: parsedAmount,
      originalCurrency,
      convertedAmount,
      description: cleanDescription,
      createdAt: parsedDate,
      splitType,
      splits: splitsArray,
      isSettlement: true,
      receiverId
    };

    anomalies.push({
      rowNumber,
      anomalyType: 'SETTLEMENT_ROW',
      description: `Row represents a settlement/payment rather than an expense (Description matches payment keywords)`,
      actionTaken: 'Pending Approval'
    });

    return {
      isValid: false, // Prevent direct expense creation
      anomalies,
      data: rowDataPayload,
      isApprovalNeeded: true
    };
  }

  // 7. Validate Duplicate Expense
  const duplicate = await prisma.expense.findFirst({
    where: {
      groupId: group.id,
      amount: convertedAmount,
      description: cleanDescription,
      paidById: payer.id,
      createdAt: {
        gte: new Date(parsedDate.setHours(0,0,0,0)),
        lte: new Date(parsedDate.setHours(23,59,59,999))
      }
    }
  });

  const rowDataPayload = {
    groupId: group.id,
    paidById: payer.id,
    amount: convertedAmount,
    originalAmount: parsedAmount,
    originalCurrency,
    convertedAmount,
    description: cleanDescription,
    createdAt: parsedDate,
    splitType,
    splits: splitsArray
  };

  if (duplicate) {
    anomalies.push({
      rowNumber,
      anomalyType: 'DUPLICATE_EXPENSE',
      description: `Expense '${cleanDescription}' with amount ₹${convertedAmount} already exists for this group and date`,
      actionTaken: 'Pending Approval'
    });
    
    return {
      isValid: false, // Do not auto-import
      anomalies,
      data: rowDataPayload,
      isApprovalNeeded: true
    };
  }

  // Check if it has any other soft anomaly like MISSING_DESCRIPTION to mark for approval
  const hasMissingDesc = anomalies.some(a => a.anomalyType === 'MISSING_DESCRIPTION');
  if (hasMissingDesc) {
    // Modify the actionTaken from auto-assign to Pending Approval
    const descAnomaly = anomalies.find(a => a.anomalyType === 'MISSING_DESCRIPTION');
    if (descAnomaly) {
      descAnomaly.actionTaken = 'Pending Approval';
    }
    return {
      isValid: false, // Do not auto-import
      anomalies,
      data: rowDataPayload,
      isApprovalNeeded: true
    };
  }

  return {
    isValid,
    anomalies,
    data: rowDataPayload
  };
};

module.exports = {
  detectAnomalies
};
