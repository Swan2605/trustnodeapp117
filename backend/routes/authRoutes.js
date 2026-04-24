const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter, otpLimiter } = require('../middleware/rateLimit');
const auth = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login - rate limited
router.post('/login', loginLimiter, authController.login);

// POST /api/auth/verify-2fa
router.post('/verify-2fa', authController.verifyTwoFactor);

// POST /api/auth/send-email-otp - send login OTP to email
router.post('/send-email-otp', otpLimiter, authController.sendEmailOtp);

// POST /api/auth/verify-stepup - OTP verification (strict rate limiting)
router.post('/verify-stepup', otpLimiter, authController.verifyStepUp);

// POST /api/auth/confirm-2fa
router.post('/confirm-2fa', authController.confirmTwoFactorSetup);

// POST /api/auth/2fa-verify
router.post('/2fa-verify', auth, authController.enable2FA);

// POST /api/auth/logout
router.post('/logout', auth, authController.logout);

// GET /api/auth/security-alert/respond - email security action links
router.get('/security-alert/respond', authController.respondToSecurityAlertEmail);

module.exports = router;
