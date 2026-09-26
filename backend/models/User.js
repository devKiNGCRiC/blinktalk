// ============================================
// User Model - MongoDB Schema
// ============================================

// This file defines the structure of User documents in MongoDB

// Import mongoose for MongoDB operations
const mongoose = require('mongoose');

// Import bcryptjs for password hashing
const bcrypt = require('bcryptjs');

// ============================================
// Create User Schema
// ============================================

// Schema defines the structure of documents in a collection
const userSchema = new mongoose.Schema(
    {
        // Username - unique identifier for the user
        username: {
            type: String, // Data type
            required: [true, 'Username is required'], // Required with custom error message
            unique: true, // Must be unique across all users
            trim: true, // Remove whitespace from both ends
            minlength: [3, 'Username must be at least 3 characters'], // Minimum length
            maxlength: [30, 'Username must not exceed 30 characters'] // Maximum length
        },

        // Email - for authentication and communication
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true, // Each email can only be used once
            lowercase: true, // Convert to lowercase before saving
            trim: true,
            // Regular expression to validate email format
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email'
            ]
        },

        // Password - hashed before storing
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
            select: false // Don't return password by default in queries
        },

        // Display name - shown to other users
        displayName: {
            type: String,
            trim: true,
            maxlength: [50, 'Display name must not exceed 50 characters']
        },

        // Avatar URL - profile picture
        avatar: {
            type: String,
            default: 'https://ui-avatars.com/api/?background=random&name=User' // Default avatar
        },

        // Bio - user description
        bio: {
            type: String,
            maxlength: [200, 'Bio must not exceed 200 characters'],
            default: 'Hey there! I am using BlinkTalk.'
        },

        // Online status - is user currently active
        isOnline: {
            type: Boolean,
            default: false // User is offline by default
        },

        // Last seen - when user was last active
        lastSeen: {
            type: Date,
            default: Date.now // Current timestamp
        },

        // Premium status - is user subscribed to premium
        isPremium: {
            type: Boolean,
            default: false // Free user by default
        },

        // Premium expiry date
        premiumExpiresAt: {
            type: Date,
            default: null // null means not premium
        },

        // User preferences
        preferences: {
            // Notification settings
            notifications: {
                type: Boolean,
                default: true
            },
            
            // Sound effects
            sounds: {
                type: Boolean,
                default: true
            },
            
            // Theme preference
            theme: {
                type: String,
                enum: ['light', 'dark', 'auto'], // Allowed values
                default: 'auto'
            }
        },

        // Blocked users - array of user IDs
        blockedUsers: [{
            type: mongoose.Schema.Types.ObjectId, // Reference to other users
            ref: 'User' // Reference the User model
        }],

        // Account status
        isActive: {
            type: Boolean,
            default: true // Account is active by default
        },

        // Email verification
        isEmailVerified: {
            type: Boolean,
            default: false
        },

        // Socket ID for real-time communication
        socketId: {
            type: String,
            default: null
        }
    },
    {
        // Add createdAt and updatedAt timestamps automatically
        timestamps: true
    }
);

// ============================================
// Pre-save Middleware - Hash Password
// ============================================

// This runs before saving a user document
userSchema.pre('save', async function(next) {
    // 'this' refers to the user document being saved
    
    // Only hash password if it's new or modified
    if (!this.isModified('password')) {
        // If password wasn't changed, skip hashing
        return next();
    }

    try {
        // Generate salt - random string for hashing
        // 10 is the number of rounds (higher = more secure but slower)
        const salt = await bcrypt.genSalt(10);

        // Hash the password with the salt
        this.password = await bcrypt.hash(this.password, salt);

        // Continue to save
        next();

    } catch (error) {
        // If hashing fails, pass error to next middleware
        next(error);
    }
});

// ============================================
// Instance Methods
// ============================================

/**
 * Compares provided password with user's hashed password
 * @param {String} candidatePassword - Password to check
 * @returns {Promise<Boolean>} - true if passwords match
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
    // bcrypt.compare() hashes candidatePassword and compares with stored hash
    return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Checks if user's premium subscription is active
 * @returns {Boolean} - true if premium is active
 */
userSchema.methods.isPremiumActive = function() {
    // Check if user is premium and subscription hasn't expired
    if (!this.isPremium || !this.premiumExpiresAt) {
        return false;
    }

    // Compare expiry date with current date
    return this.premiumExpiresAt > new Date();
};

/**
 * Returns user object without sensitive information
 * @returns {Object} - Safe user object
 */
userSchema.methods.toSafeObject = function() {
    // Convert mongoose document to plain JavaScript object
    const user = this.toObject();

    // Remove sensitive fields
    delete user.password;
    delete user.blockedUsers;
    delete user.__v; // Version key

    return user;
};

// ============================================
// Static Methods
// ============================================

/**
 * Finds user by email or username
 * @param {String} identifier - Email or username
 * @returns {Promise<User>} - User document
 */
userSchema.statics.findByIdentifier = function(identifier) {
    // Search by email or username
    return this.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier }
        ]
    }).select('+password'); // Include password field
};

// ============================================
// Indexes for Better Performance
// ============================================

// Note: email and username are already indexed by their `unique: true` option

// Create compound index for online users
userSchema.index({ isOnline: 1, lastSeen: -1 });

// ============================================
// Create and Export Model
// ============================================

// Create User model from schema
// First argument is model name (will create 'users' collection)
// Second argument is the schema
const User = mongoose.model('User', userSchema);

// Export the model
module.exports = User;
