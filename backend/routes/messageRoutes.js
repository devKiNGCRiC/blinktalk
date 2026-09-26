// ============================================
// Message Routes
// ============================================

// This file defines all message-related routes

// Import Express Router
const express = require('express');
const router = express.Router();

// Import controllers
const {
    sendMessage,
    getMessages,
    getRoomMessages,
    markAsRead,
    deleteMessage,
    addReaction,
    getUnreadCount
} = require('../controllers/messageController');

// Import middleware
const { protect } = require('../middleware/auth');
const { validateMessage } = require('../middleware/validation');

// ============================================
// Route Definitions
// ============================================

/**
 * @route   GET /api/messages/unread/count
 * @desc    Get count of unread messages
 * @access  Private
 */
router.get('/unread/count', protect, getUnreadCount);

/**
 * @route   GET /api/messages/room/:roomId
 * @desc    Get messages from a room
 * @access  Private
 */
router.get('/room/:roomId', protect, getRoomMessages);

/**
 * @route   GET /api/messages/:userId
 * @desc    Get messages between current user and another user
 * @access  Private
 */
router.get('/:userId', protect, getMessages);

/**
 * @route   POST /api/messages
 * @desc    Send a new message
 * @access  Private
 */
router.post('/', protect, validateMessage, sendMessage);

/**
 * @route   PUT /api/messages/read/:userId
 * @desc    Mark all messages from a user as read
 * @access  Private
 */
router.put('/read/:userId', protect, markAsRead);

/**
 * @route   DELETE /api/messages/:messageId?deleteFor=me|everyone
 * @desc    Delete a message
 * @access  Private
 */
router.delete('/:messageId', protect, deleteMessage);

/**
 * @route   POST /api/messages/:messageId/react
 * @desc    Add or remove reaction to a message
 * @access  Private
 */
router.post('/:messageId/react', protect, addReaction);

// ============================================
// Export Router
// ============================================

module.exports = router;
