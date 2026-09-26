// ============================================
// Room Routes
// ============================================

// This file defines all room (group chat) related routes

// Import Express Router
const express = require('express');
const router = express.Router();

// Import controllers
const {
    createRoom,
    getUserRooms,
    getPublicRooms,
    getRoomDetails,
    joinRoom,
    leaveRoom,
    updateRoom,
    deleteRoom,
    searchRooms
} = require('../controllers/roomController');

// Import middleware
const { protect } = require('../middleware/auth');
const { validateRoomCreation } = require('../middleware/validation');

// ============================================
// Route Definitions
// ============================================

/**
 * @route   GET /api/rooms/public
 * @desc    Get all public rooms
 * @access  Private
 */
router.get('/public', protect, getPublicRooms);

/**
 * @route   GET /api/rooms/search?q=searchTerm
 * @desc    Search for public rooms
 * @access  Private
 */
router.get('/search', protect, searchRooms);

/**
 * @route   GET /api/rooms
 * @desc    Get all rooms user is member of
 * @access  Private
 */
router.get('/', protect, getUserRooms);

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Private
 */
router.post('/', protect, validateRoomCreation, createRoom);

/**
 * @route   GET /api/rooms/:roomId
 * @desc    Get room details by ID
 * @access  Private
 */
router.get('/:roomId', protect, getRoomDetails);

/**
 * @route   PUT /api/rooms/:roomId
 * @desc    Update room details (admin only)
 * @access  Private
 */
router.put('/:roomId', protect, updateRoom);

/**
 * @route   DELETE /api/rooms/:roomId
 * @desc    Delete a room (creator only)
 * @access  Private
 */
router.delete('/:roomId', protect, deleteRoom);

/**
 * @route   POST /api/rooms/:roomId/join
 * @desc    Join a room
 * @access  Private
 */
router.post('/:roomId/join', protect, joinRoom);

/**
 * @route   POST /api/rooms/:roomId/leave
 * @desc    Leave a room
 * @access  Private
 */
router.post('/:roomId/leave', protect, leaveRoom);

// ============================================
// Export Router
// ============================================

module.exports = router;
