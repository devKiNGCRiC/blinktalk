// ============================================
// Room Controller
// ============================================

// This file handles room (group chat) operations

// Import models
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');

// ============================================
// Create Room
// ============================================

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Private
 */
const createRoom = async (req, res) => {
    try {
        // Extract room data from request body
        const { name, description, type, avatar } = req.body;

        // Create new room
        const room = await Room.create({
            name,
            description: description || '',
            type: type || 'private',
            avatar: avatar || `https://ui-avatars.com/api/?background=random&name=${name}`,
            creator: req.user._id,
            admins: [req.user._id], // Creator is auto-admin
            members: [{
                user: req.user._id,
                role: 'admin'
            }]
        });

        // Populate creator details
        await room.populate('creator', 'username displayName avatar');

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Room created successfully',
            data: {
                room
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Create Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating room',
            error: error.message
        });
    }
};

// ============================================
// Get All Rooms for User
// ============================================

/**
 * @route   GET /api/rooms
 * @desc    Get all rooms user is member of
 * @access  Private
 */
const getUserRooms = async (req, res) => {
    try {
        // Get user's rooms
        const rooms = await Room.getUserRooms(req.user._id);

        // Send rooms
        res.status(200).json({
            success: true,
            data: {
                rooms,
                count: rooms.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get User Rooms Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching rooms',
            error: error.message
        });
    }
};

// ============================================
// Get Public Rooms
// ============================================

/**
 * @route   GET /api/rooms/public
 * @desc    Get all public rooms
 * @access  Private
 */
const getPublicRooms = async (req, res) => {
    try {
        // Get limit from query parameters
        const limit = parseInt(req.query.limit) || 20;

        // Get public rooms
        const rooms = await Room.getPublicRooms(limit);

        // Send rooms
        res.status(200).json({
            success: true,
            data: {
                rooms,
                count: rooms.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Public Rooms Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching public rooms',
            error: error.message
        });
    }
};

// ============================================
// Get Room Details
// ============================================

/**
 * @route   GET /api/rooms/:roomId
 * @desc    Get room details by ID
 * @access  Private
 */
const getRoomDetails = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;

        // Find room
        const room = await Room.findById(roomId)
            .populate('creator', 'username displayName avatar')
            .populate('members.user', 'username displayName avatar isOnline')
            .populate('admins', 'username displayName avatar')
            .populate('lastMessage');

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is member (for private rooms)
        if (room.type === 'private' && !room.isMember(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this room'
            });
        }

        // Send room details
        res.status(200).json({
            success: true,
            data: {
                room
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Room Details Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching room details',
            error: error.message
        });
    }
};

// ============================================
// Join Room
// ============================================

/**
 * @route   POST /api/rooms/:roomId/join
 * @desc    Join a room
 * @access  Private
 */
const joinRoom = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;

        // Find room
        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if room is active
        if (!room.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This room is no longer active'
            });
        }

        // Check if already a member
        if (room.isMember(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: 'You are already a member of this room'
            });
        }

        // Add user to room
        await room.addMember(req.user._id);

        // Create system message for join event
        await Message.create({
            sender: req.user._id,
            room: roomId,
            content: `${req.user.username} joined the room`,
            type: 'system'
        });

        // Populate and send updated room
        await room.populate('members.user', 'username displayName avatar');

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Joined room successfully',
            data: {
                room
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Join Room Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error joining room',
            error: error.message
        });
    }
};

// ============================================
// Leave Room
// ============================================

/**
 * @route   POST /api/rooms/:roomId/leave
 * @desc    Leave a room
 * @access  Private
 */
const leaveRoom = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;

        // Find room
        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is a member
        if (!room.isMember(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: 'You are not a member of this room'
            });
        }

        // Don't allow creator to leave
        if (room.creator.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Room creator cannot leave. Delete the room instead.'
            });
        }

        // Remove user from room
        await room.removeMember(req.user._id);

        // Create system message for leave event
        await Message.create({
            sender: req.user._id,
            room: roomId,
            content: `${req.user.username} left the room`,
            type: 'system'
        });

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Left room successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Leave Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error leaving room',
            error: error.message
        });
    }
};

// ============================================
// Update Room
// ============================================

/**
 * @route   PUT /api/rooms/:roomId
 * @desc    Update room details
 * @access  Private (Admin only)
 */
const updateRoom = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;

        // Extract updatable fields
        const { name, description, avatar, settings } = req.body;

        // Find room
        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is admin
        if (!room.isAdmin(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'Only admins can update room details'
            });
        }

        // Update fields if provided
        if (name !== undefined) room.name = name;
        if (description !== undefined) room.description = description;
        if (avatar !== undefined) room.avatar = avatar;
        if (settings !== undefined) {
            room.settings = { ...room.settings, ...settings };
        }

        // Save updated room
        await room.save();

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Room updated successfully',
            data: {
                room
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Update Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating room',
            error: error.message
        });
    }
};

// ============================================
// Delete Room
// ============================================

/**
 * @route   DELETE /api/rooms/:roomId
 * @desc    Delete a room
 * @access  Private (Creator only)
 */
const deleteRoom = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;

        // Find room
        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is creator
        if (room.creator.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only room creator can delete the room'
            });
        }

        // Mark room as inactive instead of deleting
        room.isActive = false;
        await room.save();

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Room deleted successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Delete Room Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting room',
            error: error.message
        });
    }
};

// ============================================
// Search Rooms
// ============================================

/**
 * @route   GET /api/rooms/search?q=searchTerm
 * @desc    Search for public rooms
 * @access  Private
 */
const searchRooms = async (req, res) => {
    try {
        // Get search term from query
        const { q } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search term is required'
            });
        }

        // Search rooms
        const rooms = await Room.searchRooms(q);

        // Send results
        res.status(200).json({
            success: true,
            data: {
                rooms,
                count: rooms.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Search Rooms Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching rooms',
            error: error.message
        });
    }
};

// ============================================
// Export Controller Functions
// ============================================

module.exports = {
    createRoom,
    getUserRooms,
    getPublicRooms,
    getRoomDetails,
    joinRoom,
    leaveRoom,
    updateRoom,
    deleteRoom,
    searchRooms
};
