// ============================================
// User Routes
// ============================================

// This file defines all user-related routes

// Import Express Router
const express = require('express');
const router = express.Router();

// Import controllers
const {
    getUserProfile,
    updateProfile,
    searchUsers,
    getContacts,
    blockUser,
    unblockUser,
    getBlockedUsers,
    getOnlineUsers
} = require('../controllers/userController');

// Import middleware
const { protect } = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/validation');

// ============================================
// Route Definitions
// ============================================

/**
 * @route   GET /api/users/search?q=searchTerm
 * @desc    Search for users
 * @access  Private
 */
router.get('/search', protect, searchUsers);

/**
 * @route   GET /api/users/contacts
 * @desc    Get user's contacts (people they've chatted with)
 * @access  Private
 */
router.get('/contacts', protect, getContacts);

/**
 * @route   GET /api/users/blocked
 * @desc    Get list of blocked users
 * @access  Private
 */
router.get('/blocked', protect, getBlockedUsers);

/**
 * @route   GET /api/users/online
 * @desc    Get list of online users
 * @access  Private
 */
router.get('/online', protect, getOnlineUsers);

/**
 * @route   GET /api/users/:userId
 * @desc    Get user profile by ID
 * @access  Private
 */
router.get('/:userId', protect, getUserProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', protect, validateProfileUpdate, updateProfile);

/**
 * @route   POST /api/users/:userId/block
 * @desc    Block a user
 * @access  Private
 */
router.post('/:userId/block', protect, blockUser);

/**
 * @route   POST /api/users/:userId/unblock
 * @desc    Unblock a user
 * @access  Private
 */
router.post('/:userId/unblock', protect, unblockUser);

// ============================================
// Export Router
// ============================================

module.exports = router;
