// ============================================
// Chat state (pure reducer - no network, easy to test)
// ============================================
// Conversations are identified by a key:
//   'u:<userId>'  private chat with that user
//   'r:<roomId>'  room chat

export const privateKey = userId => `u:${userId}`;
export const roomKey = roomId => `r:${roomId}`;

const idOf = value => value?._id ?? value ?? null;

/** Which conversation does this message belong to (from my point of view)? */
export function keyForMessage(message, myId) {
    if (message.room) return roomKey(idOf(message.room));
    const senderId = idOf(message.sender);
    return privateKey(senderId === myId ? idOf(message.receiver) : senderId);
}

export const initialChatState = {
    contacts: null,     // null while loading, then [{ user, lastMessage, unreadCount }]
    rooms: null,        // null while loading, then my rooms
    publicRooms: [],    // rooms I can discover and join
    active: null,       // { type: 'private', user } | { type: 'room', room }
    messages: {},       // key -> messages, oldest first
    typing: {},         // key -> name of who is typing
    presence: {},       // userId -> { isOnline, lastSeen }
    replyTo: null       // message being replied to
};

export function activeKey(state) {
    const { active } = state;
    if (!active) return null;
    return active.type === 'room' ? roomKey(active.room._id) : privateKey(active.user._id);
}

// ---------- small immutable helpers ----------

function updateMessages(state, key, update) {
    const list = state.messages[key];
    if (!list) return state;
    return { ...state, messages: { ...state.messages, [key]: update(list) } };
}

function updateAllMessages(state, update) {
    const messages = {};
    for (const [key, list] of Object.entries(state.messages)) {
        messages[key] = list.map(update);
    }
    return { ...state, messages };
}

function preview(message, myId) {
    return {
        content: message.content,
        isDeleted: Boolean(message.isDeleted),
        fromMe: idOf(message.sender) === myId,
        createdAt: message.createdAt
    };
}

/** Put a new last message on a chat-list row and move the row to the top */
function bumpContact(state, message, myId, { unread = false } = {}) {
    if (!state.contacts || message.room) return state;
    const otherId = keyForMessage(message, myId).slice(2);
    const index = state.contacts.findIndex(contact => contact.user._id === otherId);
    if (index === -1) return state; // unknown contact - the provider reloads the list

    const contact = state.contacts[index];
    const updated = {
        ...contact,
        lastMessage: preview(message, myId),
        unreadCount: unread ? (contact.unreadCount || 0) + 1 : contact.unreadCount
    };
    return { ...state, contacts: [updated, ...state.contacts.filter((_, i) => i !== index)] };
}

/** Same for the rooms list */
function bumpRoom(state, message) {
    if (!state.rooms || !message.room) return state;
    const roomId = idOf(message.room);
    const index = state.rooms.findIndex(room => room._id === roomId);
    if (index === -1) return state;
    const updated = { ...state.rooms[index], lastMessage: message };
    return { ...state, rooms: [updated, ...state.rooms.filter((_, i) => i !== index)] };
}

function bumpPreview(state, message, myId, options) {
    return message.room ? bumpRoom(state, message) : bumpContact(state, message, myId, options);
}

// ---------- reducer ----------

