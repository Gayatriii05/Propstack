const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  occupancyReport,
  revenueReport,
  topUnitsReport,
  runningRevenueTotal,
} = require('../controllers/reportController');

router.use(authenticate, requireRole('owner', 'manager'));
router.get('/occupancy', occupancyReport);
router.get('/revenue', revenueReport);
router.get('/top-units', topUnitsReport);
router.get('/running-total', runningRevenueTotal);

module.exports = router;
