import { describe, test, expect } from 'vitest';
import { groupMessages } from './grouping';
import { formatDayLabel, formatLastSeen, formatListTime } from './format';
import { resolveInitialTheme } from './theme';
import { checkPassword, isStrongPassword, usernameError } from './password';

const NOW = new Date(2026, 8, 26, 18, 0); // 26 Sep 2026, 18:00 local time
const at = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();
const msg = (id, sender, createdAt, extra = {}) => ({ _id: id, sender: { _id: sender }, content: id, createdAt, ...extra });

describe('groupMessages', () => {
    test('adds day dividers and groups by sender within 5 minutes', () => {
        const items = groupMessages([
            msg('a', 'me', at(25, 10, 0)),
            msg('b', 'me', at(26, 9, 0)),
            msg('c', 'me', at(26, 9, 3)),
            msg('d', 'you', at(26, 9, 4)),
            msg('e', 'you', at(26, 9, 20))
        ], 'me', NOW);

        expect(items.filter(i => i.kind === 'day').map(i => i.label)).toEqual(['Yesterday', 'Today']);

        const byId = Object.fromEntries(items.filter(i => i.kind === 'message').map(i => [i.message._id, i]));
        expect(byId.a).toMatchObject({ isMine: true, isFirst: true, isLast: true });
        expect(byId.b).toMatchObject({ isFirst: true, isLast: false });
        expect(byId.c).toMatchObject({ isFirst: false, isLast: true });
        expect(byId.d).toMatchObject({ isMine: false, isFirst: true, isLast: true }); // 16 min gap to e
        expect(byId.e).toMatchObject({ isFirst: true, isLast: true });
    });

    test('system messages never join a group', () => {
        const items = groupMessages([
            msg('a', 'you', at(26, 9, 0)),
            msg('s', 'you', at(26, 9, 1), { type: 'system' }),
            msg('b', 'you', at(26, 9, 2))
        ], 'me', NOW).filter(i => i.kind === 'message');
        expect(items.every(i => i.isFirst && i.isLast)).toBe(true);
    });

    test('pending messages use tempId as key', () => {
        const [, item] = groupMessages([{ tempId: 't1', sender: { _id: 'me' }, createdAt: at(26, 9) }], 'me', NOW);
        expect(item.key).toBe('t1');
    });
});

describe('format', () => {
    test('day labels', () => {
        expect(formatDayLabel(at(26, 1), NOW)).toBe('Today');
        expect(formatDayLabel(at(25, 23), NOW)).toBe('Yesterday');
    });

    test('list time', () => {
        expect(formatListTime(at(25, 12), NOW)).toBe('Yesterday');
        expect(formatListTime(null, NOW)).toBe('');
    });

    test('last seen', () => {
        expect(formatLastSeen(new Date(NOW - 30 * 1000), NOW)).toBe('last seen just now');
        expect(formatLastSeen(new Date(NOW - 5 * 60 * 1000), NOW)).toBe('last seen 5m ago');
        expect(formatLastSeen(at(25, 12), NOW)).toMatch(/^last seen yesterday at /);
        expect(formatLastSeen(null, NOW)).toBe('offline');
    });
});

describe('resolveInitialTheme', () => {
    test('saved theme wins', () => {
        expect(resolveInitialTheme('matcha', true)).toBe('matcha');
    });
    test('falls back to the OS preference', () => {
        expect(resolveInitialTheme(null, true)).toBe('light');
        expect(resolveInitialTheme('not-a-theme', false)).toBe('midnight');
    });
});

describe('password rules', () => {
    test('live checklist', () => {
        expect(checkPassword('abc').filter(r => r.met).map(r => r.id)).toEqual(['lower']);
        expect(isStrongPassword('Test123')).toBe(true);
        expect(isStrongPassword('test123')).toBe(false);
    });
    test('username', () => {
        expect(usernameError('ab')).toBeTruthy();
        expect(usernameError('bad name')).toBeTruthy();
        expect(usernameError('good_name1')).toBeNull();
    });
});
