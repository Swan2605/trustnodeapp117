const express = require('express');
const router = express.Router();
const privacyController = require('../controllers/privacyController');
const auth = require('../middleware/auth');

// PUT /api/privacy
router.put('/', auth, privacyController.updatePrivacy);

// GET /api/privacy
router.get('/', auth, privacyController.getPrivacy);

module.exports = router;
