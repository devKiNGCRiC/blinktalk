// ===========================================
// BlinkTalk - Socket.io Client Handler
// Manages real-time communication
// ===========================================

/**
 * Initialize Socket.io connection
 */
function initializeSocket() {
    console.log('🔌 Initializing Socket.io connection...');
    
    // Connect to server
    // forceNew: after logout + login, get a fresh socket instead of the cached
    // one (which would still carry the old event listeners -> duplicate messages)
    window.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        forceNew: true
    });

    // Connection successful
    window.socket.on('connect', () => {
        console.log('✅ Socket connected:', window.socket.id);

        // Authenticate user if not anonymous (server verifies the JWT)
        if (!AppState.isAnonymous) {
            window.socket.emit('user:authenticate', {
                token: AppState.token
            });

            // Re-subscribe to the open room after a reconnect
            if (AppState.currentChat?.type === 'room') {
                window.socket.emit('room:join', { roomId: AppState.currentChat.room._id });
            }
        }
    });
    
    // Authentication successful
    window.socket.on('user:authenticated', (data) => {
        console.log('✅ User authenticated via socket');
    });
    
    // User came online
    window.socket.on('user:online', (data) => {
        console.log('👤 User online:', data.userId);
        updateUserOnlineStatus(data.userId, true);
    });
    
    // User went offline
    window.socket.on('user:offline', (data) => {
        console.log('👤 User offline:', data.userId);
        updateUserOnlineStatus(data.userId, false);
    });
    
    // Received private message
    window.socket.on('message:received', (message) => {
        console.log('📨 Message received:', message);
        handleReceivedMessage(message);
    });
    
    // Message sent confirmation
    window.socket.on('message:sent', (message) => {
        console.log('✅ Message sent:', message);

        // Only show it if that conversation is still open
        if (AppState.currentChat?.type === 'private' &&
            AppState.currentChat.user._id === message.receiver?._id) {
            addMessageToChat(message);
        }

        // Refresh the chat list so a new conversation appears in it
        loadContacts();
    });
    
    // Message delivered
    window.socket.on('message:delivered', (data) => {
        console.log('✅ Message delivered:', data.messageId);
    });
    
    // Message read confirmation
    window.socket.on('message:read:confirm', (data) => {
        console.log('👁️ Message read:', data.messageId);
    });
    
    // Typing started
    window.socket.on('typing:start', (data) => {
        // Only show typing for the conversation that is open
        const chat = AppState.currentChat;
        const isOpenChat = data.roomId
            ? chat?.type === 'room' && chat.room._id === data.roomId
            : chat?.type === 'private' && chat.user._id === data.userId;
        if (isOpenChat) {
            showTypingIndicator(data.username);
        }
    });
    
    // Typing stopped
    window.socket.on('typing:stop', (data) => {
        hideTypingIndicator();
    });
    
    // Room message received
    window.socket.on('message:room:received', (message) => {
        console.log('💬 Room message received:', message);
        // Only show it in the room it belongs to
        if (AppState.currentChat?.type === 'room' &&
            AppState.currentChat.room._id === message.room) {
            addMessageToChat(message);
        }
    });
    
    // ===========================================
    // Stranger Chat Events
    // ===========================================
    
    // Searching for stranger
    window.socket.on('stranger:searching', (data) => {
        console.log('🔍 Searching for stranger...');
        document.getElementById('stranger-status').textContent = 'Searching for a stranger...';
        document.getElementById('find-stranger-btn').disabled = true;
        document.getElementById('find-stranger-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    });
    
    // Stranger connected
    window.socket.on('stranger:connected', (data) => {
        console.log('🤝 Stranger connected!');
        AppState.strangerSession = data.sessionId;
        
        document.getElementById('stranger-status').textContent = 'Connected! Start chatting...';
        document.getElementById('find-stranger-btn').style.display = 'none';
        
        // Create stranger chat UI
        openStrangerChat();
    });
    
    // Stranger message received
    window.socket.on('stranger:message', (data) => {
        console.log('💬 Stranger message:', data);
        
        const container = document.getElementById('messages-container');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${data.from === 'you' ? 'sent' : 'received'}`;
        messageEl.innerHTML = `
            <div>${escapeHtml(data.content)}</div>
            <div class="message-time">${formatTime(data.timestamp)}</div>
        `;
        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;
    });
    
    // Stranger typing
    window.socket.on('stranger:typing', () => {
        showTypingIndicator('Stranger');
    });
    
    // Stranger disconnected
    window.socket.on('stranger:disconnected', (data) => {
        console.log('👋 Stranger disconnected');
        document.getElementById('stranger-status').textContent = 'Stranger disconnected.';
        document.getElementById('find-stranger-btn').style.display = 'block';
        document.getElementById('find-stranger-btn').disabled = false;
        document.getElementById('find-stranger-btn').innerHTML = '<i class="fas fa-random"></i> Find a Stranger';
        
        // Add system message
        const container = document.getElementById('messages-container');
        const systemMsg = document.createElement('div');
        systemMsg.className = 'message system';
        systemMsg.textContent = 'Stranger has disconnected. Click "Find a Stranger" to connect with someone new.';
        container.appendChild(systemMsg);
    });
    
    // Connection error
    window.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
    });
    
    // Disconnected
    window.socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
    });
    
    // Error events
    window.socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
        showNotification(error.message, 'error');
    });
}

/**
 * Handle received message
 */
function handleReceivedMessage(message) {
    // If chat is open with this user, add message
    if (AppState.currentChat && 
        AppState.currentChat.type === 'private' && 
        AppState.currentChat.user._id === message.sender._id) {
        addMessageToChat(message);
        
        // Mark as read
        window.socket.emit('message:read', { messageId: message._id });
    } else {
        // Update unread count
        // You can implement this based on your needs
    }
    
    // Reload contacts to show new message
    loadContacts();
}

/**
 * Add message to current chat
 */
function addMessageToChat(message) {
    const container = document.getElementById('messages-container');
    const messageEl = createMessageElement(message);
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
}

/**
 * Update user online status
 */
function updateUserOnlineStatus(userId, isOnline) {
    // Update in contacts list
    const contact = AppState.contacts.find(c => c.user._id === userId);
    if (contact) {
        contact.user.isOnline = isOnline;
    }
    
    // Update in current chat if open
    if (AppState.currentChat && 
        AppState.currentChat.type === 'private' && 
        AppState.currentChat.user._id === userId) {
        document.getElementById('chat-status').textContent = isOnline ? 'Online' : 'Offline';
    }
}

/**
 * Show typing indicator
 */
function showTypingIndicator(username) {
    const indicator = document.getElementById('typing-indicator');
    document.getElementById('typing-user').textContent = username;
    indicator.style.display = 'flex';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideTypingIndicator();
    }, 3000);
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    document.getElementById('typing-indicator').style.display = 'none';
}

/**
 * Open stranger chat
 */
function openStrangerChat() {
    AppState.currentChat = { type: 'stranger' };
    
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    document.getElementById('chat-name').textContent = 'Anonymous Stranger';
    document.getElementById('chat-avatar').src = 'https://ui-avatars.com/api/?background=random&name=Stranger';
    document.getElementById('chat-status').textContent = 'Connected';
    
    // Clear messages
    document.getElementById('messages-container').innerHTML = '';
    
    // Add welcome message
    const container = document.getElementById('messages-container');
    const welcomeMsg = document.createElement('div');
    welcomeMsg.className = 'message system';
    welcomeMsg.textContent = 'You are now connected to a stranger. Say hi! 👋';
    container.appendChild(welcomeMsg);
}

/**
 * Find stranger button handler
 */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('find-stranger-btn').addEventListener('click', () => {
        if (window.socket) {
            window.socket.emit('stranger:search', {});
        }
    });
});

console.log('✅ Socket.js loaded');
