const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, postController.getAllPosts);
router.get('/search', optionalAuth, postController.searchAll);
router.post('/', authMiddleware, postController.createPost);
router.delete('/delete/:id', authMiddleware, postController.deletePost);
router.get('/:id', optionalAuth, postController.getPostById);
router.post('/:id/like', authMiddleware, postController.toggleLike);
router.get('/:id/replies/count', postController.getRepliesCount);
router.post('/:id/replies', authMiddleware, postController.createReply);
router.get('/:id/replies', postController.getRepliesByPostId);

module.exports = router;