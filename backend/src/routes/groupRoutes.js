const express = require('express');
const {
  createGroup,
  listGroups,
  getGroupDetails,
  addMember,
  removeMember,
} = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Protect all group routes

router.route('/')
  .post(createGroup)
  .get(listGroups);

router.route('/:id')
  .get(getGroupDetails);

router.route('/:id/members')
  .post(addMember);

router.route('/:id/members/:userId')
  .delete(removeMember);

module.exports = router;
