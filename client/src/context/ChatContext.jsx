import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { chatReducer, initialChatState, activeKey, keyForMessage, privateKey, roomKey } from './chatReducer';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { useToast } from './ToastContext';
import { errorMessage } from '../api/client';
import * as usersApi from '../api/users';
import * as roomsApi from '../api/rooms';
import * as messagesApi from '../api/messages';
import { playPing } from '../lib/sound';

const ChatContext = createContext(null);

// A message not confirmed by the server within this time is shown as failed
const SEND_TIMEOUT_MS = 10000;
// Hide "typing…" if the stop event never arrives
const TYPING_TIMEOUT_MS = 4000;

let tempCounter = 0;
const newTempId = () => `tmp-${Date.now()}-${tempCounter++}`;

export function ChatProvider({ children }) {
    const [state, dispatch] = useReducer(chatReducer, initialChatState);
    const { user } = useAuth();
    const { socket } = useSocket();
    const toast = useToast();

    // Socket handlers are registered once, so they read the latest values from refs
    const stateRef = useRef(state);
    stateRef.current = state;
    const userRef = useRef(user);
    userRef.current = user;
    const sendTimers = useRef(new Map());
    const typingTimers = useRef(new Map());

    const myId = user?._id;

    // ---------- loading ----------

    const loadContacts = useCallback(async () => {
        try {
            dispatch({ type: 'CONTACTS_LOADED', contacts: await usersApi.getContacts() });
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn\'t load your chats.'));
            dispatch({ type: 'CONTACTS_LOADED', contacts: [] });
        }
    }, [toast]);

    const loadRooms = useCallback(async () => {
        try {
            const [mine, publicRooms] = await Promise.all([roomsApi.getMyRooms(), roomsApi.getPublicRooms()]);
            dispatch({ type: 'ROOMS_LOADED', rooms: mine });
            const mineIds = new Set(mine.map(room => room._id));
            dispatch({ type: 'PUBLIC_ROOMS_LOADED', rooms: publicRooms.filter(room => !mineIds.has(room._id)) });
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn\'t load rooms.'));
            dispatch({ type: 'ROOMS_LOADED', rooms: [] });
        }
    }, [toast]);

    const loadHistory = useCallback(async chat => {
        try {
            const messages = chat.type === 'room'
                ? await messagesApi.getRoomMessages(chat.room._id)
                : await messagesApi.getPrivateMessages(chat.user._id);
            const key = chat.type === 'room' ? roomKey(chat.room._id) : privateKey(chat.user._id);
            dispatch({ type: 'HISTORY_LOADED', key, messages });
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn\'t load messages.'));
        }
    }, [toast]);

    useEffect(() => {
        loadContacts();
        loadRooms();
    }, [loadContacts, loadRooms]);

    // ---------- socket events ----------

    useEffect(() => {
        if (!socket) return undefined;

        const isVisible = () => document.visibilityState === 'visible';
        const notify = () => {
            if (userRef.current?.preferences?.sounds !== false) playPing();
        };

        const clearSendTimer = tempId => {
            clearTimeout(sendTimers.current.get(tempId));
            sendTimers.current.delete(tempId);
        };

        const setTyping = (key, name) => {
            clearTimeout(typingTimers.current.get(key));
            dispatch({ type: 'TYPING', key, name });
            if (name) {
                typingTimers.current.set(key, setTimeout(() => dispatch({ type: 'TYPING', key, name: null }), TYPING_TIMEOUT_MS));
            }
        };

        const handlers = {
            // Fires on every (re)connect: refresh everything we might have missed
            'user:authenticated': () => {
                loadContacts();
                loadRooms();
                const { active } = stateRef.current;
                if (active) loadHistory(active);
            },

            'message:received': message => {
                const key = keyForMessage(message, myId);
                const isActive = activeKey(stateRef.current) === key && isVisible();
                dispatch({ type: 'MESSAGE_RECEIVED', message, myId, isActive });
                if (isActive) {
                    socket.emit('messages:read', { userId: message.sender._id });
                } else {
                    notify();
                }
                // A message from someone new: reload the list so they appear
                if (!stateRef.current.contacts?.some(contact => contact.user._id === message.sender._id)) {
                    loadContacts();
                }
            },

            'message:room:received': message => {
                const isActive = activeKey(stateRef.current) === roomKey(message.room);
                dispatch({ type: 'MESSAGE_RECEIVED', message, myId, isActive });
                if (!isActive || !isVisible()) notify();
            },

            'message:sent': message => {
                clearSendTimer(message.tempId);
                dispatch({ type: 'MESSAGE_CONFIRMED', message, myId });
                if (!message.room && !stateRef.current.contacts?.some(contact => contact.user._id === message.receiver._id)) {
                    loadContacts();
                }
            },

            'message:error': ({ tempId, message }) => {
                if (tempId) {
                    clearSendTimer(tempId);
                    dispatch({ type: 'MESSAGE_FAILED', tempId });
                }
                toast.error(message);
            },

            'message:delivered': ({ messageIds }) => dispatch({ type: 'MESSAGES_DELIVERED', messageIds }),
            'messages:read': ({ by }) => dispatch({ type: 'MESSAGES_READ', by }),
            'message:deleted': ({ messageId, scope }) => dispatch({ type: 'MESSAGE_DELETED', messageId, scope }),

            'typing:start': ({ userId, displayName, roomId }) => {
                setTyping(roomId ? roomKey(roomId) : privateKey(userId), displayName);
            },
            'typing:stop': ({ userId, roomId }) => {
                setTyping(roomId ? roomKey(roomId) : privateKey(userId), null);
            },

            'user:online': ({ userId }) => dispatch({ type: 'PRESENCE', userId, isOnline: true }),
            'user:offline': ({ userId, lastSeen }) => dispatch({ type: 'PRESENCE', userId, isOnline: false, lastSeen }),

            error: ({ message }) => {
                if (message && message !== 'No stranger connected') toast.error(message);
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
        return () => {
            Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
        };
    }, [socket, myId, toast, loadContacts, loadRooms, loadHistory]);

    // Coming back to the tab reads the open chat
    useEffect(() => {
        const onVisible = () => {
            const { active } = stateRef.current;
            if (document.visibilityState !== 'visible' || active?.type !== 'private') return;
            socket?.emit('messages:read', { userId: active.user._id });
            dispatch({ type: 'UNREAD_CLEARED', userId: active.user._id });
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [socket]);

    // Clean up timers when leaving
    useEffect(() => () => {
        sendTimers.current.forEach(clearTimeout);
        typingTimers.current.forEach(clearTimeout);
    }, []);

    // ---------- actions ----------

    const openChat = useCallback(chat => {
        dispatch({ type: 'CHAT_OPENED', chat });
        loadHistory(chat);
        if (!socket) return;
        if (chat.type === 'private') {
            socket.emit('messages:read', { userId: chat.user._id });
        } else {
            socket.emit('room:join', { roomId: chat.room._id });
        }
    }, [socket, loadHistory]);

    const closeChat = useCallback(() => dispatch({ type: 'CHAT_CLOSED' }), []);

    const sendMessage = useCallback((content, replyTo = stateRef.current.replyTo) => {
        const { active } = stateRef.current;
        const text = content.trim();
        if (!active || !text || !socket) return;

        const tempId = newTempId();
        const key = activeKey(stateRef.current);
        const pending = {
            tempId,
            status: 'sending',
            content: text,
            type: 'text',
            sender: { _id: myId, username: user.username, displayName: user.displayName, avatar: user.avatar },
            receiver: active.type === 'private' ? active.user : null,
            room: active.type === 'room' ? active.room._id : null,
            replyTo: replyTo ? { _id: replyTo._id, content: replyTo.content, sender: replyTo.sender, isDeleted: replyTo.isDeleted } : null,
            createdAt: new Date().toISOString()
        };
        dispatch({ type: 'MESSAGE_SENDING', key, message: pending, myId });

        if (active.type === 'private') {
            socket.emit('message:private', { receiverId: active.user._id, content: text, replyTo: replyTo?._id, tempId });
        } else {
            socket.emit('message:room', { roomId: active.room._id, content: text, replyTo: replyTo?._id, tempId });
        }

        sendTimers.current.set(tempId, setTimeout(() => {
            dispatch({ type: 'MESSAGE_FAILED', tempId });
            sendTimers.current.delete(tempId);
        }, SEND_TIMEOUT_MS));
    }, [socket, myId, user]);

    const retryMessage = useCallback(message => {
        dispatch({ type: 'MESSAGE_DISCARDED', key: activeKey(stateRef.current), tempId: message.tempId });
        sendMessage(message.content, message.replyTo);
    }, [sendMessage]);

    const deleteMessage = useCallback((message, scope) => {
        socket?.emit('message:delete', { messageId: message._id, scope });
    }, [socket]);

    const setReplyTo = useCallback(message => dispatch({ type: 'REPLY_SET', message }), []);

    const joinAndOpenRoom = useCallback(async room => {
        try {
            await roomsApi.joinRoom(room._id);
            await loadRooms();
            openChat({ type: 'room', room });
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn\'t join this room.'));
        }
    }, [loadRooms, openChat, toast]);

    const createRoom = useCallback(async fields => {
        const room = await roomsApi.createRoom(fields);
        await loadRooms();
        openChat({ type: 'room', room });
        toast.success(`Created ${room.name}`);
        return room;
    }, [loadRooms, openChat, toast]);

    // Typing indicator for the open chat
    const emitTyping = useCallback(isTyping => {
        const { active } = stateRef.current;
        if (!socket || !active) return;
        const target = active.type === 'private' ? { receiverId: active.user._id } : { roomId: active.room._id };
        socket.emit(isTyping ? 'typing:start' : 'typing:stop', target);
    }, [socket]);

    // Unread total in the browser tab title
    const totalUnread = (state.contacts || []).reduce((sum, contact) => sum + (contact.unreadCount || 0), 0);
    useEffect(() => {
        document.title = totalUnread ? `(${totalUnread}) BlinkTalk` : 'BlinkTalk';
        return () => { document.title = 'BlinkTalk'; };
    }, [totalUnread]);

    const value = useMemo(() => ({
        ...state,
        myId,
        totalUnread,
        activeKey: activeKey(state),
        openChat,
        closeChat,
        sendMessage,
        retryMessage,
        deleteMessage,
        setReplyTo,
        joinAndOpenRoom,
        createRoom,
        emitTyping,
        reloadRooms: loadRooms
    }), [state, myId, totalUnread, openChat, closeChat, sendMessage, retryMessage, deleteMessage, setReplyTo, joinAndOpenRoom, createRoom, emitTyping, loadContacts, loadRooms]);

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
    return useContext(ChatContext);
}
