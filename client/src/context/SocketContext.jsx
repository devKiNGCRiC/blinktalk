import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Opens one Socket.io connection while the user is logged in or chatting as a guest.
 * Logged-in users authenticate with their JWT on every (re)connect.
 */
export function SocketProvider({ children }) {
    const { status, token } = useAuth();
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [hasConnected, setHasConnected] = useState(false);

    useEffect(() => {
        if (status !== 'user' && status !== 'guest') return undefined;

        const newSocket = io({ transports: ['websocket', 'polling'] });

        newSocket.on('connect', () => {
            setConnected(true);
            setHasConnected(true);
            if (token) newSocket.emit('user:authenticate', { token });
        });
        newSocket.on('disconnect', () => setConnected(false));

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
            setSocket(null);
            setConnected(false);
            setHasConnected(false);
        };
    }, [status, token]);

    const value = {
        socket,
        connected,
        // Show the "Reconnecting…" banner only after we were connected once
        reconnecting: hasConnected && !connected
    };

    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
    return useContext(SocketContext);
}
