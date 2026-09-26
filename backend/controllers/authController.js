// ============================================
// Authentication Controller
// ============================================

// This file handles all authentication-related logic

// Import User model
const User = require('../models/User');

// Import JWT utility
const { generateToken } = require('../config/jwt');

// ============================================
// Register New User
// ============================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = async (req, res) => {
    try {
        // Step 1: Extract data from request body
        const { username, email, password, displayName } = req.body;

        // Step 2: Check if user already exists with same email
        const existingUserByEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingUserByEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email is already registered'
            });
        }

        // Step 3: Check if username is already taken
        const existingUserByUsername = await User.findOne({ username });
        if (existingUserByUsername) {
            return res.status(400).json({
                success: false,
                message: 'Username is already taken'
            });
        }

        // Step 4: Create new user
        // Password will be automatically hashed by the pre-save middleware in User model
        const user = await User.create({
            username,
            email: email.toLowerCase(),
            password,
            displayName: displayName || username, // Use username if displayName not provided
            avatar: `https://ui-avatars.com/api/?background=random&name=${username}` // Generate avatar
        });

        // Step 5: Generate JWT token for the user
        const token = generateToken(user._id);

        // Step 6: Get user object without sensitive information
        const safeUser = user.toSafeObject();

        // Step 7: Send success response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: safeUser,
                token
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Register Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user',
            error: error.message
        });
    }
};

// ============================================
// Login User
// ============================================

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
const login = async (req, res) => {
    try {
        // Step 1: Extract credentials from request body
        const { identifier, password } = req.body;
        // identifier can be either email or username

        // Step 2: Find user by email or username
        const user = await User.findByIdentifier(identifier);

        // Check if user exists
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Step 3: Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Step 4: Verify password
        const isPasswordCorrect = await user.comparePassword(password);
        
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Step 5: Generate JWT token
        const token = generateToken(user._id);

        // Step 6: Update user's last seen
        user.lastSeen = new Date();
        await user.save();

        // Step 7: Get user object without sensitive information
        const safeUser = user.toSafeObject();

        // Step 8: Send success response
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: safeUser,
                token
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};

// ============================================
// Get Current User
// ============================================

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
const getCurrentUser = async (req, res) => {
    try {
        // req.user is set by protect middleware
        // It already contains user data without password
        
        // Get fresh user data from database
        const user = await User.findById(req.user._id).select('-password');

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
        console.error('Get Current User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user data',
            error: error.message
        });
    }
};

// ============================================
// Logout User
// ============================================

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (mainly for updating status)
 * @access  Private
 */
const logout = async (req, res) => {
    try {
        // Update user's online status to false
        await User.findByIdAndUpdate(req.user._id, {
            isOnline: false,
            lastSeen: new Date(),
            socketId: null
        });

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Logout Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging out',
            error: error.message
        });
    }
};

// ============================================
// Change Password
// ============================================

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
const changePassword = async (req, res) => {
    try {
        // Step 1: Extract passwords from request
        const { currentPassword, newPassword } = req.body;

        // Step 2: Get user with password field
        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Step 3: Verify current password
        const isPasswordCorrect = await user.comparePassword(currentPassword);
        
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Step 4: Update password
        // Password will be automatically hashed by pre-save middleware
        user.password = newPassword;
        await user.save();

        // Step 5: Send success response
        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        // Handle errors
        console.error('Change Password Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password',
            error: error.message
        });
    }
};

// ============================================
// Verify Token
// ============================================

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if token is valid
 * @access  Public
 */
const verifyTokenRoute = async (req, res) => {
    try {
        // If we reach here, token is valid (protect middleware verified it)
        res.status(200).json({
            success: true,
            message: 'Token is valid',
            data: {
                user: req.user.toSafeObject()
            }
        });

    } catch (error) {
        // Handle errors
        console.error('Verify Token Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying token',
            error: error.message
        });
    }
};

// ============================================
// Export Controller Functions
// ============================================

module.exports = {
    register,
    login,
    getCurrentUser,
    logout,
    changePassword,
    verifyTokenRoute
};
