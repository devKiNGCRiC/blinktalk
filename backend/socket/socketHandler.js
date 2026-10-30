// ============================================
// Socket.io Handler
// ============================================

// This file handles all real-time Socket.io events
// Manages: Private messaging, group chat, typing indicators, read receipts
// and message deletion. Stranger chat lives in ../stranger/strangerHandler.js

// Import mongoose to validate IDs sent by the client
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');

// Import JWT verification for socket authentication
const { verifyToken } = require('../config/jwt');

// Message text validation (shared with stranger chat)
const { cleanContent, REACTIONS } = require('../stranger/moderation');

// Stranger chat (matching, limits, reports)
const setupStranger = require('../stranger/strangerHandler');

// Device id and IP address of a connection
const { cleanDeviceId, clientIp } = require('../stranger/identity');

// ============================================
// Small Helpers
// ============================================

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

    // Stranger chat matching loop and shared state
    const stranger = setupStranger(io);

    /**
     * Is the user connected right now (in any browser tab)?
     */
    async function isUserConnected(userId) {
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        return sockets.length > 0;
    }

    // ============================================
    // Handshake Authentication
    // ============================================

    // Logged-in clients send their JWT when connecting: io({ auth: { token } }).
    // Identifying the user here (instead of only in 'user:authenticate') means
    // messages queued while offline, which the client sends the instant it
    // reconnects, are already authenticated. Guests connect without a token.
    io.use((socket, next) => {
        // Who this browser is, for stranger chat limits, reports and bans
        socket.deviceId = cleanDeviceId(socket.handshake.auth && socket.handshake.auth.deviceId);
        socket.ip = clientIp(socket.handshake.headers, socket.handshake.address, process.env.TRUST_PROXY === '1');

        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (token) {
            try {
                socket.userId = verifyToken(token).id;
                socket.join(`user:${socket.userId}`);
            } catch (error) {
                // Invalid/expired token: connect as a guest; 'user:authenticate' will report the error
            }
        }
        next();
    });

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

                // Private chats are only between friends (made in stranger chat)
                if (!sender.friends.some(id => id.toString() === receiverId)) {
                    return socket.emit('message:error', { tempId, message: 'You can only message friends' });
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

        /**
         * Event: message:react
         * Description: React to a private message. One reaction per person:
         * a new emoji replaces yours, the same emoji again removes it.
         * Data: { messageId, emoji }
         */
        socket.on('message:react', async (data = {}) => {
            try {
                if (!socket.userId || !REACTIONS.includes(data.emoji)) return;

                const message = validId(data.messageId) && await Message.findById(data.messageId);
                if (!message || message.isDeleted || !message.receiver) return;

                const inChat = [message.sender, message.receiver].some(id => id && id.toString() === socket.userId);
                if (!inChat) return;

                const mine = message.reactions.find(r => r.user.toString() === socket.userId);
                if (mine && mine.emoji === data.emoji) {
                    message.reactions.pull(mine._id);
                } else if (mine) {
                    mine.emoji = data.emoji;
                } else {
                    message.reactions.push({ user: socket.userId, emoji: data.emoji });
                }
                await message.save();

                const reactions = message.reactions.map(r => ({ user: r.user.toString(), emoji: r.emoji }));
                io.to(`user:${message.sender}`).to(`user:${message.receiver}`)
                    .emit('message:reaction', { messageId: message._id.toString(), reactions });
            } catch (error) {
                console.error('Reaction Error:', error);
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

            } catch (error) {
                console.error('Disconnect Error:', error);
            }
        });

        // ============================================
        // Stranger Chat
        // ============================================
        stranger.attach(socket);

    }); // End of io.on('connection')
}; // End of module.exports
