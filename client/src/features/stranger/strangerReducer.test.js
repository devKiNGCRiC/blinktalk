import { describe, test, expect } from 'vitest';
import { strangerReducer, initialStrangerState } from './strangerReducer';

const run = (...actions) => actions.reduce(strangerReducer, initialStrangerState);
const connected = { type: 'CONNECTED', partner: { registered: false }, icebreaker: 'Cats or dogs?' };
const message = (id, from, content = id) => ({ type: 'MESSAGE', id, content, from, timestamp: '2026-10-31T10:00:00Z' });

describe('strangerReducer', () => {
    test('CONNECTED clears old lines and stores partner and icebreaker', () => {
        const state = run(connected, message('a', 'you'), { type: 'SEARCH' }, connected);
        expect(state.phase).toBe('connected');
        expect(state.lines.map(line => line.kind)).toEqual(['system']);
        expect(state.lines[0].text).toMatch(/stranger/i);
        expect(state.partner).toEqual({ registered: false });
        expect(state.icebreaker).toBe('Cats or dogs?');
    });

    test('messages from you are mine, from the stranger are theirs, and stop typing', () => {
        const state = run(connected, { type: 'TYPING', on: true }, message('a', 'you'), message('b', 'stranger'));
        expect(state.lines.map(line => line.kind)).toEqual(['system', 'me', 'them']);
        expect(state.typing).toBe(false);
    });

    test('reactions land on the right message and null clears them', () => {
        let state = run(connected, message('a', 'you'), message('b', 'stranger'));
        state = strangerReducer(state, { type: 'REACTION', messageId: 'a', emoji: '😂', from: 'stranger' });
        const line = id => state.lines.find(l => l.id === id);
        expect(line('a').reaction).toEqual({ mine: null, theirs: '😂' });
        expect(line('b').reaction).toEqual({ mine: null, theirs: null });
        state = strangerReducer(state, { type: 'REACTION', messageId: 'a', emoji: null, from: 'stranger' });
        expect(line('a').reaction.theirs).toBe(null);
    });

    test('partner leaving ends the chat and cancels a pending friend request', () => {
        const state = run(connected, { type: 'FRIEND_SENT' }, { type: 'PARTNER_LEFT' });
        expect(state.phase).toBe('ended');
        expect(state.friend).toBe('none');
        expect(state.lines.at(-1).kind).toBe('system');
    });

    test('a friendship survives the partner leaving', () => {
        const user = { _id: 'u1', username: 'sam' };
        const state = run(connected, { type: 'FRIEND_ADDED', user }, { type: 'PARTNER_LEFT' });
        expect(state.friend).toBe('added');
        expect(state.friendUser).toEqual(user);
    });

    test('hitting the daily limit goes back to the start screen', () => {
        const state = run({ type: 'SEARCH' }, { type: 'LIMIT', limit: 15, resetsAt: '2026-11-01T00:00:00Z' });
        expect(state.phase).toBe('idle');
        expect(state.limit).toEqual({ limit: 15, resetsAt: '2026-11-01T00:00:00Z' });
    });

    test('a ban goes back to the start screen with the end time', () => {
        const state = run({ type: 'SEARCH' }, { type: 'BANNED', until: '2026-11-01T10:00:00Z' });
        expect(state.phase).toBe('idle');
        expect(state.bannedUntil).toBe('2026-11-01T10:00:00Z');
    });

    test('no-match shows the widen prompt; widening hides it', () => {
        let state = run({ type: 'SEARCH' }, { type: 'NO_MATCH' });
        expect(state.noMatch).toBe(true);
        state = strangerReducer(state, { type: 'WIDEN' });
        expect(state.noMatch).toBe(false);
    });

    test('losing the connection: searching goes idle, chatting ends', () => {
        expect(run({ type: 'SEARCH' }, { type: 'CONNECTION_LOST' }).phase).toBe('idle');
        const chatting = run(connected, { type: 'CONNECTION_LOST' });
        expect(chatting.phase).toBe('ended');
        expect(chatting.lines.at(-1).kind).toBe('system');
    });

    test('ENDED while searching means cancelled, while chatting means you left', () => {
        expect(run({ type: 'SEARCH' }, { type: 'ENDED', message: 'bye' }).phase).toBe('idle');
        const left = run(connected, { type: 'ENDED', message: 'You left the chat.' });
        expect(left.phase).toBe('ended');
        expect(left.lines.at(-1).text).toBe('You left the chat.');
    });
});

test('a signed-up partner is greeted by name', () => {
    const state = strangerReducer(initialStrangerState, { type: 'CONNECTED', partner: { registered: true, displayName: 'Cleo' } });
    expect(state.lines[0].text).toMatch(/Cleo/);
});
