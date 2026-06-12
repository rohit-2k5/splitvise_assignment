const express = require('express');
const {
  createSettlement,
  getGroupSettlements,
} = require('../controllers/settlementController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // All settlement routes require auth

router.route('/')
  .post(createSettlement);

router.route('/group/:groupId')
  .get(getGroupSettlements);

module.exports = router;
