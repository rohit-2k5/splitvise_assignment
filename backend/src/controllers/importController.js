const { processCSVImport, getImportReport, getPendingApprovals, processApproval } = require('../imports/importService');

/**
 * @desc    Upload CSV file and process import
 * @route   POST /api/import/csv
 * @access  Private
 */
const importCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

    const filename = req.file.originalname;
    const csvString = req.file.buffer.toString('utf-8');

    // Run import processing
    const importId = await processCSVImport(filename, csvString);

    // Get report
    const report = await getImportReport(importId);

    return res.status(200).json({
      success: true,
      message: 'CSV import processed',
      importId,
      report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get import run report details
 * @route   GET /api/import/report/:id
 * @access  Private
 */
const fetchReport = async (req, res, next) => {
  try {
    const importId = req.params.id;
    const report = await getImportReport(importId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Import report not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all pending CSV approvals
 * @route   GET /api/import/approvals
 * @access  Private
 */
const fetchPendingApprovals = async (req, res, next) => {
  try {
    const approvals = await getPendingApprovals();
    return res.status(200).json({
      success: true,
      data: approvals
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve or reject a pending CSV row anomaly
 * @route   POST /api/import/approvals/:id/action
 * @access  Private
 */
const actionApproval = async (req, res, next) => {
  try {
    const { action } = req.body;
    const approvalId = req.params.id;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be APPROVE or REJECT'
      });
    }

    const result = await processApproval(approvalId, action, req.user.id);
    return res.status(200).json({
      success: true,
      message: `Approval request ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  importCSV,
  fetchReport,
  fetchPendingApprovals,
  actionApproval
};
