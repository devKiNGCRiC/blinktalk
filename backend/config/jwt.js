// ============================================
// JWT Configuration
// ============================================

// This file handles JSON Web Token creation and verification

// Import jsonwebtoken library
const jwt = require('jsonwebtoken');

// ============================================
// Generate JWT Token
// ============================================

/**
 * Generates a JWT token for a user
 * @param {String} userId - User's MongoDB _id
 * @returns {String} - Generated JWT token
 */
const generateToken = (userId) => {
    // Create JWT token with user ID as payload
    // jwt.sign() takes 3 arguments:
    // 1. Payload - data to encode in token (user ID)
    // 2. Secret key - used to sign the token
    // 3. Options - token expiration time
    const token = jwt.sign(
        { id: userId }, // Payload - contains user ID
        process.env.JWT_SECRET, // Secret key from environment variables
        { expiresIn: process.env.JWT_EXPIRE || '7d' } // Token expires in 7 days
    );

    // Return the generated token
    return token;
};

// ============================================
// Verify JWT Token
// ============================================

/**
 * Verifies if a JWT token is valid
 * @param {String} token - JWT token to verify
 * @returns {Object} - Decoded token payload if valid
 * @throws {Error} - If token is invalid or expired
 */
const verifyToken = (token) => {
    try {
        // Verify and decode the token
        // jwt.verify() will throw an error if:
        // - Token is expired
        // - Token signature is invalid
        // - Token is malformed
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Return decoded payload (contains user ID)
        return decoded;

    } catch (error) {
        // If verification fails, throw error
        throw new Error('Invalid or expired token');
    }
};

// ============================================
// Decode JWT Token (without verification)
// ============================================

/**
 * Decodes a JWT token without verifying signature
 * Useful for reading token data without authentication
 * @param {String} token - JWT token to decode
 * @returns {Object} - Decoded token payload
 */
const decodeToken = (token) => {
    // Decode token without verifying
    // This doesn't check if token is valid or expired
    // Use only when you need to read token data without authentication
    const decoded = jwt.decode(token);
    
    return decoded;
};

// ============================================
// Get Token from Request Header
// ============================================

/**
 * Extracts JWT token from Authorization header
 * @param {Object} req - Express request object
 * @returns {String|null} - Token if found, null otherwise
 */
const getTokenFromHeader = (req) => {
    // Get Authorization header
    // Format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists and starts with "Bearer "
    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Extract token by removing "Bearer " prefix
        // Example: "Bearer abc123" -> "abc123"
        const token = authHeader.substring(7);
        return token;
    }

    // Return null if no valid token found
    return null;
};

// ============================================
// Check if Token is Expired
// ============================================

/**
 * Checks if a JWT token is expired
 * @param {String} token - JWT token to check
 * @returns {Boolean} - true if expired, false otherwise
 */
const isTokenExpired = (token) => {
    try {
        // Decode token to get expiration time
        const decoded = jwt.decode(token);

        // Check if token has expiration time
        if (!decoded || !decoded.exp) {
            return true; // Consider as expired if no exp field
        }

        // Get current time in seconds
        const currentTime = Math.floor(Date.now() / 1000);

        // Compare expiration time with current time
        // exp is in seconds since epoch
        return decoded.exp < currentTime;

    } catch (error) {
        // If any error occurs, consider token as expired
        return true;
    }
};

// ============================================
// Export Functions
// ============================================

module.exports = {
    generateToken,
    verifyToken,
    decodeToken,
    getTokenFromHeader,
    isTokenExpired
};
