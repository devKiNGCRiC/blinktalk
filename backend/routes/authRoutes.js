// ============================================
// Authentication Routes
// ============================================

// This file defines all authentication-related routes

// Import Express Router
const express = require('express');
const router = express.Router();

// Import controllers
const {
    register,
    login,
    getCurrentUser,
    logout,
    changePassword,
    verifyTokenRoute
} = require('../controllers/authController');

// Import middleware
const { protect } = require('../middleware/auth');
const {
    validateRegistration,
    validateLogin,
    validatePasswordChange
} = require('../middleware/validation');

// ============================================
// Route Definitions
// ============================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * Flow: Request -> Validation -> Controller
 */
router.post('/register', validateRegistration, register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 * Flow: Request -> Validation -> Controller
 */
router.post('/login', validateLogin, login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 * Flow: Request -> Auth Middleware -> Controller
 */
router.get('/me', protect, getCurrentUser);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 * Flow: Request -> Auth Middleware -> Controller
 */
router.post('/logout', protect, logout);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 * Flow: Request -> Auth Middleware -> Validation -> Controller
 */
router.post('/change-password', protect, validatePasswordChange, changePassword);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if token is valid
 * @access  Private
 * Flow: Request -> Auth Middleware -> Controller
 */
router.get('/verify', protect, verifyTokenRoute);

// ============================================
// Export Router
// ============================================

module.exports = router;
