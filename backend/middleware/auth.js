// ============================================
// Authentication Middleware
// ============================================

// This middleware protects routes by verifying JWT tokens

// Import User model
const User = require('../models/User');

// Import JWT utilities
const { verifyToken, getTokenFromHeader } = require('../config/jwt');

// ============================================
// Protect Middleware - Requires Authentication
// ============================================

/**
 * Middleware to protect routes - requires valid JWT token
 * Usage: Add to any route that requires authentication
 * Example: router.get('/profile', protect, getProfile)
 */
const protect = async (req, res, next) => {
    try {
        // Step 1: Get token from Authorization header
        // Format: "Authorization: Bearer <token>"
        const token = getTokenFromHeader(req);

        // Check if token exists
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized. Please login to access this route.'
            });
        }

        // Step 2: Verify token
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token. Please login again.'
            });
        }

        // Step 3: Get user from database using ID from token
        // decoded.id contains the user ID we stored when creating token
        const user = await User.findById(decoded.id).select('-password');

        // Check if user exists
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found. Token may be invalid.'
            });
        }

        // Check if user account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Step 4: Attach user to request object
        // Now we can access req.user in the route handler
        req.user = user;

        // Continue to next middleware or route handler
        next();

    } catch (error) {
        // Handle any unexpected errors
        console.error('Auth Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed. Please try again.'
        });
    }
};

// ============================================
// Optional Auth Middleware
// ============================================

/**
 * Middleware that attaches user if token is provided, but doesn't require it
 * Useful for routes that work differently for logged in vs guest users
 * Example: Public pages that show extra features for logged in users
 */
const optionalAuth = async (req, res, next) => {
    try {
        // Get token from header
        const token = getTokenFromHeader(req);

        // If no token, continue without user
        if (!token) {
            req.user = null;
            return next();
        }

        // Try to verify token
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            // If token is invalid, continue without user
            req.user = null;
            return next();
        }

        // Get user from database
        const user = await User.findById(decoded.id).select('-password');

        // Attach user if found and active
        if (user && user.isActive) {
            req.user = user;
        } else {
            req.user = null;
        }

        // Continue to next middleware
        next();

    } catch (error) {
        // On error, continue without user
        console.error('Optional Auth Error:', error);
        req.user = null;
        next();
    }
};

// ============================================
// Premium Middleware - Requires Premium Subscription
// ============================================

/**
 * Middleware to check if user has active premium subscription
 * Use after protect middleware
 * Example: router.get('/premium-feature', protect, requirePremium, handler)
 */
const requirePremium = async (req, res, next) => {
    try {
        // Check if user is authenticated (protect middleware should run first)
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        // Check if user has premium
        if (!req.user.isPremium) {
            return res.status(403).json({
                success: false,
                message: 'This feature requires a premium subscription.',
                upgradeUrl: '/premium'
            });
        }

        // Check if premium subscription is still active
        if (!req.user.isPremiumActive()) {
            return res.status(403).json({
                success: false,
                message: 'Your premium subscription has expired. Please renew.',
                upgradeUrl: '/premium'
            });
        }

        // User has active premium, continue
        next();

    } catch (error) {
        console.error('Premium Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying premium status.'
        });
    }
};

// ============================================
// Admin Middleware - Requires Admin Role
// ============================================

/**
 * Middleware to check if user is an admin
 * Use after protect middleware
 * Note: You can extend User model to add isAdmin field if needed
 */
const requireAdmin = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        // Check if user is admin
        // For now, we'll check if email matches admin email from .env
        const isAdmin = req.user.email === process.env.ADMIN_EMAIL;

        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }

        // User is admin, continue
        next();

    } catch (error) {
        console.error('Admin Middleware Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying admin status.'
        });
    }
};

// ============================================
// Export Middleware Functions
// ============================================

module.exports = {
    protect,
    optionalAuth,
    requirePremium,
    requireAdmin
};
