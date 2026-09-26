import { http } from './client';

export async function getContacts() {
    const { data } = await http.get('/users/contacts');
    return data.data.contacts;
}

export async function searchUsers(query) {
    const { data } = await http.get('/users/search', { params: { q: query } });
    return data.data.users;
}

export async function updateProfile(fields) {
    const { data } = await http.put('/users/profile', fields);
    return data.data.user;
}
