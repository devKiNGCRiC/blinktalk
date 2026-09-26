import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { useTheme } from './ThemeContext';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

function readToken() {
    try { return localStorage.getItem('token'); } catch { return null; }
}

function writeToken(token) {
    try {
        if (token) localStorage.setItem('token', token);
        else localStorage.removeItem('token');
    } catch { /* storage blocked */ }
}

/**
 * status:
 *   'loading'   checking a saved session
 *   'signedOut' show the landing / auth screen
 *   'user'      logged in
 *   'guest'     anonymous stranger chat, no account
 */
export function AuthProvider({ children }) {
    const [status, setStatus] = useState('loading');
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const { setTheme } = useTheme();
    const toast = useToast();

    const startSession = useCallback((newUser, newToken) => {
        setAuthToken(newToken);
        writeToken(newToken);
        setToken(newToken);
        setUser(newUser);
        setStatus('user');
        // The theme saved on the account follows the user to every device
        if (newUser.preferences?.theme) setTheme(newUser.preferences.theme);
    }, [setTheme]);

    const clearSession = useCallback(() => {
        setAuthToken(null);
        writeToken(null);
        setToken(null);
        setUser(null);
        setStatus('signedOut');
    }, []);

    // Restore a saved session on first load
    useEffect(() => {
        const saved = readToken();
        if (!saved) {
            setStatus('signedOut');
            return;
        }
        setAuthToken(saved);
        authApi.verify()
            .then(verifiedUser => startSession(verifiedUser, saved))
            .catch(() => clearSession());
    }, [startSession, clearSession]);

    // Any 401 from the API means the session expired
    useEffect(() => {
        setUnauthorizedHandler(() => {
            clearSession();
            toast.error('Your session expired. Log in again.');
        });
    }, [clearSession, toast]);

    const login = useCallback(async (identifier, password) => {
        const result = await authApi.login(identifier, password);
        startSession(result.user, result.token);
    }, [startSession]);

    const register = useCallback(async fields => {
        const result = await authApi.register(fields);
        startSession(result.user, result.token);
    }, [startSession]);

    const logout = useCallback(async () => {
        if (status === 'user') {
            await authApi.logout().catch(() => {});
        }
        clearSession();
    }, [status, clearSession]);

    const value = useMemo(() => ({
        status,
        user,
        token,
        login,
        register,
        logout,
        updateUser: setUser,
        enterGuest: () => setStatus('guest'),
        leaveGuest: () => setStatus('signedOut')
    }), [status, user, token, login, register, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
