const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { maintenanceSchemas } = require('../validators');
const { listRequestsForUnit, createRequest, updateStatus } = require('../controllers/maintenanceController');

router.use(authenticate);
router.get('/:unitId', listRequestsForUnit);
router.post('/', requireRole('tenant'), validate(maintenanceSchemas.create), createRequest);
router.patch('/:id/status', requireRole('owner', 'manager'), validate(maintenanceSchemas.status), updateStatus);

module.exports = router;