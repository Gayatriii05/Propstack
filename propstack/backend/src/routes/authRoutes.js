const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authSchemas } = require('../validators');

// Brute-force protection: 5 requests/min on all /api/auth/* routes
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in a minute' },
});

router.use(authLimiter);

router.post('/register', validate(authSchemas.register), register);
router.post('/login', validate(authSchemas.login), login);

module.exports = router;