export function chatReducer(state, action) {
    switch (action.type) {
        case 'CONTACTS_LOADED':
            return { ...state, contacts: action.contacts };

        case 'ROOMS_LOADED':
            return { ...state, rooms: action.rooms };

        case 'PUBLIC_ROOMS_LOADED':
            return { ...state, publicRooms: action.rooms };

        case 'CHAT_OPENED': {
            let next = { ...state, active: action.chat, replyTo: null };
            // Opening a private chat reads all its messages
            if (action.chat.type === 'private' && state.contacts) {
                next.contacts = state.contacts.map(contact =>
                    contact.user._id === action.chat.user._id ? { ...contact, unreadCount: 0 } : contact
                );
            }
            return next;
        }

        case 'UNREAD_CLEARED':
            if (!state.contacts) return state;
            return {
                ...state,
                contacts: state.contacts.map(contact =>
                    contact.user._id === action.userId ? { ...contact, unreadCount: 0 } : contact
                )
            };

        case 'CHAT_CLOSED':
            return { ...state, active: null, replyTo: null };

        case 'HISTORY_LOADED': {
            // Keep messages still being sent (they have no _id yet)
            const pending = (state.messages[action.key] || []).filter(message => !message._id);
            return { ...state, messages: { ...state.messages, [action.key]: [...action.messages, ...pending] } };
        }

        case 'MESSAGE_SENDING': {
            const list = state.messages[action.key] || [];
            const next = { ...state, messages: { ...state.messages, [action.key]: [...list, action.message] }, replyTo: null };
            return bumpPreview(next, action.message, action.myId);
        }

        case 'MESSAGE_CONFIRMED': {
            const { message, myId } = action;
            const key = keyForMessage(message, myId);
            const list = state.messages[key] || [];
            const confirmed = { ...message };
            delete confirmed.tempId;

            let updatedList;
            if (list.some(m => m.tempId && m.tempId === message.tempId)) {
                updatedList = list.map(m => (m.tempId === message.tempId ? confirmed : m));
            } else if (list.some(m => m._id === message._id)) {
                updatedList = list;
            } else {
                updatedList = [...list, confirmed];
            }
            const next = { ...state, messages: { ...state.messages, [key]: updatedList } };
            return bumpPreview(next, message, myId);
        }

        case 'MESSAGE_FAILED':
            return updateAllMessages(state, message =>
                message.tempId === action.tempId && !message._id ? { ...message, status: 'failed' } : message
            );

        case 'MESSAGE_DISCARDED':
            return updateMessages(state, action.key, list => list.filter(m => m.tempId !== action.tempId));

        case 'MESSAGE_RECEIVED': {
            const { message, myId, isActive } = action;
            const key = keyForMessage(message, myId);
            let next = state;
            const list = state.messages[key];
            if (list && !list.some(m => m._id === message._id)) {
                next = { ...state, messages: { ...state.messages, [key]: [...list, message] } };
            }
            // A new message also means they stopped typing
            if (next.typing[key]) {
                const typing = { ...next.typing };
                delete typing[key];
                next = { ...next, typing };
            }
            return bumpPreview(next, message, myId, { unread: !isActive });
        }

        case 'MESSAGES_DELIVERED': {
            const ids = new Set(action.messageIds.map(String));
            return updateAllMessages(state, message =>
                ids.has(message._id) ? { ...message, isDelivered: true } : message
            );
        }

        case 'MESSAGES_READ':
            // `by` read everything I sent them
            return updateMessages(state, privateKey(action.by), list =>
                list.map(message =>
                    idOf(message.sender) !== action.by && message._id
                        ? { ...message, isDelivered: true, isRead: true }
                        : message
                )
            );

        case 'MESSAGE_DELETED': {
            if (action.scope === 'me') {
                const messages = {};
                for (const [key, list] of Object.entries(state.messages)) {
                    messages[key] = list.filter(message => message._id !== action.messageId);
                }
                return { ...state, messages };
            }
            return updateAllMessages(state, message => {
                if (message._id === action.messageId) {
                    return { ...message, isDeleted: true, content: '' };
                }
                if (idOf(message.replyTo) === action.messageId && message.replyTo) {
                    return { ...message, replyTo: { ...message.replyTo, isDeleted: true, content: '' } };
                }
                return message;
            });
        }

        case 'TYPING': {
            const typing = { ...state.typing };
            if (action.name) typing[action.key] = action.name;
            else delete typing[action.key];
            return { ...state, typing };
        }

        case 'PRESENCE':
            return {
                ...state,
                presence: {
                    ...state.presence,
                    [action.userId]: { isOnline: action.isOnline, lastSeen: action.lastSeen }
                }
            };

        case 'REPLY_SET':
            return { ...state, replyTo: action.message };

        case 'RESET':
            return initialChatState;

        default:
            return state;
    }
}
