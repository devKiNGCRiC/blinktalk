// ============================================
// User Controller
// ============================================

// This file handles user-related operations

const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Message = require('../models/Message');

// ============================================
// Get User Profile
// ============================================

/**
 * @route   GET /api/users/:userId
 * @desc    Get user profile by ID
 * @access  Private
 */
const getUserProfile = async (req, res) => {
    try {
        // Get user ID from URL parameters
        const { userId } = req.params;

        // Find user in database
        const user = await User.findById(userId).select('-password');

        // Check if user exists
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Send user data
        res.status(200).json({
            success: true,
            data: {
                user: user.toSafeObject()
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get User Profile Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user profile',
            error: error.message
        });
    }
};

// ============================================
// Update User Profile
// ============================================

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
    try {
        // Extract updatable fields from request body
        const { displayName, bio, avatar, preferences } = req.body;

        // Get current user
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update fields if provided
        if (displayName !== undefined) user.displayName = displayName;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        if (preferences !== undefined && preferences !== null) {
            // Update each known preference key separately
            // (spreading a Mongoose subdocument would copy internal fields, not the values)
            for (const key of ['notifications', 'sounds', 'theme']) {
                if (preferences[key] !== undefined) {
                    user.preferences[key] = preferences[key];
                }
            }
        }

        // Save updated user
        await user.save();

        // Send updated user data
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: user.toSafeObject()
            }
        });

    } catch (error) {
        // Handle errors
        // Invalid values (e.g. unknown theme) are the client's mistake, not a server error
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors)[0].message
            });
        }

        console.error('Update Profile Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

// ============================================
// Search Users
// ============================================

/**
 * @route   GET /api/users/search?q=searchTerm
 * @desc    Search for users by username or display name
 * @access  Private
 */
const searchUsers = async (req, res) => {
    try {
        // Get search query from URL query parameters
        const { q } = req.query;

        // Check if search term is provided
        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search term is required'
            });
        }

        // Escape regex special characters so user input is matched literally
        const pattern = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Search for users
        // Case-insensitive search in username and displayName
        const users = await User.find({
            $or: [
                { username: { $regex: pattern, $options: 'i' } }, // i = case insensitive
                { displayName: { $regex: pattern, $options: 'i' } }
            ],
            isActive: true, // Only search active users
            _id: { $ne: req.user._id } // Exclude current user
        })
        .select('username displayName avatar isOnline lastSeen') // Select specific fields
        .limit(20); // Limit results to 20

        // Send results
        res.status(200).json({
            success: true,
            data: {
                users,
                count: users.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Search Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching users',
            error: error.message
        });
    }
};

// ============================================
// Get User's Contacts
// ============================================

/**
 * @route   GET /api/users/contacts
 * @desc    Get the user's friends, with their last message and unread count
 * @access  Private
 */
const getContacts = async (req, res) => {
    try {
        const me = req.user._id;

        // Friends with their presence
        const user = await User.findById(me)
            .populate('friends', 'username displayName avatar isOnline lastSeen isActive');
        const friends = (user.friends || []).filter(friend => friend.isActive !== false);

        // Unread messages per friend
        const unreadCounts = await Message.aggregate([
            { $match: { receiver: me, room: null, isRead: false, isDeleted: false } },
            { $group: { _id: '$sender', count: { $sum: 1 } } }
        ]);
        const unreadBySender = new Map(unreadCounts.map(({ _id, count }) => [_id.toString(), count]));

        // Last message with each friend (skipping ones this user deleted for themselves)
        const contacts = await Promise.all(friends.map(async friend => {
            const last = await Message.findOne({
                $or: [
                    { sender: me, receiver: friend._id },
                    { sender: friend._id, receiver: me }
                ],
                room: null,
                deletedFor: { $ne: me }
            }).sort({ createdAt: -1 });

            const { isActive, ...friendFields } = friend.toObject();
            return {
                user: friendFields,
                lastMessage: last ? {
                    content: last.isDeleted ? '' : last.content,
                    isDeleted: last.isDeleted,
                    fromMe: last.sender.toString() === me.toString(),
                    createdAt: last.createdAt,
                    isRead: last.isRead
                } : null,
                unreadCount: unreadBySender.get(friend._id.toString()) || 0
            };
        }));

        // Most recent conversation first; new friends without messages at the end
        contacts.sort((a, b) =>
            new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0)
        );

        res.status(200).json({
            success: true,
            data: {
                contacts,
                count: contacts.length
            }
        });

    } catch (error) {
        console.error('Get Contacts Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching contacts',
            error: error.message
        });
    }
};

