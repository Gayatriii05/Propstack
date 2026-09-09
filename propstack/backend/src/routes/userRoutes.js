const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { listUsers } = require('../controllers/userController');

router.use(authenticate);
router.get('/', requireRole('owner', 'manager'), listUsers);

module.exports = router;