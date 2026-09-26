import { http } from './client';

export async function getMyRooms() {
    const { data } = await http.get('/rooms');
    return data.data.rooms;
}

export async function getPublicRooms() {
    const { data } = await http.get('/rooms/public');
    return data.data.rooms;
}

export async function searchRooms(query) {
    const { data } = await http.get('/rooms/search', { params: { q: query } });
    return data.data.rooms;
}

export async function createRoom(fields) {
    const { data } = await http.post('/rooms', fields);
    return data.data.room;
}

/** Join a room. Being a member already is fine. */
export async function joinRoom(roomId) {
    try {
        await http.post(`/rooms/${roomId}/join`);
    } catch (error) {
        const alreadyMember = error.response?.status === 400 && /already a member/i.test(error.response.data?.message);
        if (!alreadyMember) throw error;
    }
}
