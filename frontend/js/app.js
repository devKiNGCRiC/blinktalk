// ===========================================
// BlinkTalk - Main Application JavaScript
// Handles authentication, state management, and core functionality
// ===========================================

// API Configuration
const API_URL = window.location.origin + '/api';
const SOCKET_URL = window.location.origin;

// Application State
const AppState = {
    user: null,
    token: null,
    currentChat: null,
    contacts: [],
    rooms: [],
    messages: {},
    isAnonymous: false,
    strangerSession: null
};

// ===========================================
// Initialize Application
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 BlinkTalk Initializing...');
    
    // Check if user is already logged in
    const savedToken = localStorage.getItem('token');
    
    if (savedToken) {
        // Verify token and auto-login
        verifyAndLogin(savedToken);
    } else {
        // Show authentication screen
        showAuthScreen();
    }
    
    // Setup event listeners
    setupEventListeners();
});

// ===========================================
// Authentication Functions
// ===========================================

/**
 * Show authentication screen
 */
function showAuthScreen() {
    hideLoading();
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('chat-screen').style.display = 'none';
}

/**
 * Show chat screen
 */
function showChatScreen() {
    hideLoading();
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'flex';
    
    // Initialize socket connection
    initializeSocket();
    
    // Load initial data
    loadContacts();
    loadRooms();
}

/**
 * Verify token and auto-login
 */
