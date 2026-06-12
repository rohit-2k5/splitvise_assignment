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

  for (const rawRow of parsedRows) {
    const rowNumber = rawRow._rowNumber;
    try {
      // Detect anomalies
      const result = await detectAnomalies(rawRow);

      // Log all anomalies (both skippable and blocking)
      if (result.anomalies.length > 0) {
        for (const anomaly of result.anomalies) {
          await prisma.importAnomaly.create({
            data: {
              importId: importRun.id,
              rowNumber: anomaly.rowNumber,
              anomalyType: anomaly.anomalyType,
              description: anomaly.description,
              actionTaken: anomaly.actionTaken
            }
          });
        }
      }

      if (!result.isValid) {
        failCount++;
        continue;
      }

      const { groupId, paidById, amount, description, createdAt, splitType, splits } = result.data;

      // Create the expense and splits in a transaction
      await prisma.$transaction(async (tx) => {
        // 1. Create expense
        const newExpense = await tx.expense.create({
          data: {
            groupId,
            paidById,
            amount,
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
  if (successCount === 0) {
    finalStatus = 'FAILED';
  } else if (failCount > 0) {
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

module.exports = {
  processCSVImport,
  getImportReport
};
