// ============================================
// Room Model - MongoDB Schema
// ============================================

// This file defines the structure of Room (Group Chat) documents

// Import mongoose for MongoDB operations
const mongoose = require('mongoose');

// ============================================
// Create Room Schema
// ============================================

const roomSchema = new mongoose.Schema(
    {
        // Room name - display name of the group
        name: {
            type: String,
            required: [true, 'Room name is required'],
            trim: true,
            minlength: [3, 'Room name must be at least 3 characters'],
            maxlength: [50, 'Room name must not exceed 50 characters']
        },

        // Room description
        description: {
            type: String,
            trim: true,
            maxlength: [200, 'Description must not exceed 200 characters'],
            default: ''
        },

        // Room avatar/image
        avatar: {
            type: String,
            default: 'https://ui-avatars.com/api/?background=random&name=Room'
        },

        // Room type - public or private
        type: {
            type: String,
            enum: ['public', 'private'], // Allowed values
            default: 'private'
        },

        // Room creator - user who created the room
        creator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Room creator is required']
        },

        // Room admins - users with admin privileges
        admins: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],

        // Room members - all users in the room
        members: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            // When user joined the room
            joinedAt: {
                type: Date,
                default: Date.now
            },
            // User role in room
            role: {
                type: String,
                enum: ['admin', 'member'],
                default: 'member'
            }
        }],

        // Maximum members allowed (for premium feature)
        maxMembers: {
            type: Number,
            default: 50 // Free tier: 50 members
        },

        // Is room active
        isActive: {
            type: Boolean,
            default: true
        },

        // Last message in room (for preview)
        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        // Room settings
        settings: {
            // Only admins can send messages
            adminOnly: {
                type: Boolean,
                default: false
            },
            
            // Allow members to add others
            allowMemberInvites: {
                type: Boolean,
                default: true
            },
            
            // Require admin approval to join
            requireApproval: {
                type: Boolean,
                default: false
            },
            
            // Show member list to all
            showMemberList: {
                type: Boolean,
                default: true
            }
        },

        // Room statistics
        stats: {
            // Total messages sent
            messageCount: {
                type: Number,
                default: 0
            },
            
            // Total members (current)
            memberCount: {
                type: Number,
                default: 0
            }
        }
    },
    {
        // Add createdAt and updatedAt timestamps
        timestamps: true
    }
);

// ============================================
// Pre-save Middleware
// ============================================

// Update member count before saving
roomSchema.pre('save', function(next) {
    // Update member count based on members array length
    this.stats.memberCount = this.members.length;
    
    next();
});

// ============================================
// Indexes for Better Performance
// ============================================

// Index for finding public rooms
roomSchema.index({ type: 1, isActive: 1 });

// Index for finding user's rooms
roomSchema.index({ 'members.user': 1 });

// Index for finding rooms by creator
roomSchema.index({ creator: 1 });

// Text index for searching rooms by name
roomSchema.index({ name: 'text', description: 'text' });

// ============================================
// Instance Methods
// ============================================

/**
 * Checks if a user is a member of the room
 * @param {String} userId - User ID to check
 * @returns {Boolean} - true if user is member
 */
roomSchema.methods.isMember = function(userId) {
    // Check if userId exists in members array
    return this.members.some(
        member => member.user.toString() === userId.toString()
    );
};

/**
 * Checks if a user is an admin of the room
 * @param {String} userId - User ID to check
 * @returns {Boolean} - true if user is admin
 */
roomSchema.methods.isAdmin = function(userId) {
    // Check if user is creator
    if (this.creator.toString() === userId.toString()) {
        return true;
    }
    
    // Check if user is in admins array
    return this.admins.some(
        adminId => adminId.toString() === userId.toString()
    );
};

/**
 * Adds a member to the room
 * @param {String} userId - User ID to add
 * @returns {Promise<Room>} - Updated room
 */
roomSchema.methods.addMember = async function(userId) {
    // Check if user is already a member
    if (this.isMember(userId)) {
        throw new Error('User is already a member');
    }

    // Check if room is full
    if (this.members.length >= this.maxMembers) {
        throw new Error('Room is full');
    }

    // Add user to members array
    this.members.push({
        user: userId,
        joinedAt: new Date(),
        role: 'member'
    });

    // Save and return
    return await this.save();
};

/**
 * Removes a member from the room
 * @param {String} userId - User ID to remove
 * @returns {Promise<Room>} - Updated room
 */
roomSchema.methods.removeMember = async function(userId) {
    // Filter out the user from members array
    this.members = this.members.filter(
        member => member.user.toString() !== userId.toString()
    );

    // Also remove from admins if present
    this.admins = this.admins.filter(
        adminId => adminId.toString() !== userId.toString()
    );

    // Save and return
    return await this.save();
};

/**
 * Promotes a member to admin
 * @param {String} userId - User ID to promote
 * @returns {Promise<Room>} - Updated room
 */
roomSchema.methods.promoteToAdmin = async function(userId) {
    // Check if user is a member
    if (!this.isMember(userId)) {
        throw new Error('User is not a member');
    }

    // Check if already an admin
    if (this.isAdmin(userId)) {
        throw new Error('User is already an admin');
    }

    // Add to admins array
    this.admins.push(userId);

    // Update role in members array
    const member = this.members.find(
        m => m.user.toString() === userId.toString()
    );
    if (member) {
        member.role = 'admin';
    }

    // Save and return
    return await this.save();
};

// ============================================
// Static Methods
// ============================================

/**
 * Gets all public rooms
 * @param {Number} limit - Number of rooms to fetch
 * @returns {Promise<Array>} - Array of rooms
 */
roomSchema.statics.getPublicRooms = function(limit = 20) {
    return this.find({
        type: 'public',
        isActive: true
    })
    .sort({ 'stats.memberCount': -1 }) // Sort by most members
    .limit(limit)
    .populate('creator', 'username displayName avatar')
    .populate('lastMessage');
};

/**
 * Gets rooms for a specific user
 * @param {String} userId - User ID
 * @returns {Promise<Array>} - Array of rooms
 */
roomSchema.statics.getUserRooms = function(userId) {
    return this.find({
        'members.user': userId,
        isActive: true
    })
    .sort({ updatedAt: -1 }) // Sort by most recent activity
    .populate('creator', 'username displayName avatar')
    .populate('lastMessage')
    .populate('members.user', 'username displayName avatar isOnline');
};

/**
 * Searches rooms by name
 * @param {String} searchTerm - Search term
 * @returns {Promise<Array>} - Array of rooms
 */
roomSchema.statics.searchRooms = function(searchTerm) {
    return this.find({
        $text: { $search: searchTerm },
        type: 'public',
        isActive: true
    })
    .sort({ score: { $meta: 'textScore' } })
    .limit(20)
    .populate('creator', 'username displayName avatar');
};

// ============================================
// Create and Export Model
// ============================================

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
