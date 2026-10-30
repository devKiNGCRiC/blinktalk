import { http } from './client';

export async function getContacts() {
    const { data } = await http.get('/users/contacts');
    return data.data.contacts;
}

export function unfriend(userId) {
    return http.delete(`/users/friends/${userId}`);
}

export async function updateProfile(fields) {
    const { data } = await http.put('/users/profile', fields);
    return data.data.user;
}
