// ============================================
// Validation Middleware
// ============================================

// This file contains validation functions for request data

// Import express-validator functions
const { body, validationResult } = require('express-validator');

// ============================================
// Handle Validation Errors
// ============================================

/**
 * Middleware to check validation results and return errors
 * Use after validation rules
 */
const handleValidationErrors = (req, res, next) => {
    // Get validation errors from request
    const errors = validationResult(req);

    // If there are no errors, continue
    if (errors.isEmpty()) {
        return next();
    }

    // Extract error messages
    const errorMessages = errors.array().map(err => ({
        field: err.path,
        message: err.msg
    }));

    // Return validation errors
    return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
    });
};

// ============================================
// User Registration Validation Rules
// ============================================

/**
 * Validation rules for user registration
 */
const validateRegistration = [
    // Validate username
    body('username')
        .trim() // Remove whitespace
        .notEmpty().withMessage('Username is required') // Check if empty
        .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters') // Check length
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'), // Check format

    // Validate email
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email')
        // Convert to lowercase but keep dots, so login with the same email still matches
        .normalizeEmail({ gmail_remove_dots: false }),

    // Validate password
    body('password')
        .trim()
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

    // Validate confirm password
    body('confirmPassword')
        .trim()
        .notEmpty().withMessage('Please confirm your password')
        .custom((value, { req }) => {
            // Check if password matches confirmPassword
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// User Login Validation Rules
// ============================================

/**
 * Validation rules for user login
 */
const validateLogin = [
    // Validate identifier (email or username)
    body('identifier')
        .trim()
        .notEmpty().withMessage('Email or username is required'),

    // Validate password
    body('password')
        .trim()
        .notEmpty().withMessage('Password is required'),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// Profile Update Validation Rules
// ============================================

/**
 * Validation rules for updating user profile
 */
const validateProfileUpdate = [
    // Validate display name (optional)
    body('displayName')
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage('Display name must not exceed 50 characters'),

    // Validate bio (optional)
    body('bio')
        .optional()
        .trim()
        .isLength({ max: 200 }).withMessage('Bio must not exceed 200 characters'),

    // Validate avatar URL (optional)
    body('avatar')
        .optional()
        .trim()
        .isURL().withMessage('Please provide a valid avatar URL'),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// Message Validation Rules
// ============================================

/**
 * Validation rules for sending a message
 */
const validateMessage = [
    // Validate content
    body('content')
        .trim()
        .notEmpty().withMessage('Message content is required')
        .isLength({ max: 5000 }).withMessage('Message must not exceed 5000 characters'),

    // Validate receiver (optional - not needed for room messages)
    body('receiver')
        .optional()
        .trim()
        .isMongoId().withMessage('Invalid receiver ID'),

    // Validate room (optional - not needed for private messages)
    body('room')
        .optional()
        .trim()
        .isMongoId().withMessage('Invalid room ID'),

    // Validate type (optional)
    body('type')
        .optional()
        .isIn(['text', 'image', 'file', 'audio', 'video', 'system'])
        .withMessage('Invalid message type'),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// Room Creation Validation Rules
// ============================================

/**
 * Validation rules for creating a room
 */
const validateRoomCreation = [
    // Validate room name
    body('name')
        .trim()
        .notEmpty().withMessage('Room name is required')
        .isLength({ min: 3, max: 50 }).withMessage('Room name must be 3-50 characters'),

    // Validate description (optional)
    body('description')
        .optional()
        .trim()
        .isLength({ max: 200 }).withMessage('Description must not exceed 200 characters'),

    // Validate type (optional)
    body('type')
        .optional()
        .isIn(['public', 'private'])
        .withMessage('Room type must be either public or private'),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// Password Change Validation Rules
// ============================================

/**
 * Validation rules for changing password
 */
const validatePasswordChange = [
    // Validate current password
    body('currentPassword')
        .trim()
        .notEmpty().withMessage('Current password is required'),

    // Validate new password
    body('newPassword')
        .trim()
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

    // Validate confirm new password
    body('confirmNewPassword')
        .trim()
        .notEmpty().withMessage('Please confirm your new password')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    // Handle validation errors
    handleValidationErrors
];

// ============================================
// Export Validation Functions
// ============================================

module.exports = {
    validateRegistration,
    validateLogin,
    validateProfileUpdate,
    validateMessage,
    validateRoomCreation,
    validatePasswordChange,
    handleValidationErrors
};