// ============================================
// Unfriend
// ============================================

/**
 * @route   DELETE /api/users/friends/:userId
 * @desc    Remove a friend (removes the friendship for both people)
 * @access  Private
 */
const unfriend = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        const me = req.user._id;
        await User.updateOne({ _id: me }, { $pull: { friends: userId } });
        await User.updateOne({ _id: userId }, { $pull: { friends: me } });

        // Both people's apps drop the chat right away
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${me}`).emit('friend:removed', { userId });
            io.to(`user:${userId}`).emit('friend:removed', { userId: me.toString() });
        }

        res.status(200).json({ success: true, message: 'Friend removed' });

    } catch (error) {
        console.error('Unfriend Error:', error);
        res.status(500).json({ success: false, message: 'Error removing friend' });
    }
};

// ============================================
// Block User
// ============================================

/**
 * @route   POST /api/users/:userId/block
 * @desc    Block a user
 * @access  Private
 */
const blockUser = async (req, res) => {
    try {
        // Get user ID to block from URL parameters
        const { userId } = req.params;

        // Check if user is trying to block themselves
        if (userId === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot block yourself'
            });
        }

        // Check if user to block exists
        const userToBlock = await User.findById(userId);
        if (!userToBlock) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get current user
        const currentUser = await User.findById(req.user._id);

        // Check if user is already blocked
        if (currentUser.blockedUsers.includes(userId)) {
            return res.status(400).json({
                success: false,
                message: 'User is already blocked'
            });
        }

        // Add user to blocked list
        currentUser.blockedUsers.push(userId);
        await currentUser.save();

        // Send success response
        res.status(200).json({
            success: true,
            message: 'User blocked successfully',
            data: {
                blockedUser: {
                    _id: userToBlock._id,
                    username: userToBlock.username,
                    displayName: userToBlock.displayName
                }
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Block User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error blocking user',
            error: error.message
        });
    }
};

// ============================================
// Unblock User
// ============================================

/**
 * @route   POST /api/users/:userId/unblock
 * @desc    Unblock a user
 * @access  Private
 */
const unblockUser = async (req, res) => {
    try {
        // Get user ID to unblock from URL parameters
        const { userId } = req.params;

        // Get current user
        const currentUser = await User.findById(req.user._id);

        // Check if user is actually blocked
        if (!currentUser.blockedUsers.includes(userId)) {
            return res.status(400).json({
                success: false,
                message: 'User is not blocked'
            });
        }

        // Remove user from blocked list
        currentUser.blockedUsers = currentUser.blockedUsers.filter(
            id => id.toString() !== userId
        );
        await currentUser.save();

        // Send success response
        res.status(200).json({
            success: true,
            message: 'User unblocked successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Unblock User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error unblocking user',
            error: error.message
        });
    }
};

// ============================================
// Get Blocked Users
// ============================================

/**
 * @route   GET /api/users/blocked
 * @desc    Get list of blocked users
 * @access  Private
 */
const getBlockedUsers = async (req, res) => {
    try {
        // Get current user with populated blocked users
        const user = await User.findById(req.user._id)
            .populate('blockedUsers', 'username displayName avatar');

        // Send blocked users list
        res.status(200).json({
            success: true,
            data: {
                blockedUsers: user.blockedUsers,
                count: user.blockedUsers.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Blocked Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching blocked users',
            error: error.message
        });
    }
};

// ============================================
// Get Online Users
// ============================================

/**
 * @route   GET /api/users/online
 * @desc    Get list of online users
 * @access  Private
 */
const getOnlineUsers = async (req, res) => {
    try {
        // Find all online users except current user
        const onlineUsers = await User.find({
            isOnline: true,
            isActive: true,
            _id: { $ne: req.user._id }
        })
        .select('username displayName avatar lastSeen')
        .limit(50);

        // Send online users
        res.status(200).json({
            success: true,
            data: {
                users: onlineUsers,
                count: onlineUsers.length
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Get Online Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching online users',
            error: error.message
        });
    }
};

// ============================================
// Export Controller Functions
// ============================================

module.exports = {
    getUserProfile,
    updateProfile,
    searchUsers,
    getContacts,
    unfriend,
    blockUser,
    unblockUser,
    getBlockedUsers,
    getOnlineUsers
};
