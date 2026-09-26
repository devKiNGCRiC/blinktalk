// ============================================
// Database Configuration
// ============================================

// This file contains database configuration and helper functions

// Import mongoose for MongoDB operations
const mongoose = require('mongoose');

// ============================================
// Database Connection Function
// ============================================

/**
 * Connects to MongoDB database
 * @returns {Promise} - Promise that resolves when connected
 */
const connectDB = async () => {
    try {
        // Connection options for MongoDB
        const options = {
            // Use new URL parser
            useNewUrlParser: true,
            
            // Use new Server Discovery and Monitoring engine
            useUnifiedTopology: true,
            
            // Set connection timeout to 10 seconds
            serverSelectionTimeoutMS: 10000,
            
            // Set socket timeout to 45 seconds
            socketTimeoutMS: 45000,
        };

        // Connect to MongoDB with options
        const conn = await mongoose.connect(process.env.MONGODB_URI, options);

        // Log successful connection
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database Name: ${conn.connection.name}`);

        // Return connection object
        return conn;

    } catch (error) {
        // Log error if connection fails
        console.error('❌ MongoDB Connection Error:', error.message);
        
        // Exit process with failure code
        process.exit(1);
    }
};

// ============================================
// Database Event Listeners
// ============================================

// Listen for connection errors after initial connection
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Connection Error:', err);
});

// Listen for disconnection events
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB Disconnected');
});

// Listen for reconnection events
mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB Reconnected');
});

// ============================================
// Database Health Check Function
// ============================================

/**
 * Checks if database connection is healthy
 * @returns {Object} - Health status object
 */
const checkDBHealth = () => {
    // Get current connection state
    const state = mongoose.connection.readyState;
    
    // Connection states:
    // 0 = disconnected
    // 1 = connected
    // 2 = connecting
    // 3 = disconnecting
    
    const states = {
        0: 'Disconnected',
        1: 'Connected',
        2: 'Connecting',
        3: 'Disconnecting'
    };

    return {
        status: states[state],
        isHealthy: state === 1,
        database: mongoose.connection.name,
        host: mongoose.connection.host
    };
};

// ============================================
// Export Functions
// ============================================

module.exports = {
    connectDB,
    checkDBHealth
};
