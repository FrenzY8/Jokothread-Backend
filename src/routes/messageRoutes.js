const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const {
    getContacts,
    getChatHistory,
    sendMessage,
    readChatHistory
} = require('../controllers/messageController');

router.get('/contacts', authMiddleware, getContacts);
router.put('/:id/read', authMiddleware, readChatHistory);
router.get('/:id', authMiddleware, getChatHistory);
router.post('/:id', authMiddleware, sendMessage);

module.exports = router;