import { http } from './client';

// The server returns newest first; the UI wants oldest first.

export async function getPrivateMessages(userId) {
    const { data } = await http.get(`/messages/${userId}`, { params: { limit: 100 } });
    return data.data.messages.reverse();
}

export async function getRoomMessages(roomId) {
    const { data } = await http.get(`/messages/room/${roomId}`, { params: { limit: 100 } });
    return data.data.messages.reverse();
}
