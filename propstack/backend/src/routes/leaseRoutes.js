const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { leaseSchemas } = require('../validators');
const { listLeases, createLease } = require('../controllers/leaseController');

router.use(authenticate);
router.get('/', listLeases);
router.post('/', requireRole('owner'), validate(leaseSchemas.create), createLease);

module.exports = router;