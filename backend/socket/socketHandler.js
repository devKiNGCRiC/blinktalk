// ============================================
// Socket.io Handler
// ============================================

// This file handles all real-time Socket.io events
// Manages: Private messaging, group chat, typing indicators, read receipts,
// message deletion and anonymous stranger chat

// Import mongoose to validate IDs sent by the client
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');

// Import UUID for anonymous sessions
const { v4: uuidv4 } = require('uuid');

// Import JWT verification for socket authentication
const { verifyToken } = require('../config/jwt');

// Maximum message length (same as the Message model)
const MAX_MESSAGE_LENGTH = 5000;

// Store for anonymous stranger chat matching
// Format: { sessionId: { socketId, interests, partnerId, isSearching } }
const anonymousUsers = new Map();

// Store waiting users looking for strangers
const waitingQueue = [];

// ============================================
// Small Helpers
// ============================================

/**
 * Returns trimmed message text, or null if it is empty / too long / not text
 */
function cleanContent(content) {
    if (typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
    return trimmed;
}

/**
 * Returns the ID if it is a valid MongoDB ObjectId, otherwise null
 */
function validId(id) {
    return mongoose.isValidObjectId(id) ? id : null;
}

// ============================================
// Main Socket Handler Function
// ============================================

/**
 * Initialize Socket.io event handlers
 * @param {Object} io - Socket.io server instance
 */
module.exports = (io) => {

    /**
     * Is the user connected right now (in any browser tab)?
     */
    async function isUserConnected(userId) {
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        return sockets.length > 0;
    }

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

                // Join all rooms the user is a member of,
                // so room previews update live even when the room isn't open
                const rooms = await Room.find({ 'members.user': userId, isActive: true }).select('_id');
                rooms.forEach(room => socket.join(`room:${room._id}`));

                // Messages sent while this user was offline are delivered now
                const undelivered = await Message.find({
                    receiver: userId,
                    room: null,
                    isDelivered: false
                }).select('_id sender');

                if (undelivered.length > 0) {
                    await Message.updateMany(
                        { _id: { $in: undelivered.map(m => m._id) } },
                        { isDelivered: true, deliveredAt: new Date() }
                    );

                    // Group message IDs by sender and tell each sender
                    const bySender = new Map();
                    for (const message of undelivered) {
                        const senderId = message.sender.toString();
                        if (!bySender.has(senderId)) bySender.set(senderId, []);
                        bySender.get(senderId).push(message._id);
                    }
                    for (const [senderId, messageIds] of bySender) {
                        io.to(`user:${senderId}`).emit('message:delivered', { messageIds, to: userId });
                    }
                }

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
         * Data: { receiverId, content, replyTo, tempId }
         * tempId is created by the client and sent back, so the client
         * can match the confirmed message with the one it is showing as "sending"
         */
        socket.on('message:private', async (data = {}) => {
            const { receiverId, replyTo, tempId } = data;

            try {
                // Get sender from authenticated socket
                if (!socket.userId) {
                    return socket.emit('message:error', { tempId, message: 'Not authenticated' });
                }

                // Validate message text
                const content = cleanContent(data.content);
                if (!content) {
                    return socket.emit('message:error', { tempId, message: 'Message must be 1-5000 characters' });
                }

                // Check the receiver exists
                const receiver = validId(receiverId) && await User.findById(receiverId);
                if (!receiver) {
                    return socket.emit('message:error', { tempId, message: 'User not found' });
                }

                // Check neither user has blocked the other
                const sender = await User.findById(socket.userId);
                if (sender.blockedUsers.some(id => id.toString() === receiverId) ||
                    receiver.blockedUsers.some(id => id.toString() === socket.userId)) {
                    return socket.emit('message:error', { tempId, message: 'You can\'t message this user' });
                }

                // Mark as delivered right away if the receiver is connected
                const receiverOnline = await isUserConnected(receiverId);

                // Create message in database
                const message = await Message.create({
                    sender: socket.userId,
                    receiver: receiverId,
                    content,
                    type: 'text',
                    replyTo: validId(replyTo),
                    isDelivered: receiverOnline,
                    deliveredAt: receiverOnline ? new Date() : null
                });

                // Populate message details
                await message.populate('sender', 'username displayName avatar');
                await message.populate('receiver', 'username displayName avatar');
                await message.populate(Message.REPLY_POPULATE);

                // Send message to receiver (all their open tabs)
                io.to(`user:${receiverId}`).emit('message:received', message);

                // Send confirmation to sender, with their tempId
                socket.emit('message:sent', { ...message.toJSON(), tempId });

                console.log(`📨 Private message from ${socket.userId} to ${receiverId}`);

            } catch (error) {
                console.error('Private Message Error:', error);
                socket.emit('message:error', { tempId, message: 'Failed to send message' });
            }
        });

        /**
         * Event: messages:read
         * Description: The user opened a chat - mark everything from that person as read
         * Data: { userId } - the other person in the chat
         */
        socket.on('messages:read', async (data = {}) => {
            try {
                const otherUserId = validId(data.userId);
                if (!socket.userId || !otherUserId) return;

                const result = await Message.updateMany(
                    { sender: otherUserId, receiver: socket.userId, isRead: false },
                    { isRead: true, readAt: new Date(), isDelivered: true }
                );

                // Tell the sender their messages were read (✓✓ turns colored)
                if (result.modifiedCount > 0) {
                    io.to(`user:${otherUserId}`).emit('messages:read', {
                        by: socket.userId,
                        at: new Date()
                    });
                }

            } catch (error) {
                console.error('Mark Read Error:', error);
            }
        });

        /**
         * Event: message:delete
         * Description: Delete a message for me, or for everyone (sender only)
         * Data: { messageId, scope: 'me' | 'everyone' }
         */
        socket.on('message:delete', async (data = {}) => {
            try {
                if (!socket.userId) return;

                const message = validId(data.messageId) && await Message.findById(data.messageId);
                if (!message) {
                    return socket.emit('error', { message: 'Message not found' });
                }

                const isSender = message.sender && message.sender.toString() === socket.userId;

                // Who is allowed to see this message?
                let canSee = isSender || (message.receiver && message.receiver.toString() === socket.userId);
                if (!canSee && message.room) {
                    const room = await Room.findById(message.room);
                    canSee = room && room.isMember(socket.userId);
                }
                if (!canSee) {
                    return socket.emit('error', { message: 'You can\'t delete this message' });
                }

                if (data.scope === 'everyone') {
                    // Only the sender can delete for everyone
                    if (!isSender) {
                        return socket.emit('error', { message: 'Only the sender can delete for everyone' });
                    }

                    message.isDeleted = true;
                    await message.save();

                    // Tell everyone who can see the message
                    const payload = { messageId: message._id, scope: 'everyone' };
                    if (message.room) {
                        io.to(`room:${message.room}`).emit('message:deleted', payload);
                    } else {
                        io.to(`user:${message.sender}`).to(`user:${message.receiver}`).emit('message:deleted', payload);
                    }
                } else {
                    // Delete for me: hide it only for this user
                    if (!message.deletedFor.some(id => id.toString() === socket.userId)) {
                        message.deletedFor.push(socket.userId);
                        await message.save();
                    }
                    io.to(`user:${socket.userId}`).emit('message:deleted', { messageId: message._id, scope: 'me' });
                }

            } catch (error) {
                console.error('Delete Message Error:', error);
                socket.emit('error', { message: 'Failed to delete message' });
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
        socket.on('typing:start', async (data = {}) => {
            try {
                const { receiverId, roomId } = data;

                if (!socket.userId) return;

                // Get user details
                const user = await User.findById(socket.userId).select('username displayName');
                if (!user) return;

                const payload = {
                    userId: socket.userId,
                    username: user.username,
                    displayName: user.displayName || user.username
                };

                if (receiverId) {
                    // Private chat typing
                    io.to(`user:${receiverId}`).emit('typing:start', payload);
                } else if (roomId) {
                    // Room typing
                    socket.to(`room:${roomId}`).emit('typing:start', { ...payload, roomId });
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
        socket.on('typing:stop', (data = {}) => {
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
         * Description: Subscribe to a room's live messages (after joining it via the API)
         * Data: { roomId }
         */
        socket.on('room:join', async (data = {}) => {
            try {
                const { roomId } = data;

                if (!socket.userId) {
                    return socket.emit('error', { message: 'Not authenticated' });
                }

                // Check if user is member of the room
                const room = validId(roomId) && await Room.findById(roomId);

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
         * Description: Stop receiving a room's live messages
         * Data: { roomId }
         */
        socket.on('room:leave', (data = {}) => {
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
         * Data: { roomId, content, replyTo, tempId }
         */
        socket.on('message:room', async (data = {}) => {
            const { roomId, replyTo, tempId } = data;

            try {
                if (!socket.userId) {
                    return socket.emit('message:error', { tempId, message: 'Not authenticated' });
                }

                // Validate message text
                const content = cleanContent(data.content);
                if (!content) {
                    return socket.emit('message:error', { tempId, message: 'Message must be 1-5000 characters' });
                }

                // Check if user is member
                const room = validId(roomId) && await Room.findById(roomId);
                if (!room || !room.isActive || !room.isMember(socket.userId)) {
                    return socket.emit('message:error', { tempId, message: 'You are not a member of this room' });
                }

                // Create message
                const message = await Message.create({
                    sender: socket.userId,
                    room: roomId,
                    content,
                    type: 'text',
                    replyTo: validId(replyTo)
                });

                // Populate sender and reply details
                await message.populate('sender', 'username displayName avatar');
                await message.populate(Message.REPLY_POPULATE);

                // Update room's last message
                room.lastMessage = message._id;
                room.stats.messageCount += 1;
                await room.save();

                // Make sure this socket gets future messages from the room
                socket.join(`room:${roomId}`);

                // Broadcast to the other room members
                socket.to(`room:${roomId}`).emit('message:room:received', message);

                // Confirm to the sender, with their tempId
                socket.emit('message:sent', { ...message.toJSON(), tempId });

                console.log(`💬 Room message in ${roomId} from ${socket.userId}`);

            } catch (error) {
                console.error('Room Message Error:', error);
                socket.emit('message:error', { tempId, message: 'Failed to send room message' });
            }
        });

        // ============================================
        // Anonymous Stranger Chat (USP Feature!)
        // ============================================

        /**
         * Event: stranger:search
         * Description: Search for a random stranger to chat with
         * ("Next" in the client is just another search)
         * Data: { interests } (optional)
         */
        socket.on('stranger:search', (data) => {
            try {
                const { interests } = data || {};

                // End any previous session first (tells the old partner they left)
                endStrangerSession(socket, false);

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
                const match = findStrangerMatch(sessionId);

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
                const content = cleanContent(data && data.content);
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
         * Description: Leave stranger chat (or cancel searching)
         */
        socket.on('stranger:disconnect', () => {
            endStrangerSession(socket, true);
        });

        // ============================================
        // Disconnection Event
        // ============================================

        socket.on('disconnect', async () => {
            try {
                console.log(`🔌 Disconnected: ${socket.id}`);

                // Handle authenticated user disconnect
                // (only mark offline if no other tab of this user is still open)
                if (socket.userId && !(await isUserConnected(socket.userId))) {
                    const lastSeen = new Date();

                    // Update user's online status
                    await User.findByIdAndUpdate(socket.userId, {
                        isOnline: false,
                        lastSeen,
                        socketId: null
                    });

                    // Broadcast to all users that this user is offline
                    socket.broadcast.emit('user:offline', {
                        userId: socket.userId,
                        lastSeen
                    });
                }

                // Handle anonymous user disconnect
                endStrangerSession(socket, false);

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
     * @returns {String|null} - Matched session ID or null
     */
    function findStrangerMatch(sessionId) {
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
     * End a socket's stranger session (if it has one)
     * @param {Object} socket - The socket leaving stranger chat
     * @param {Boolean} notifySelf - Also send "stranger:ended" back to this socket
     */
    function endStrangerSession(socket, notifySelf) {
        if (!socket.anonymousSessionId) return;

        const sessionId = socket.anonymousSessionId;
        const session = anonymousUsers.get(sessionId);

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
        const queueIndex = waitingQueue.indexOf(sessionId);
        if (queueIndex > -1) {
            waitingQueue.splice(queueIndex, 1);
        }

        // Remove session
        anonymousUsers.delete(sessionId);
        socket.anonymousSessionId = null;

        if (notifySelf) {
            socket.emit('stranger:ended', {
                message: 'You left the chat.'
            });
        }

        console.log(`👋 Stranger ${sessionId} left`);
    }

}; // End of module.exports
