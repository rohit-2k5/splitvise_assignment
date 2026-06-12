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
  const amountStr = row.amount ? row.amount.replace(/[^0-9.]/g, '') : ''; // Strip currency symbols
  const amount = Number(amountStr);
  if (isNaN(amount) || amount <= 0) {
    anomalies.push({
      rowNumber,
      anomalyType: 'INVALID_AMOUNT',
      description: `Amount '${row.amount}' is invalid or non-positive`,
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  }

  // If already invalid, we can stop heavy database checks for this row
  if (!isValid) {
    return { isValid, anomalies, data: null };
  }

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
    const groupMemberObj = group.members.find(m => m.user.email.toLowerCase() === payerEmailClean);
    if (!groupMemberObj) {
      // Check if user exists but not in group, or doesn't exist at all
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
    // Splits formats:
    // EQUAL: email1;email2;email3
    // OTHERS: email1:val1;email2:val2
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

        // Verify participant is in group
        const participantObj = group.members.find(m => m.user.email.toLowerCase() === email);
        if (!participantObj) {
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
          if (Math.abs(splitSum - amount) > 0.01) {
            anomalies.push({
              rowNumber,
              anomalyType: 'INVALID_SPLITS',
              description: `Sum of unequal splits (₹${splitSum.toFixed(2)}) must equal total cost (₹${amount.toFixed(2)})`,
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
        splitsArray = validatedSplits;
      }
    }
  }

  if (!isValid) {
    return { isValid, anomalies, data: null };
  }

  // 7. Validate Duplicate Expense
  const duplicate = await prisma.expense.findFirst({
    where: {
      groupId: group.id,
      amount: amount,
      description: cleanDescription,
      paidById: payer.id,
      createdAt: {
        // Matches same calendar date
        gte: new Date(parsedDate.setHours(0,0,0,0)),
        lte: new Date(parsedDate.setHours(23,59,59,999))
      }
    }
  });

  if (duplicate) {
    anomalies.push({
      rowNumber,
      anomalyType: 'DUPLICATE_EXPENSE',
      description: `Expense '${cleanDescription}' with amount ₹${amount} already exists for this group and date`,
      actionTaken: 'Skipped Row'
    });
    isValid = false;
  }

  return {
    isValid,
    anomalies,
    data: isValid ? {
      groupId: group.id,
      paidById: payer.id,
      amount,
      description: cleanDescription,
      createdAt: parsedDate,
      splitType,
      splits: splitsArray
    } : null
  };
};

module.exports = {
  detectAnomalies
};
