// ===========================================
// BlinkTalk - UI Helper Functions
// Additional UI utilities and enhancements
// ===========================================

/**
 * Show/hide room modal
 */
document.addEventListener('DOMContentLoaded', () => {
    // Close modal handlers
    const closeModalBtns = document.querySelectorAll('.close-modal');
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('room-modal').style.display = 'none';
        });
    });
    
    // Click outside modal to close
    document.getElementById('room-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Create room form
    document.getElementById('create-room-form').addEventListener('submit', handleCreateRoom);
});

/**
 * Handle create room form
 */
async function handleCreateRoom(e) {
    e.preventDefault();
    
    const name = document.getElementById('room-name').value;
    const description = document.getElementById('room-description').value;
    const type = document.getElementById('room-type').value;
    
    try {
        const response = await axios.post(`${API_URL}/rooms`, {
            name,
            description,
            type
        }, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });
        
        if (response.data.success) {
            showNotification('Room created successfully!', 'success');
            document.getElementById('room-modal').style.display = 'none';
            
            // Reset form
            document.getElementById('create-room-form').reset();
            
            // Reload rooms
            loadRooms();
        }
    } catch (error) {
        showNotification(error.response?.data?.message || 'Failed to create room', 'error');
    }
}

/**
 * Search functionality
 */
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        clearTimeout(searchTimeout);
        
        // Wait for user to stop typing
        searchTimeout = setTimeout(() => {
            if (query.length > 0) {
                performSearch(query);
            } else {
                // Reload original list
                const activeTab = document.querySelector('.nav-tab.active').dataset.tab;
                if (activeTab === 'chats') {
                    loadContacts();
                } else if (activeTab === 'rooms') {
                    loadRooms();
                }
            }
        }, 500);
    });
});

/**
 * Perform search
 */
async function performSearch(query) {
    const activeTab = document.querySelector('.nav-tab.active').dataset.tab;
    
    try {
        if (activeTab === 'chats') {
            // Search users
            const response = await axios.get(`${API_URL}/users/search?q=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${AppState.token}` }
            });
            
            if (response.data.success) {
                renderSearchResults(response.data.data.users, 'user');
            }
        } else if (activeTab === 'rooms') {
            // Search rooms
            const response = await axios.get(`${API_URL}/rooms/search?q=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${AppState.token}` }
            });
            
            if (response.data.success) {
                renderSearchResults(response.data.data.rooms, 'room');
            }
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

/**
 * Render search results
 */
function renderSearchResults(results, type) {
    const container = type === 'user' ? document.getElementById('chat-list') : document.getElementById('room-list');
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No results found</div>';
        return;
    }
    
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        
        if (type === 'user') {
            item.onclick = () => openChat(result);
            item.innerHTML = `
                <img src="${escapeHtml(result.avatar)}" class="avatar" alt="${escapeHtml(result.username)}">
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${escapeHtml(result.displayName || result.username)}</span>
                        <span class="status-indicator ${result.isOnline ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="chat-item-preview">@${escapeHtml(result.username)}</div>
                </div>
            `;
        } else {
            item.onclick = () => joinAndOpenRoom(result);
            item.innerHTML = `
                <img src="${escapeHtml(result.avatar)}" class="avatar" alt="${escapeHtml(result.name)}">
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${escapeHtml(result.name)}</span>
                        <span class="chat-item-time">${result.stats.memberCount} members</span>
                    </div>
                    <div class="chat-item-preview">${escapeHtml(result.description || 'No description')}</div>
                </div>
            `;
        }
        
        container.appendChild(item);
    });
}

/**
 * Join and open room
 */
async function joinAndOpenRoom(room) {
    try {
        // Try to join room
        await axios.post(`${API_URL}/rooms/${room._id}/join`, {}, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });
        
        showNotification('Joined room successfully!', 'success');

        // Open room (also subscribes to its live messages)
        openRoom(room);

        // Refresh "My Rooms" so the joined room shows up there
        loadRooms();

    } catch (error) {
        // If already a member, just open
        if (error.response?.status === 400) {
            openRoom(room);
        } else {
            showNotification(error.response?.data?.message || 'Failed to join room', 'error');
        }
    }
}

/**
 * Enhanced notification with toast
 */
function showNotification(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#00c851' : type === 'error' ? '#ff4444' : '#0084ff'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

/**
 * Typing indicator for input
 */
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    let typingTimeout;
    
    messageInput.addEventListener('input', () => {
        if (!AppState.currentChat || !window.socket) return;
        
        // Clear previous timeout
        clearTimeout(typingTimeout);
        
        // Emit typing start
        if (AppState.currentChat.type === 'stranger') {
            window.socket.emit('stranger:typing');
        } else if (AppState.currentChat.type === 'private') {
            window.socket.emit('typing:start', { 
                receiverId: AppState.currentChat.user._id 
            });
        } else if (AppState.currentChat.type === 'room') {
            window.socket.emit('typing:start', { 
                roomId: AppState.currentChat.room._id 
            });
        }
        
        // Stop typing after 1 second of no input
        typingTimeout = setTimeout(() => {
            // The chat may have been closed during the delay
            if (!AppState.currentChat) return;

            if (AppState.currentChat.type === 'private') {
                window.socket.emit('typing:stop', { 
                    receiverId: AppState.currentChat.user._id 
                });
            } else if (AppState.currentChat.type === 'room') {
                window.socket.emit('typing:stop', { 
                    roomId: AppState.currentChat.room._id 
                });
            }
        }, 1000);
    });
});

console.log('✅ UI.js loaded');
