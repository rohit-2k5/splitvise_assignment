const express = require('express');
const { getExpenseMessages } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // All chat messages routes require auth

router.route('/expense/:expenseId')
  .get(getExpenseMessages);

module.exports = router;
