const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  occupancyReport,
  revenueReport,
  topUnitsReport,
  runningRevenueTotal,
  askReport,
  paymentAnomalies,
  monthlyPdf,
} = require('../controllers/reportController');

router.use(authenticate, requireRole('owner', 'manager'));
router.get('/occupancy', occupancyReport);
router.get('/revenue', revenueReport);
router.get('/top-units', topUnitsReport);
router.get('/running-total', runningRevenueTotal);
router.post('/ask', askReport);
router.get('/anomalies', paymentAnomalies);
router.get('/monthly-pdf', monthlyPdf);

module.exports = router;
