// ============================================
// Message Model - MongoDB Schema
// ============================================

// This file defines the structure of Message documents in MongoDB

// Import mongoose for MongoDB operations
const mongoose = require('mongoose');

// ============================================
// Create Message Schema
// ============================================

const messageSchema = new mongoose.Schema(
    {
        // Sender - who sent the message
        // Not required for anonymous stranger messages (there is no user)
        sender: {
            type: mongoose.Schema.Types.ObjectId, // Reference to User model
            ref: 'User', // Model to reference
            required: [
                function() { return !this.isAnonymous; },
                'Sender is required'
            ],
            default: null
        },

        // Receiver - who receives the message (for private messages)
        // null for group messages
        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null // null means it's a group/room message
        },

        // Room - for group messages
        // null for private messages
        room: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Room',
            default: null
        },

        // Message content
        content: {
            type: String,
            required: [true, 'Message content is required'],
            trim: true,
            maxlength: [5000, 'Message must not exceed 5000 characters']
        },

        // Message type - text, image, file, etc.
        type: {
            type: String,
            enum: ['text', 'image', 'file', 'audio', 'video', 'system'], // Allowed types
            default: 'text'
        },

        // File URL - for media messages
        fileUrl: {
            type: String,
            default: null
        },

        // File name - original file name
        fileName: {
            type: String,
            default: null
        },

        // File size in bytes
        fileSize: {
            type: Number,
            default: null
        },

        // Is message read by receiver
        isRead: {
            type: Boolean,
            default: false
        },

        // When was message read
        readAt: {
            type: Date,
            default: null
        },

        // Is message delivered
        isDelivered: {
            type: Boolean,
            default: false
        },

        // When was message delivered
        deliveredAt: {
            type: Date,
            default: null
        },

        // Is message deleted
        isDeleted: {
            type: Boolean,
            default: false
        },

        // Deleted for - which users deleted this message
        // Used for "delete for me" feature
        deletedFor: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],

        // Reply to - reference to message being replied to
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        // Reactions - emoji reactions to message
        reactions: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            emoji: {
                type: String,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],

        // Anonymous message - for stranger chat
        isAnonymous: {
            type: Boolean,
            default: false
        },

        // Anonymous session ID - for stranger chat
        anonymousSessionId: {
            type: String,
            default: null
        }
    },
    {
        // Add createdAt and updatedAt timestamps
        timestamps: true,

        // When a message is sent to the client (API response or socket event),
        // hide the text of messages that were "deleted for everyone".
        // The client then shows "This message was deleted" in its place.
        toJSON: {
            transform(doc, ret) {
                if (ret.isDeleted) {
                    ret.content = '';
                    ret.fileUrl = null;
                }
                if (ret.replyTo && ret.replyTo.isDeleted) {
                    ret.replyTo.content = '';
                }
                delete ret.deletedFor; // Private to each user
                return ret;
            }
        }
    }
);

// Fields to load for a quoted (replied-to) message
messageSchema.statics.REPLY_POPULATE = {
    path: 'replyTo',
    select: 'content sender isDeleted type',
    populate: { path: 'sender', select: 'username displayName' }
};

// ============================================
// Indexes for Better Performance
// ============================================

// Index for finding messages between two users
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

// Index for finding room messages
messageSchema.index({ room: 1, createdAt: -1 });

// Index for unread messages
messageSchema.index({ receiver: 1, isRead: 1 });

// Index for anonymous messages
messageSchema.index({ anonymousSessionId: 1, createdAt: -1 });

// Compound index for private chat
messageSchema.index({ 
    sender: 1, 
    receiver: 1, 
    room: 1,
    isDeleted: 1,
    createdAt: -1 
});

// ============================================
// Instance Methods
// ============================================

/**
 * Marks message as read
 * @returns {Promise<Message>} - Updated message
 */
messageSchema.methods.markAsRead = async function() {
    // Set isRead to true
    this.isRead = true;
    
    // Set read timestamp
    this.readAt = new Date();
    
    // Save and return
    return await this.save();
};

/**
 * Marks message as delivered
 * @returns {Promise<Message>} - Updated message
 */
messageSchema.methods.markAsDelivered = async function() {
    // Set isDelivered to true
    this.isDelivered = true;
    
    // Set delivered timestamp
    this.deliveredAt = new Date();
    
    // Save and return
    return await this.save();
};

/**
 * Adds a reaction to message
 * @param {String} userId - User ID who reacted
 * @param {String} emoji - Emoji used for reaction
 * @returns {Promise<Message>} - Updated message
 */
messageSchema.methods.addReaction = async function(userId, emoji) {
    // Check if user already reacted with this emoji
    const existingReaction = this.reactions.find(
        r => r.user.toString() === userId.toString() && r.emoji === emoji
    );

    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
        this.reactions = this.reactions.filter(
            r => !(r.user.toString() === userId.toString() && r.emoji === emoji)
        );
    } else {
        // Add new reaction
        this.reactions.push({
            user: userId,
            emoji: emoji
        });
    }

    // Save and return
    return await this.save();
};

// ============================================
// Static Methods
// ============================================

/**
 * Gets messages between two users
 * @param {String} userId1 - First user ID
 * @param {String} userId2 - Second user ID
 * @param {Number} limit - Number of messages to fetch
 * @returns {Promise<Array>} - Array of messages
 */
messageSchema.statics.getPrivateMessages = function(userId1, userId2, limit = 50) {
    return this.find({
        // Find messages where:
        // (sender is user1 and receiver is user2) OR
        // (sender is user2 and receiver is user1)
        $or: [
            { sender: userId1, receiver: userId2 },
            { sender: userId2, receiver: userId1 }
        ],
        deletedFor: { $ne: userId1 }, // Hide messages the viewer deleted for themselves
        room: null // Only private messages (no room)
        // Messages deleted for everyone are kept, their text is hidden by toJSON
    })
    .sort({ createdAt: -1 }) // Sort by newest first
    .limit(limit) // Limit number of results
    .populate('sender', 'username displayName avatar') // Get sender details
    .populate('receiver', 'username displayName avatar') // Get receiver details
    .populate(this.REPLY_POPULATE); // Get replied message details
};

/**
 * Gets unread message count for a user
 * @param {String} userId - User ID
 * @returns {Promise<Number>} - Count of unread messages
 */
messageSchema.statics.getUnreadCount = function(userId) {
    return this.countDocuments({
        receiver: userId, // Messages received by user
        isRead: false, // Not read yet
        isDeleted: false // Not deleted
    });
};

/**
 * Marks all messages as read between two users
 * @param {String} senderId - Sender user ID
 * @param {String} receiverId - Receiver user ID
 * @returns {Promise<Object>} - Update result
 */
messageSchema.statics.markAllAsRead = function(senderId, receiverId) {
    return this.updateMany(
        {
            sender: senderId,
            receiver: receiverId,
            isRead: false
        },
        {
            isRead: true,
            readAt: new Date()
        }
    );
};

// ============================================
// Create and Export Model
// ============================================

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
