import { describe, test, expect } from 'vitest';
import { chatReducer, initialChatState, privateKey, roomKey, keyForMessage } from './chatReducer';

const ME = 'me';
const bob = { _id: 'bob', username: 'bob' };

function stateWithBob(messages = []) {
    return {
        ...initialChatState,
        contacts: [
            { user: { _id: 'zoe' }, lastMessage: { content: 'old' }, unreadCount: 0 },
            { user: bob, lastMessage: { content: 'older' }, unreadCount: 0 }
        ],
        messages: { [privateKey('bob')]: messages }
    };
}

const fromBob = (id, extra = {}) => ({ _id: id, sender: bob, receiver: { _id: ME }, content: id, createdAt: '2026-09-26T10:00:00Z', ...extra });
const fromMe = (id, extra = {}) => ({ _id: id, sender: { _id: ME }, receiver: bob, content: id, createdAt: '2026-09-26T10:00:00Z', ...extra });

describe('keyForMessage', () => {
    test('private and room keys', () => {
        expect(keyForMessage(fromBob('a'), ME)).toBe('u:bob');
        expect(keyForMessage(fromMe('a'), ME)).toBe('u:bob');
        expect(keyForMessage({ room: 'r1', sender: bob }, ME)).toBe(roomKey('r1'));
    });
});

describe('chatReducer', () => {
    test('sending then confirming replaces the pending message by tempId', () => {
        let state = stateWithBob();
        state = chatReducer(state, {
            type: 'MESSAGE_SENDING', key: 'u:bob', myId: ME,
            message: { tempId: 't1', sender: { _id: ME }, receiver: bob, content: 'hi', status: 'sending', createdAt: 'x' }
        });
        expect(state.messages['u:bob']).toHaveLength(1);
        expect(state.contacts[0].user._id).toBe('bob'); // moved to top

        state = chatReducer(state, { type: 'MESSAGE_CONFIRMED', myId: ME, message: fromMe('m1', { tempId: 't1', content: 'hi' }) });
        expect(state.messages['u:bob']).toEqual([expect.objectContaining({ _id: 'm1', content: 'hi' })]);
        expect(state.messages['u:bob'][0].status).toBeUndefined();
        expect(state.messages['u:bob'][0].tempId).toBeUndefined();
    });

    test('failed send is marked failed and can be discarded', () => {
        let state = stateWithBob([{ tempId: 't1', content: 'hi', status: 'sending' }]);
        state = chatReducer(state, { type: 'MESSAGE_FAILED', tempId: 't1' });
        expect(state.messages['u:bob'][0].status).toBe('failed');
        state = chatReducer(state, { type: 'MESSAGE_DISCARDED', key: 'u:bob', tempId: 't1' });
        expect(state.messages['u:bob']).toHaveLength(0);
    });

    test('received message counts as unread only when the chat is not open', () => {
        let state = chatReducer(stateWithBob(), { type: 'MESSAGE_RECEIVED', myId: ME, isActive: false, message: fromBob('a') });
        expect(state.contacts[0]).toMatchObject({ unreadCount: 1, lastMessage: { content: 'a', fromMe: false } });
        expect(state.messages['u:bob']).toHaveLength(1);

        state = chatReducer(state, { type: 'MESSAGE_RECEIVED', myId: ME, isActive: true, message: fromBob('b') });
        expect(state.contacts[0].unreadCount).toBe(1);

        // duplicates are ignored
        state = chatReducer(state, { type: 'MESSAGE_RECEIVED', myId: ME, isActive: true, message: fromBob('b') });
        expect(state.messages['u:bob']).toHaveLength(2);
    });

    test('opening a private chat clears its unread count', () => {
        let state = stateWithBob();
        state.contacts[1].unreadCount = 4;
        state = chatReducer(state, { type: 'CHAT_OPENED', chat: { type: 'private', user: bob } });
        expect(state.contacts[1].unreadCount).toBe(0);
    });

    test('delivered and read receipts', () => {
        let state = stateWithBob([fromMe('m1'), fromMe('m2'), fromBob('b1')]);
        state = chatReducer(state, { type: 'MESSAGES_DELIVERED', messageIds: ['m1'] });
        expect(state.messages['u:bob'][0].isDelivered).toBe(true);
        expect(state.messages['u:bob'][1].isDelivered).toBeUndefined();

        state = chatReducer(state, { type: 'MESSAGES_READ', by: 'bob' });
        expect(state.messages['u:bob'].filter(m => m.isRead).map(m => m._id)).toEqual(['m1', 'm2']);
    });

    test('delete for everyone blanks the message and its quotes; delete for me removes it', () => {
        let state = stateWithBob([fromBob('b1'), fromMe('m1', { replyTo: { _id: 'b1', content: 'b1' } })]);
        state = chatReducer(state, { type: 'MESSAGE_DELETED', messageId: 'b1', scope: 'everyone' });
        expect(state.messages['u:bob'][0]).toMatchObject({ isDeleted: true, content: '' });
        expect(state.messages['u:bob'][1].replyTo).toMatchObject({ isDeleted: true, content: '' });

        state = chatReducer(state, { type: 'MESSAGE_DELETED', messageId: 'm1', scope: 'me' });
        expect(state.messages['u:bob'].map(m => m._id)).toEqual(['b1']);
    });

    test('history keeps pending messages', () => {
        let state = stateWithBob([{ tempId: 't1', content: 'pending' }]);
        state = chatReducer(state, { type: 'HISTORY_LOADED', key: 'u:bob', messages: [fromBob('b1')] });
        expect(state.messages['u:bob'].map(m => m._id ?? m.tempId)).toEqual(['b1', 't1']);
    });

    test('a new message clears the typing indicator', () => {
        let state = chatReducer(stateWithBob(), { type: 'TYPING', key: 'u:bob', name: 'bob' });
        expect(state.typing['u:bob']).toBe('bob');
        state = chatReducer(state, { type: 'MESSAGE_RECEIVED', myId: ME, isActive: true, message: fromBob('a') });
        expect(state.typing['u:bob']).toBeUndefined();
    });
});
