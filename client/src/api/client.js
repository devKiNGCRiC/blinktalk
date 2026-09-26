import axios from 'axios';

// One axios instance for the whole app.
// AuthContext tells it the current token and what to do when the session expires.
export const http = axios.create({ baseURL: '/api' });

let authToken = null;
let onUnauthorized = () => {};

export function setAuthToken(token) {
    authToken = token;
}

export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

http.interceptors.request.use(config => {
    if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
    return config;
});

http.interceptors.response.use(
    response => response,
    error => {
        // Only an expired/invalid session logs out - not a wrong password on the login form
        const isLoginAttempt = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/register');
        if (error.response?.status === 401 && authToken && !isLoginAttempt) {
            onUnauthorized();
        }
        return Promise.reject(error);
    }
);

/** Human-readable message for a failed request */
export function errorMessage(error, fallback = 'Something went wrong. Try again.') {
    const data = error?.response?.data;
    if (data?.errors?.length) return data.errors[0].message;
    if (data?.message) return data.message;
    if (error?.request && !error?.response) return 'Can\'t reach the server. Check your connection.';
    return fallback;
}
