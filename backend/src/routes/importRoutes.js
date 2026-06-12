const express = require('express');
const multer = require('multer');
const { importCSV, fetchReport } = require('../controllers/importController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept only CSV files
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// All import routes are protected by JWT authentication
router.use(protect);

router.post('/csv', upload.single('file'), importCSV);
router.get('/report/:id', fetchReport);

module.exports = router;
