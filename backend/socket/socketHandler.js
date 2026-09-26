// ============================================
// Socket.io Handler
// ============================================

// This file handles all real-time Socket.io events
// Manages: Private messaging, group chat, typing indicators, anonymous stranger chat

// Import models
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');

// Import UUID for anonymous sessions
const { v4: uuidv4 } = require('uuid');

// Import JWT verification for socket authentication
const { verifyToken } = require('../config/jwt');

// Store for anonymous stranger chat matching
// Format: { sessionId: { socketId, interests, partnerId, isSearching } }
const anonymousUsers = new Map();

// Store waiting users looking for strangers
const waitingQueue = [];

// ============================================
// Main Socket Handler Function
// ============================================

/**
 * Initialize Socket.io event handlers
 * @param {Object} io - Socket.io server instance
 */
module.exports = (io) => {
    
    // ============================================
    // Connection Event - User Connects
    // ============================================
    
    io.on('connection', (socket) => {
        console.log(`🔌 New connection: ${socket.id}`);

        // ============================================
        // User Authentication & Setup
        // ============================================

        /**
         * Event: user:authenticate
         * Description: Authenticate user and setup their socket
         * Data: { token } - the JWT received at login
         */
        socket.on('user:authenticate', async (data) => {
            try {
                // Verify the JWT instead of trusting a user ID sent by the client,
                // otherwise anyone could impersonate any user
                let userId;
                try {
                    userId = verifyToken(data && data.token).id;
                } catch (error) {
                    return socket.emit('error', { message: 'Authentication failed' });
                }

                // Update user's online status and socket ID
                await User.findByIdAndUpdate(userId, {
                    isOnline: true,
                    socketId: socket.id,
                    lastSeen: new Date()
                });

                // Store user ID in socket for later use
                socket.userId = userId;

                // Join user's personal room for notifications
                socket.join(`user:${userId}`);

                console.log(`✅ User ${userId} authenticated with socket ${socket.id}`);

                // Broadcast to all users that this user is online
                socket.broadcast.emit('user:online', { userId });

                // Send success response
                socket.emit('user:authenticated', { 
                    success: true,
                    message: 'Authenticated successfully' 
                });

            } catch (error) {
                console.error('Authentication Error:', error);
                socket.emit('error', { message: 'Authentication failed' });
            }
        });

        // ============================================
        // Private Messaging
        // ============================================

        /**
         * Event: message:private
         * Description: Send a private message to another user
         * Data: { receiverId, content, type, fileUrl, fileName, fileSize }
         */
        socket.on('message:private', async (data) => {
            try {
                const { receiverId, content, type, fileUrl, fileName, fileSize, replyTo } = data;

                // Get sender from authenticated socket
                if (!socket.userId) {
                    return socket.emit('error', { message: 'Not authenticated' });
                }

                // Create message in database
                const message = await Message.create({
                    sender: socket.userId,
                    receiver: receiverId,
                    content,
                    type: type || 'text',
                    fileUrl: fileUrl || null,
                    fileName: fileName || null,
                    fileSize: fileSize || null,
                    replyTo: replyTo || null
                });

                // Populate message details
                await message.populate('sender', 'username displayName avatar');
                await message.populate('receiver', 'username displayName avatar');

                // Send message to receiver if they're online
                io.to(`user:${receiverId}`).emit('message:received', message);

                // Send confirmation to sender
                socket.emit('message:sent', message);

                // Mark as delivered if receiver is online
                const receiver = await User.findById(receiverId);
                if (receiver && receiver.isOnline) {
                    message.isDelivered = true;
                    message.deliveredAt = new Date();
                    await message.save();

                    // Notify both users about delivery
                    io.to(`user:${receiverId}`).emit('message:delivered', { messageId: message._id });
                    socket.emit('message:delivered', { messageId: message._id });
                }

                console.log(`📨 Private message from ${socket.userId} to ${receiverId}`);

            } catch (error) {
                console.error('Private Message Error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Event: message:read
         * Description: Mark message as read
         * Data: { messageId }
         */
        socket.on('message:read', async (data) => {
            try {
                const { messageId } = data;

                // Find and update message
                const message = await Message.findById(messageId);
                
                if (message) {
                    await message.markAsRead();

                    // Notify sender that message was read
                    io.to(`user:${message.sender}`).emit('message:read:confirm', {
                        messageId: message._id,
                        readAt: message.readAt
                    });
                }

            } catch (error) {
                console.error('Mark Read Error:', error);
            }
        });

        // ============================================
        // Typing Indicators
        // ============================================

        /**
         * Event: typing:start
         * Description: User started typing
         * Data: { receiverId } or { roomId }
         */
        socket.on('typing:start', async (data) => {
            try {
                const { receiverId, roomId } = data;

                if (!socket.userId) return;

                // Get user details
                const user = await User.findById(socket.userId).select('username displayName');

                if (receiverId) {
                    // Private chat typing
                    io.to(`user:${receiverId}`).emit('typing:start', {
                        userId: socket.userId,
                        username: user.username
                    });
                } else if (roomId) {
                    // Room typing
                    socket.to(`room:${roomId}`).emit('typing:start', {
                        userId: socket.userId,
                        username: user.username,
                        roomId
                    });
                }

            } catch (error) {
                console.error('Typing Start Error:', error);
            }
        });

        /**
         * Event: typing:stop
         * Description: User stopped typing
         * Data: { receiverId } or { roomId }
         */
        socket.on('typing:stop', (data) => {
            try {
                const { receiverId, roomId } = data;

                if (!socket.userId) return;

                if (receiverId) {
                    // Private chat
                    io.to(`user:${receiverId}`).emit('typing:stop', {
                        userId: socket.userId
                    });
                } else if (roomId) {
                    // Room
                    socket.to(`room:${roomId}`).emit('typing:stop', {
                        userId: socket.userId,
                        roomId
                    });
                }

            } catch (error) {
                console.error('Typing Stop Error:', error);
            }
        });

        // ============================================
        // Room/Group Chat
        // ============================================

        /**
         * Event: room:join
         * Description: Join a room for real-time updates
         * Data: { roomId }
         */
        socket.on('room:join', async (data) => {
            try {
                const { roomId } = data;

                if (!socket.userId) {
                    return socket.emit('error', { message: 'Not authenticated' });
                }

                // Check if user is member of the room
                const room = await Room.findById(roomId);
                
                if (!room || !room.isMember(socket.userId)) {
                    return socket.emit('error', { message: 'Not authorized to join this room' });
                }

                // Join socket room
                socket.join(`room:${roomId}`);

                // Notify room members
                socket.to(`room:${roomId}`).emit('room:user:joined', {
                    userId: socket.userId,
                    roomId
                });

                console.log(`🚪 User ${socket.userId} joined room ${roomId}`);

            } catch (error) {
                console.error('Room Join Error:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        /**
         * Event: room:leave
         * Description: Leave a room
         * Data: { roomId }
         */
        socket.on('room:leave', (data) => {
            try {
                const { roomId } = data;

                // Leave socket room
                socket.leave(`room:${roomId}`);

                // Notify room members
                socket.to(`room:${roomId}`).emit('room:user:left', {
                    userId: socket.userId,
                    roomId
                });

                console.log(`🚪 User ${socket.userId} left room ${roomId}`);

            } catch (error) {
                console.error('Room Leave Error:', error);
            }
        });

        /**
         * Event: message:room
         * Description: Send a message to a room
         * Data: { roomId, content, type, fileUrl, fileName, fileSize }
         */
        socket.on('message:room', async (data) => {
            try {
                const { roomId, content, type, fileUrl, fileName, fileSize } = data;

                if (!socket.userId) {
                    return socket.emit('error', { message: 'Not authenticated' });
                }

                // Check if user is member
                const room = await Room.findById(roomId);
                if (!room || !room.isMember(socket.userId)) {
                    return socket.emit('error', { message: 'Not authorized' });
                }

                // Create message
                const message = await Message.create({
                    sender: socket.userId,
                    room: roomId,
                    content,
                    type: type || 'text',
                    fileUrl: fileUrl || null,
                    fileName: fileName || null,
                    fileSize: fileSize || null
                });

                // Populate sender details
                await message.populate('sender', 'username displayName avatar');

                // Update room's last message
                room.lastMessage = message._id;
                room.stats.messageCount += 1;
                await room.save();

                // Broadcast to all room members
                io.to(`room:${roomId}`).emit('message:room:received', message);

                console.log(`💬 Room message in ${roomId} from ${socket.userId}`);

            } catch (error) {
                console.error('Room Message Error:', error);
                socket.emit('error', { message: 'Failed to send room message' });
            }
        });

        // ============================================
        // Anonymous Stranger Chat (USP Feature!)
        // ============================================

        /**
         * Event: stranger:search
         * Description: Search for a random stranger to chat with
         * Data: { interests } (optional)
         */
        socket.on('stranger:search', (data) => {
            try {
                const { interests } = data || {};

                // Clean up any previous session (e.g. after the last stranger left)
                if (socket.anonymousSessionId) {
                    const oldSessionId = socket.anonymousSessionId;
                    const queueIndex = waitingQueue.indexOf(oldSessionId);
                    if (queueIndex > -1) waitingQueue.splice(queueIndex, 1);
                    anonymousUsers.delete(oldSessionId);
                }

                // Create anonymous session
                const sessionId = uuidv4();
                socket.anonymousSessionId = sessionId;

                // Store anonymous user info
                anonymousUsers.set(sessionId, {
                    socketId: socket.id,
                    interests: interests || [],
                    partnerId: null,
                    isSearching: true,
                    connectedAt: null
                });

                // Try to find a match
                const match = findStrangerMatch(sessionId, interests);

                if (match) {
                    // Match found! Connect both users
                    connectStrangers(socket, match, sessionId);
                } else {
                    // No match, add to waiting queue
                    waitingQueue.push(sessionId);
                    
                    socket.emit('stranger:searching', {
                        sessionId,
                        message: 'Searching for a stranger...'
                    });
                    
                    console.log(`🔍 Stranger ${sessionId} searching...`);
                }

            } catch (error) {
                console.error('Stranger Search Error:', error);
                socket.emit('error', { message: 'Failed to search for stranger' });
            }
        });

        /**
         * Event: stranger:message
         * Description: Send message to connected stranger
         * Data: { content }
         */
        socket.on('stranger:message', async (data) => {
            try {
                const content = typeof data?.content === 'string' ? data.content.trim() : '';
                if (!content) return;

                if (!socket.anonymousSessionId) {
                    return socket.emit('error', { message: 'Not in anonymous chat' });
                }

                const session = anonymousUsers.get(socket.anonymousSessionId);
                
                if (!session || !session.partnerId) {
                    return socket.emit('error', { message: 'No stranger connected' });
                }

                // Create anonymous message in database
                const message = await Message.create({
                    sender: null, // Anonymous, no user
                    receiver: null,
                    content,
                    type: 'text',
                    isAnonymous: true,
                    anonymousSessionId: socket.anonymousSessionId
                });

                // Get partner's session
                const partnerSession = anonymousUsers.get(session.partnerId);

                if (partnerSession) {
                    // Send to partner
                    io.to(partnerSession.socketId).emit('stranger:message', {
                        content,
                        from: 'stranger',
                        timestamp: message.createdAt
                    });

                    // Confirm to sender
                    socket.emit('stranger:message', {
                        content,
                        from: 'you',
                        timestamp: message.createdAt
                    });
                }

                console.log(`💬 Anonymous message in session ${socket.anonymousSessionId}`);

            } catch (error) {
                console.error('Stranger Message Error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Event: stranger:typing
         * Description: Notify stranger that you're typing
         */
        socket.on('stranger:typing', () => {
            try {
                if (!socket.anonymousSessionId) return;

                const session = anonymousUsers.get(socket.anonymousSessionId);
                if (!session || !session.partnerId) return;

                const partnerSession = anonymousUsers.get(session.partnerId);
                if (partnerSession) {
                    io.to(partnerSession.socketId).emit('stranger:typing');
                }

            } catch (error) {
                console.error('Stranger Typing Error:', error);
            }
        });

        /**
         * Event: stranger:disconnect
         * Description: Disconnect from stranger chat
         */
        socket.on('stranger:disconnect', () => {
            handleStrangerDisconnect(socket);
        });

        // ============================================
        // Disconnection Event
        // ============================================

        socket.on('disconnect', async () => {
            try {
                console.log(`🔌 Disconnected: ${socket.id}`);

                // Handle authenticated user disconnect
                if (socket.userId) {
                    // Update user's online status
                    await User.findByIdAndUpdate(socket.userId, {
                        isOnline: false,
                        lastSeen: new Date(),
                        socketId: null
                    });

                    // Broadcast to all users that this user is offline
                    socket.broadcast.emit('user:offline', {
                        userId: socket.userId,
                        lastSeen: new Date()
                    });
                }

                // Handle anonymous user disconnect
                if (socket.anonymousSessionId) {
                    handleStrangerDisconnect(socket);
                }

            } catch (error) {
                console.error('Disconnect Error:', error);
            }
        });

    }); // End of io.on('connection')

    // ============================================
    // Helper Functions
    // ============================================

    /**
     * Find a matching stranger for anonymous chat
     * @param {String} sessionId - Current user's session ID
     * @param {Array} interests - User's interests
     * @returns {String|null} - Matched session ID or null
     */
    function findStrangerMatch(sessionId, interests) {
        // Simple matching: get first person in waiting queue
        // You can enhance this with interest-based matching
        
        for (let i = 0; i < waitingQueue.length; i++) {
            const waitingSessionId = waitingQueue[i];
            
            // Don't match with self
            if (waitingSessionId === sessionId) continue;

            // Check if still searching
            const waitingSession = anonymousUsers.get(waitingSessionId);
            if (!waitingSession || !waitingSession.isSearching) continue;

            // Match found! Remove from queue
            waitingQueue.splice(i, 1);
            return waitingSessionId;
        }

        return null; // No match found
    }

    /**
     * Connect two strangers together
     * @param {Object} socket - Current socket
     * @param {String} partnerSessionId - Partner's session ID
     * @param {String} currentSessionId - Current session ID
     */
    function connectStrangers(socket, partnerSessionId, currentSessionId) {
        const currentSession = anonymousUsers.get(currentSessionId);
        const partnerSession = anonymousUsers.get(partnerSessionId);

        if (!currentSession || !partnerSession) return;

        // Update sessions
        currentSession.partnerId = partnerSessionId;
        currentSession.isSearching = false;
        currentSession.connectedAt = new Date();

        partnerSession.partnerId = currentSessionId;
        partnerSession.isSearching = false;
        partnerSession.connectedAt = new Date();

        // Notify both users
        socket.emit('stranger:connected', {
            sessionId: currentSessionId,
            message: 'Connected to a stranger! Say hi! 👋'
        });

        io.to(partnerSession.socketId).emit('stranger:connected', {
            sessionId: partnerSessionId,
            message: 'Connected to a stranger! Say hi! 👋'
        });

        console.log(`🤝 Strangers connected: ${currentSessionId} <-> ${partnerSessionId}`);
    }

    /**
     * Handle stranger disconnect
     * @param {Object} socket - Socket that disconnected
     */
    function handleStrangerDisconnect(socket) {
        if (!socket.anonymousSessionId) return;

        const session = anonymousUsers.get(socket.anonymousSessionId);
        
        if (session && session.partnerId) {
            // Notify partner
            const partnerSession = anonymousUsers.get(session.partnerId);
            if (partnerSession) {
                io.to(partnerSession.socketId).emit('stranger:disconnected', {
                    message: 'Stranger has disconnected.'
                });

                // Reset partner's session
                partnerSession.partnerId = null;
                partnerSession.isSearching = false;
            }
        }

        // Remove from waiting queue if present
        const queueIndex = waitingQueue.indexOf(socket.anonymousSessionId);
        if (queueIndex > -1) {
            waitingQueue.splice(queueIndex, 1);
        }

        // Remove session
        anonymousUsers.delete(socket.anonymousSessionId);
        
        socket.emit('stranger:disconnected', {
            message: 'Disconnected from stranger chat.'
        });

        console.log(`👋 Stranger ${socket.anonymousSessionId} disconnected`);
    }

}; // End of module.exports
