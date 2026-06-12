const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');

const {
    getNotifications,
    markAsRead,
    getUnreadCounts
} = require('../controllers/notificationController.js');
const { auth } = require('google-auth-library');

router.get('/', authMiddleware, getNotifications);
router.get('/unread-count', authMiddleware, getUnreadCounts);
router.patch('/:id/read', authMiddleware, markAsRead);

module.exports = router;