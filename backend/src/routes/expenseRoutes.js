const express = require('express');
const {
  createExpense,
  getExpenseDetails,
  deleteExpense,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // All expense routes require auth

router.route('/')
  .post(createExpense);

router.route('/:id')
  .get(getExpenseDetails)
  .delete(deleteExpense);

module.exports = router;
