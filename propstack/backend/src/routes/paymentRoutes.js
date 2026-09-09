const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { paymentSchemas } = require('../validators');
const { listPaymentsForLease, createPayment, markPaid } = require('../controllers/paymentController');

router.use(authenticate);
router.get('/:leaseId', listPaymentsForLease);
router.post('/', requireRole('owner', 'manager'), validate(paymentSchemas.create), createPayment);
router.patch('/:id/mark-paid', requireRole('owner', 'manager', 'tenant'), markPaid);

module.exports = router;