// ============================================
// Import Required Modules
// ============================================

// Express - Web framework for Node.js to handle HTTP requests
const express = require('express');

// HTTP - Node.js built-in module to create HTTP server
const http = require('http');

// Socket.io - Library for real-time, bidirectional communication
const socketIo = require('socket.io');

// Mongoose - MongoDB object modeling tool
const mongoose = require('mongoose');

// CORS - Middleware to enable Cross-Origin Resource Sharing
const cors = require('cors');

// Dotenv - Load environment variables from .env file
const dotenv = require('dotenv');

// Path - Node.js built-in module for file/directory paths
const path = require('path');

// ============================================
// Load Environment Variables
// ============================================
// This loads all variables from .env file into process.env
dotenv.config();

// ============================================
// Initialize Express Application
// ============================================
const app = express();

// Create HTTP server using Express app
const server = http.createServer(app);

// Initialize Socket.io with the HTTP server
// CORS settings allow frontend to connect from different origin
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*', // Allow frontend URL or all origins
        methods: ['GET', 'POST'], // Allowed HTTP methods
        credentials: true // Allow credentials (cookies, authorization headers)
    }
});

// ============================================
// Middleware Setup
// ============================================

// CORS middleware - allows frontend to make requests to backend
app.use(cors());

// Body parser middleware - parses incoming JSON requests
// This allows us to access req.body in our routes
app.use(express.json());

// Body parser for URL-encoded data (form submissions)
app.use(express.urlencoded({ extended: true }));

// Serve the built React app (created by `npm run build` in client/dist)
const CLIENT_DIST = path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));

// ============================================
// Database Connection
// ============================================

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blinktalk';

// Connect to MongoDB database
mongoose.connect(MONGODB_URI)
    .then(() => {
        // Success callback - connection established
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch((error) => {
        // Error callback - connection failed
        console.error('❌ MongoDB Connection Error:', error.message);
        // Exit the application if database connection fails
        process.exit(1);
    });

// ============================================
// Import Routes
// ============================================

// Authentication routes (login, signup, etc.)
const authRoutes = require('./routes/authRoutes');

// User routes (profile, settings, etc.)
const userRoutes = require('./routes/userRoutes');

// Message routes (send, get messages, etc.)
const messageRoutes = require('./routes/messageRoutes');

// Room/Group routes (create, join rooms)
const roomRoutes = require('./routes/roomRoutes');

// ============================================
// API Routes
// ============================================

// Base route - API health check
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'BlinkTalk API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Mount route handlers
// All authentication routes will be prefixed with /api/auth
app.use('/api/auth', authRoutes);

// All user routes will be prefixed with /api/users
app.use('/api/users', userRoutes);

// All message routes will be prefixed with /api/messages
app.use('/api/messages', messageRoutes);

// All room routes will be prefixed with /api/rooms
app.use('/api/rooms', roomRoutes);

// ============================================
// Socket.io Configuration
// ============================================

// Import socket handlers
const socketHandler = require('./socket/socketHandler');

// Initialize socket handlers with io instance
socketHandler(io);

// ============================================
// Serve Frontend
// ============================================

// Unknown API routes return JSON 404 (not the web page)
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'API route not found' });
});

// Catch-all route - serves the React app's index.html for any other route
// This enables client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (error) => {
        if (error) {
            // The React app hasn't been built yet
            res.status(404).send('Frontend not built. Run `npm run build`, or use `npm run dev` during development.');
        }
    });
});

// ============================================
// Error Handling Middleware
// ============================================

// Global error handler - catches all errors
app.use((err, req, res, next) => {
    // Log error to console
    console.error('Error:', err.stack);
    
    // Send error response to client
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        // Only send error stack in development mode
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================
// Start Server
// ============================================

// Get port from environment variables or use default 5000
const PORT = process.env.PORT || 5000;

// Start the server and listen on specified port
server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 BlinkTalk Server Started Successfully!');
    console.log('='.repeat(50));
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
    console.log('='.repeat(50));
});

// ============================================
// Graceful Shutdown
// ============================================

// Handle CTRL+C (SIGINT signal)
process.on('SIGINT', gracefulShutdown);

// Handle kill command (SIGTERM signal)
process.on('SIGTERM', gracefulShutdown);

// Graceful shutdown function
function gracefulShutdown() {
    console.log('\n⚠️  Shutting down gracefully...');
    
    // Close server
    server.close(() => {
        console.log('🔴 Server closed');
        
        // Close database connection (Mongoose 7+ returns a promise, no callback)
        mongoose.connection.close(false).then(() => {
            console.log('🔴 MongoDB connection closed');
            // Exit process
            process.exit(0);
        });
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('⚠️  Forcing shutdown...');
        process.exit(1);
    }, 10000);
}

// Export app for testing purposes
module.exports = { app, server, io };
