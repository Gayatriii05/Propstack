const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { unitSchemas } = require('../validators');
const { listUnitsForProperty, createUnit } = require('../controllers/unitController');

router.use(authenticate);
router.get('/:propertyId', listUnitsForProperty);
router.post('/', requireRole('owner'), validate(unitSchemas.create), createUnit);

module.exports = router;