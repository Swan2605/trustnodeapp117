const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const auth = require('../middleware/auth');
const authMedia = require('../middleware/authMedia');
const fileValidate = require('../middleware/fileValidate');

// POST /api/upload
router.post('/', auth, fileValidate, uploadController.uploadFile);

// GET /api/upload/download/:id
router.get('/download/:id', authMedia, uploadController.downloadFile);

// POST /api/upload/profile
router.post('/profile', auth, uploadController.uploadProfileImage);

// POST /api/upload/post-media
router.post('/post-media', auth, uploadController.uploadPostMedia);

module.exports = router;
