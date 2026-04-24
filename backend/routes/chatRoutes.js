const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// GET /api/chat - Get all conversations
router.get('/', auth, chatController.getConversations);

// POST /api/chat/send - Send a message
router.post('/send', auth, chatController.sendMessage);

// PATCH /api/chat/read - Mark messages as read
router.patch('/read', auth, chatController.markAsRead);

// GET /api/chat/:userId - Get messages with specific user (must be after specific routes)
router.get('/:userId', auth, chatController.getMessages);

// DELETE /api/chat/:userId - Delete conversation
router.delete('/:userId', auth, chatController.deleteConversation);

module.exports = router;
