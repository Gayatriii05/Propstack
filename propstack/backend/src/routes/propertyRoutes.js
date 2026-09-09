const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { propertySchemas } = require('../validators');
const { listProperties, createProperty } = require('../controllers/propertyController');

router.use(authenticate);
router.get('/', requireRole('owner', 'manager'), listProperties);
router.post('/', requireRole('owner'), validate(propertySchemas.create), createProperty);

module.exports = router;