async function verifyAndLogin(token) {
    try {
        const response = await axios.get(`${API_URL}/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
            AppState.user = response.data.data.user;
            AppState.token = token;
            localStorage.setItem('token', token);
            
            // Show chat screen
            showChatScreen();
            updateUserInfo();
        } else {
            throw new Error('Invalid token');
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('token');
        showAuthScreen();
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await axios.post(`${API_URL}/auth/login`, {
            identifier,
            password
        });
        
        if (response.data.success) {
            AppState.user = response.data.data.user;
            AppState.token = response.data.data.token;
            localStorage.setItem('token', AppState.token);
            
            showNotification('Login successful!', 'success');
            showChatScreen();
            updateUserInfo();
        }
    } catch (error) {
        showNotification(error.response?.data?.message || 'Login failed', 'error');
    }
}

/**
 * Handle register form submission
 */
async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    // Validate passwords match
    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    try {
        const response = await axios.post(`${API_URL}/auth/register`, {
            username,
            email,
            password,
            confirmPassword
        });
        
        if (response.data.success) {
            AppState.user = response.data.data.user;
            AppState.token = response.data.data.token;
            localStorage.setItem('token', AppState.token);
            
            showNotification('Registration successful!', 'success');
            showChatScreen();
            updateUserInfo();
        }
    } catch (error) {
        showNotification(error.response?.data?.message || 'Registration failed', 'error');
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    // Anonymous users have no account session to end on the server
    if (!AppState.isAnonymous) {
        try {
            await axios.post(`${API_URL}/auth/logout`, {}, {
                headers: { Authorization: `Bearer ${AppState.token}` }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    // Disconnect socket
    if (window.socket) {
        window.socket.disconnect();
    }
    
    // Clear state
    AppState.user = null;
    AppState.token = null;
    AppState.isAnonymous = false;
    AppState.currentChat = null;
    AppState.contacts = [];
    AppState.rooms = [];
    closeChat();
    localStorage.removeItem('token');
    
    // Show auth screen
    showAuthScreen();
    showNotification('Logged out successfully', 'success');
}

/**
 * Start anonymous chat
 */
function startAnonymousChat() {
    AppState.isAnonymous = true;
    AppState.user = {
        _id: 'anonymous',
        username: 'Anonymous',
        displayName: 'Anonymous User',
        avatar: 'https://ui-avatars.com/api/?background=random&name=Anonymous'
    };
    
    showChatScreen();
    updateUserInfo();
    
    // Switch to stranger tab
    document.querySelector('[data-tab="stranger"]').click();
}

// ===========================================
// Data Loading Functions
// ===========================================

/**
 * Load user contacts
 */
async function loadContacts() {
    if (AppState.isAnonymous) return;
    
    try {
        const response = await axios.get(`${API_URL}/users/contacts`, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });
        
        if (response.data.success) {
            AppState.contacts = response.data.data.contacts;
            renderChatList(AppState.contacts);
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

/**
 * Load user rooms
 */
async function loadRooms() {
    if (AppState.isAnonymous) return;
    
    try {
        const response = await axios.get(`${API_URL}/rooms`, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });
        
        if (response.data.success) {
            AppState.rooms = response.data.data.rooms;
            renderRoomList(AppState.rooms);
        }
    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

/**
 * Load messages for a chat
 */
async function loadMessages(userId) {
    try {
        const response = await axios.get(`${API_URL}/messages/${userId}`, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });
        
        if (response.data.success) {
            const messages = response.data.data.messages.reverse();
            AppState.messages[userId] = messages;
            renderMessages(messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// ===========================================
// UI Update Functions
// ===========================================

/**
 * Update user info display
 */
function updateUserInfo() {
    document.getElementById('user-name').textContent = AppState.user.displayName || AppState.user.username;
    document.getElementById('user-avatar').src = AppState.user.avatar;
}

/**
 * Render chat list
 */
function renderChatList(contacts) {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    if (contacts.length === 0) {
        chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No chats yet. Search for users to start chatting!</div>';
        return;
    }
    
    contacts.forEach(contact => {
        const chatItem = createChatItem(contact);
        chatList.appendChild(chatItem);
    });
}

/**
 * Create chat item element
 */
function createChatItem(contact) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.onclick = () => openChat(contact.user);
    
    div.innerHTML = `
        <img src="${escapeHtml(contact.user.avatar)}" class="avatar" alt="${escapeHtml(contact.user.username)}">
        <div class="chat-item-content">
            <div class="chat-item-header">
                <span class="chat-item-name">${escapeHtml(contact.user.displayName || contact.user.username)}</span>
                <span class="chat-item-time">${formatTime(contact.lastMessage.createdAt)}</span>
            </div>
            <div class="chat-item-preview">${escapeHtml(contact.lastMessage.content)}</div>
        </div>
    `;
    
    return div;
}

/**
 * Render room list
 */
function renderRoomList(rooms) {
    const roomList = document.getElementById('room-list');
    roomList.innerHTML = '<div class="list-header"><h4>My Rooms</h4><button id="create-room-btn" class="btn-small"><i class="fas fa-plus"></i> New Room</button></div>';
    
    rooms.forEach(room => {
        const roomItem = createRoomItem(room);
        roomList.appendChild(roomItem);
    });
    
    // Re-attach event listener
    document.getElementById('create-room-btn').addEventListener('click', showCreateRoomModal);
}

/**
 * Create room item element
 */
function createRoomItem(room) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.onclick = () => openRoom(room);
    
    div.innerHTML = `
        <img src="${escapeHtml(room.avatar)}" class="avatar" alt="${escapeHtml(room.name)}">
        <div class="chat-item-content">
            <div class="chat-item-header">
                <span class="chat-item-name">${escapeHtml(room.name)}</span>
                <span class="chat-item-time">${room.stats.memberCount} members</span>
            </div>
            <div class="chat-item-preview">${escapeHtml(room.description || 'No description')}</div>
        </div>
    `;
    
    return div;
}

/**
 * Render messages
 */
function renderMessages(messages) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    messages.forEach(message => {
        const messageEl = createMessageElement(message);
        container.appendChild(messageEl);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

/**
 * Create message element
 */
function createMessageElement(message) {
    const div = document.createElement('div');

    // System messages (e.g. "X joined the room") are shown centered
    if (message.type === 'system') {
        div.className = 'message system';
        div.textContent = message.content;
        return div;
    }

    const sender = message.sender || {};
    const isSent = sender._id === AppState.user._id;
    div.className = `message ${isSent ? 'sent' : 'received'}`;

    // In rooms, show who sent each received message
    const senderName = !isSent && AppState.currentChat && AppState.currentChat.type === 'room'
        ? `<div class="message-sender">${escapeHtml(sender.displayName || sender.username || '')}</div>`
        : '';

    div.innerHTML = `
        ${senderName}
        <div>${escapeHtml(message.content)}</div>
        <div class="message-time">${formatTime(message.createdAt)}</div>
    `;

    return div;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Escape text before inserting it into HTML, so user content
 * (messages, names) can't inject scripts (XSS protection)
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Simple alert for now (you can enhance this with toast notifications)
    alert(message);
}

/**
 * Hide loading screen
 */
function hideLoading() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
}

// ===========================================
// Event Listeners Setup
// ===========================================

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Show register
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });
    
    // Show login
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });
    
    // Anonymous chat
    document.getElementById('start-anonymous-chat').addEventListener('click', startAnonymousChat);
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });
    
    // Send message
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Close chat
    document.getElementById('close-chat-btn').addEventListener('click', closeChat);
}

/**
 * Switch navigation tab
 */
function switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide content
    document.getElementById('chat-list').style.display = tabName === 'chats' ? 'block' : 'none';
    document.getElementById('room-list').style.display = tabName === 'rooms' ? 'block' : 'none';
    document.getElementById('stranger-panel').style.display = tabName === 'stranger' ? 'flex' : 'none';
}

/**
 * Open chat with user
 */
function openChat(user) {
    AppState.currentChat = { type: 'private', user };
    
    // Update UI
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    document.getElementById('chat-name').textContent = user.displayName || user.username;
    document.getElementById('chat-avatar').src = user.avatar;
    document.getElementById('chat-status').textContent = user.isOnline ? 'Online' : 'Offline';
    
    // Load messages
    if (!AppState.isAnonymous) {
        loadMessages(user._id);
    }
}

/**
 * Open room
 */
function openRoom(room) {
    AppState.currentChat = { type: 'room', room };
    
    // Update UI
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    document.getElementById('chat-name').textContent = room.name;
    document.getElementById('chat-avatar').src = room.avatar;
    document.getElementById('chat-status').textContent = `${room.stats.memberCount} members`;
    
    // Subscribe to live messages for this room
    if (window.socket) {
        window.socket.emit('room:join', { roomId: room._id });
    }

    // Load room messages
    loadRoomMessages(room._id);
}

/**
 * Load message history for a room
 */
async function loadRoomMessages(roomId) {
    document.getElementById('messages-container').innerHTML = '';

    try {
        const response = await axios.get(`${API_URL}/messages/room/${roomId}`, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        // Ignore the response if the user switched chats meanwhile
        if (response.data.success && AppState.currentChat?.room?._id === roomId) {
            renderMessages(response.data.data.messages.reverse());
        }
    } catch (error) {
        console.error('Error loading room messages:', error);
    }
}

/**
 * Close current chat
 */
function closeChat() {
    // Leaving a stranger chat disconnects from the stranger
    if (AppState.currentChat?.type === 'stranger' && window.socket) {
        window.socket.emit('stranger:disconnect');
    }

    AppState.currentChat = null;
    document.getElementById('active-chat').style.display = 'none';
    document.getElementById('welcome-screen').style.display = 'flex';
}

/**
 * Send message
 */
function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content || !AppState.currentChat) return;
    
    if (AppState.currentChat.type === 'stranger') {
        // Send to stranger via socket
        if (window.socket) {
            window.socket.emit('stranger:message', { content });
        }
    } else {
        // Send via socket
        if (AppState.currentChat.type === 'private') {
            window.socket.emit('message:private', {
                receiverId: AppState.currentChat.user._id,
                content
            });
        } else {
            window.socket.emit('message:room', {
                roomId: AppState.currentChat.room._id,
                content
            });
        }
    }
    
    // Clear input
    input.value = '';
}

/**
 * Show create room modal
 */
function showCreateRoomModal() {
    document.getElementById('room-modal').style.display = 'flex';
}

console.log('✅ App.js loaded');
