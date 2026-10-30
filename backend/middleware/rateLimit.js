// ============================================
// Rate Limit Middleware
// ============================================
// Slows down password guessing and mass signups from one IP address.

const { createRateLimiter } = require('../stranger/rateLimiter');

const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 20;

// AUTH_RATE_LIMIT attempts per IP every 10 minutes (login + register together)
const authLimiter = createRateLimiter({ max: AUTH_RATE_LIMIT, windowMs: 10 * 60 * 1000 });

const authRateLimit = (req, res, next) => {
    if (authLimiter.hit(req.ip)) return next();
    res.status(429).json({
        success: false,
        message: 'Too many attempts. Try again in a few minutes.'
    });
};

module.exports = { authRateLimit };
