import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { playPing } from '../../lib/sound';
import { strangerReducer, initialStrangerState } from './strangerReducer';

const TYPING_SHOW_MS = 2500;

/**
 * Stranger chat: listens to the server and offers the actions the screen needs.
 */
export function useStranger() {
    const { socket, connected } = useSocket();
    const { user } = useAuth();
    const toast = useToast();
    const [state, dispatch] = useReducer(strangerReducer, initialStrangerState);
    const typingTimer = useRef(null);

    const userRef = useRef(user);
    userRef.current = user;

    useEffect(() => {
        if (!socket) return undefined;

        const handlers = {
            'stats:online': ({ count }) => dispatch({ type: 'ONLINE', count }),
            'stranger:searching': () => dispatch({ type: 'SEARCHING' }),
            'stranger:connected': ({ partner, icebreaker }) => {
                dispatch({ type: 'CONNECTED', partner, icebreaker });
                if (userRef.current?.preferences?.sounds !== false) playPing();
            },
            'stranger:message': data => dispatch({ type: 'MESSAGE', ...data }),
            'stranger:typing': () => {
                dispatch({ type: 'TYPING', on: true });
                clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => dispatch({ type: 'TYPING', on: false }), TYPING_SHOW_MS);
            },
            'stranger:reaction': data => dispatch({ type: 'REACTION', ...data }),
            'stranger:disconnected': () => dispatch({ type: 'PARTNER_LEFT' }),
            'stranger:ended': ({ message }) => dispatch({ type: 'ENDED', message }),
            'stranger:no-match': () => dispatch({ type: 'NO_MATCH' }),
            'stranger:limit': ({ limit, resetsAt }) => dispatch({ type: 'LIMIT', limit, resetsAt }),
            'stranger:banned': ({ until }) => dispatch({ type: 'BANNED', until }),
            'stranger:rate-limited': ({ message }) => toast.info(message),
            'stranger:friend:requested': () => dispatch({ type: 'FRIEND_RECEIVED' }),
            'stranger:friend:added': ({ user: friend }) => dispatch({ type: 'FRIEND_ADDED', user: friend }),
            'stranger:friend:error': ({ message }) => toast.error(message)
        };

        Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
        return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
    }, [socket, toast]);

    // Ask for the online count whenever the connection (re)opens
    useEffect(() => {
        if (connected) socket?.emit('stats:get');
        else dispatch({ type: 'CONNECTION_LOST' });
    }, [connected, socket]);

    useEffect(() => () => clearTimeout(typingTimer.current), []);

    const search = useCallback(({ interests = [], filters } = {}) => {
        dispatch({ type: 'SEARCH' });
        socket?.emit('stranger:search', { interests, ...(filters && { filters }) });
    }, [socket]);

    const widen = useCallback(() => {
        dispatch({ type: 'WIDEN' });
        socket?.emit('stranger:widen');
    }, [socket]);

    const leave = useCallback(() => socket?.emit('stranger:disconnect'), [socket]);
    const send = useCallback(text => socket?.emit('stranger:message', { content: text }), [socket]);
    const typing = useCallback(isTyping => isTyping && socket?.emit('stranger:typing'), [socket]);
    const react = useCallback((messageId, emoji) => socket?.emit('stranger:react', { messageId, emoji }), [socket]);
    const report = useCallback(reason => socket?.emit('stranger:report', { reason }), [socket]);

    const requestFriend = useCallback(() => {
        dispatch({ type: 'FRIEND_SENT' });
        socket?.emit('stranger:friend:request');
    }, [socket]);

    const acceptFriend = useCallback(() => socket?.emit('stranger:friend:accept'), [socket]);
    const dismissIcebreaker = useCallback(() => dispatch({ type: 'DISMISS_ICEBREAKER' }), []);

    return {
        state,
        connected,
        search,
        widen,
        leave,
        send,
        typing,
        react,
        report,
        requestFriend,
        acceptFriend,
        dismissIcebreaker
    };
}
