const express = require('express');
const router = express.Router();
const recoveryController = require('../controllers/recoveryController');

// POST /api/recovery/forgot
router.post('/forgot', recoveryController.forgotPassword);

// POST /api/recovery/reset
router.post('/reset', recoveryController.resetPassword);

module.exports = router;
