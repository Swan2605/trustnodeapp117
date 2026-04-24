const express = require('express');
const router = express.Router();
const authMedia = require('../middleware/authMedia');
const uploadController = require('../controllers/uploadController');

// GET /api/media/:id
router.get('/:id', authMedia, uploadController.getMediaById);

module.exports = router;
