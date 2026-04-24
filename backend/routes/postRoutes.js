const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authMedia = require('../middleware/authMedia');
const postController = require('../controllers/postController');

router.post('/', auth, postController.createPost);
router.post('/:id/like', auth, postController.toggleLike);
router.post('/:id/share', auth, postController.sharePost);
router.post('/:id/comments', auth, postController.addComment);
router.patch('/:id', auth, postController.updatePost);
router.delete('/:id', auth, postController.deletePost);
router.get('/:id/media', authMedia, postController.streamPostMedia);
router.get('/:id/download', auth, postController.downloadAttachment);
router.get('/', auth, postController.getPosts);

module.exports = router;
