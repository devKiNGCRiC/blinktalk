import { http } from './client';

export async function login(identifier, password) {
    const { data } = await http.post('/auth/login', { identifier, password });
    return data.data; // { user, token }
}

export async function register(fields) {
    const { data } = await http.post('/auth/register', fields);
    return data.data; // { user, token }
}

export async function verify() {
    const { data } = await http.get('/auth/verify');
    return data.data.user;
}

export function logout() {
    return http.post('/auth/logout');
}

export function changePassword(currentPassword, newPassword, confirmNewPassword) {
    return http.post('/auth/change-password', { currentPassword, newPassword, confirmNewPassword });
}
