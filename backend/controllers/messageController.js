// ============================================
// Message Controller
// ============================================

// This file handles message-related operations

// Import models
const Message = require('../models/Message');
const User = require('../models/User');

// ============================================
// Send Message
// ============================================

/**
 * @route   POST /api/messages
 * @desc    Send a new message
 * @access  Private
 */
const sendMessage = async (req, res) => {
    try {
        // Extract message data from request body
        const { receiver, room, content, type, fileUrl, fileName, fileSize, replyTo } = req.body;

        // Validation: Message must have either receiver (private) or room (group)
        if (!receiver && !room) {
            return res.status(400).json({
                success: false,
                message: 'Either receiver or room must be specified'
            });
        }

        // If private message, check if receiver exists
        if (receiver) {
            const receiverUser = await User.findById(receiver);
            if (!receiverUser) {
                return res.status(404).json({
                    success: false,
                    message: 'Receiver not found'
                });
            }

            // Check if sender has blocked receiver or vice versa
            const senderUser = await User.findById(req.user._id);
            if (senderUser.blockedUsers.includes(receiver) || 
                receiverUser.blockedUsers.includes(req.user._id)) {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot send message to this user'
                });
            }
        }

        // Create new message
        const message = await Message.create({
            sender: req.user._id,
            receiver: receiver || null,
            room: room || null,
            content,
            type: type || 'text',
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileSize: fileSize || null,
            replyTo: replyTo || null
        });

        // Populate sender and receiver details
        await message.populate('sender', 'username displayName avatar');
        if (receiver) {
            await message.populate('receiver', 'username displayName avatar');
        }
        if (replyTo) {
            await message.populate('replyTo');
        }

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: {
                message
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Send Message Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

// ============================================
// Get Messages
// ============================================

/**
 * @route   GET /api/messages/:userId
 * @desc    Get messages between current user and another user
 * @access  Private
 */
const getMessages = async (req, res) => {
    try {
        // Get other user's ID from URL parameters
        const { userId } = req.params;
        
        // Get pagination parameters from query
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get messages between current user and other user
        const messages = await Message.getPrivateMessages(
            req.user._id,
            userId,
            limit
        ).skip(skip);

        // Get total count for pagination
        const totalMessages = await Message.countDocuments({
            $or: [
                { sender: req.user._id, receiver: userId },
                { sender: userId, receiver: req.user._id }
            ],
            isDeleted: false,
            room: null
        });

        // Calculate total pages
        const totalPages = Math.ceil(totalMessages / limit);

        // Send messages
        res.status(200).json({
            success: true,
            data: {
                messages,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalMessages,
                    hasMore: page < totalPages
                }
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Messages Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// ============================================
// Get Room Messages
// ============================================

/**
 * @route   GET /api/messages/room/:roomId
 * @desc    Get messages from a room
 * @access  Private
 */
const getRoomMessages = async (req, res) => {
    try {
        // Get room ID from URL parameters
        const { roomId } = req.params;
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // Find messages in room
        const messages = await Message.find({
            room: roomId,
            isDeleted: false
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username displayName avatar')
        .populate('replyTo');

        // Get total count
        const totalMessages = await Message.countDocuments({
            room: roomId,
            isDeleted: false
        });

        // Calculate total pages
        const totalPages = Math.ceil(totalMessages / limit);

        // Send messages
        res.status(200).json({
            success: true,
            data: {
                messages,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalMessages,
                    hasMore: page < totalPages
                }
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Room Messages Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching room messages',
            error: error.message
        });
    }
};

// ============================================
// Mark Messages as Read
// ============================================

/**
 * @route   PUT /api/messages/read/:userId
 * @desc    Mark all messages from a user as read
 * @access  Private
 */
const markAsRead = async (req, res) => {
    try {
        // Get other user's ID from URL parameters
        const { userId } = req.params;

        // Mark all unread messages from this user as read
        const result = await Message.markAllAsRead(userId, req.user._id);

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Messages marked as read',
            data: {
                modifiedCount: result.modifiedCount
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Mark As Read Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read',
            error: error.message
        });
    }
};

// ============================================
// Delete Message
// ============================================

/**
 * @route   DELETE /api/messages/:messageId
 * @desc    Delete a message
 * @access  Private
 */
const deleteMessage = async (req, res) => {
    try {
        // Get message ID from URL parameters
        const { messageId } = req.params;

        // Get deleteFor parameter from query (for-me or for-everyone)
        const { deleteFor } = req.query;

        // Find message
        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Check if user is authorized to delete
        const isAuthorized = message.sender.toString() === req.user._id.toString() ||
                            message.receiver?.toString() === req.user._id.toString();

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to delete this message'
            });
        }

        // Delete for everyone (only sender can do this)
        if (deleteFor === 'everyone') {
            if (message.sender.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Only sender can delete message for everyone'
                });
            }
            
            // Mark message as deleted
            message.isDeleted = true;
            await message.save();
        } 
        // Delete for me only
        else {
            // Add current user to deletedFor array
            if (!message.deletedFor.includes(req.user._id)) {
                message.deletedFor.push(req.user._id);
                await message.save();
            }
        }

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Delete Message Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message',
            error: error.message
        });
    }
};

// ============================================
// Add Reaction to Message
// ============================================

/**
 * @route   POST /api/messages/:messageId/react
 * @desc    Add or remove reaction to a message
 * @access  Private
 */
const addReaction = async (req, res) => {
    try {
        // Get message ID from URL parameters
        const { messageId } = req.params;
        
        // Get emoji from request body
        const { emoji } = req.body;

        // Validate emoji
        if (!emoji) {
            return res.status(400).json({
                success: false,
                message: 'Emoji is required'
            });
        }

        // Find message
        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Add or remove reaction
        await message.addReaction(req.user._id, emoji);

        // Populate message details
        await message.populate('reactions.user', 'username displayName avatar');

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Reaction updated successfully',
            data: {
                reactions: message.reactions
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Add Reaction Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding reaction',
            error: error.message
        });
    }
};

// ============================================
// Get Unread Count
// ============================================

/**
 * @route   GET /api/messages/unread/count
 * @desc    Get count of unread messages
 * @access  Private
 */
const getUnreadCount = async (req, res) => {
    try {
        // Get unread count for current user
        const count = await Message.getUnreadCount(req.user._id);

        // Send count
        res.status(200).json({
            success: true,
            data: {
                unreadCount: count
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Unread Count Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count',
            error: error.message
        });
    }
};

// ============================================
// Export Controller Functions
// ============================================

module.exports = {
    sendMessage,
    getMessages,
    getRoomMessages,
    markAsRead,
    deleteMessage,
    addReaction,
    getUnreadCount
};
