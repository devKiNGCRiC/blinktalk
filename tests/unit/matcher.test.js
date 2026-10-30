// Unit tests for the stranger matcher (pure, in memory)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMatcher } = require('../../backend/stranger/matcher');

let counter = 0;

/** Build a queue entry; every entry gets its own device unless overridden */
function entry(overrides = {}) {
    counter++;
    return {
        sessionId: `s${counter}`,
        socketId: `sock${counter}`,
        keys: { userId: null, deviceId: `dev${counter}`, ip: '1.1.1.1', ...overrides.keys },
        registered: false,
        interests: [],
        language: null,
        gender: null,
        country: null,
        filters: { gender: null, country: null, ...overrides.filters },
        joinedAt: 0,
        ...overrides,
        // keep the merged nested objects
        ...(overrides.keys && { keys: { userId: null, deviceId: `dev${counter}`, ip: '1.1.1.1', ...overrides.keys } }),
        ...(overrides.filters && { filters: { gender: null, country: null, ...overrides.filters } })
    };
}

const matcher = () => createMatcher({ tagWaitMs: 5000, filterWaitMs: 15000 });

test('two people without interests match straight away', () => {
    const m = matcher();
    const a = entry();
    assert.equal(m.add(a, 0), null);
    const b = entry();
    assert.equal(m.add(b, 0).sessionId, a.sessionId);
    assert.equal(m.size(), 0);
});

test('different interests wait for the tag wait, then match on sweep', () => {
    const m = matcher();
    const a = entry({ interests: ['cricket'] });
    const b = entry({ interests: ['anime'] });
    m.add(a, 0);
    assert.equal(m.add(b, 0), null);
    assert.equal(m.sweep(4000).pairs.length, 0);
    const { pairs } = m.sweep(5000);
    assert.equal(pairs.length, 1);
    assert.deepEqual(pairs[0].map(e => e.sessionId).sort(), [a.sessionId, b.sessionId].sort());
});

test('a shared interest matches immediately, ahead of older entries', () => {
    const m = matcher();
    const old = entry({ interests: ['cricket'], joinedAt: 0 });
    const musician = entry({ interests: ['music'], joinedAt: 100 });
    m.add(old, 0);
    m.add(musician, 100);
    const newcomer = entry({ interests: ['music', 'art'], joinedAt: 200 });
    assert.equal(m.add(newcomer, 200).sessionId, musician.sessionId);
});

test('same language matches immediately', () => {
    const m = matcher();
    m.add(entry({ interests: ['cricket'], language: 'hi' }), 0);
    assert.ok(m.add(entry({ interests: ['anime'], language: 'hi' }), 0));
});

test('the same device never matches itself', () => {
    const m = matcher();
    m.add(entry({ keys: { deviceId: 'same' } }), 0);
    assert.equal(m.add(entry({ keys: { deviceId: 'same' } }), 0), null);
    assert.equal(m.sweep(60000).pairs.length, 0);
});

test('the same user in two tabs never matches', () => {
    const m = matcher();
    m.add(entry({ registered: true, keys: { userId: 'u1' } }), 0);
    assert.equal(m.add(entry({ registered: true, keys: { userId: 'u1' } }), 0), null);
    assert.equal(m.sweep(60000).pairs.length, 0);
});

test('a gender filter never matches an anonymous user, and reports no-match once', () => {
    const m = matcher();
    const picky = entry({ registered: true, keys: { userId: 'u2' }, filters: { gender: 'female' } });
    m.add(picky, 0);
    m.add(entry(), 0);
    assert.equal(m.sweep(14000).noMatch.length, 0);
    const result = m.sweep(15000);
    assert.equal(result.pairs.length, 0);
    assert.deepEqual(result.noMatch.map(e => e.sessionId), [picky.sessionId]);
    assert.equal(m.sweep(16000).noMatch.length, 0);
    assert.equal(m.sweep(60000).pairs.length, 0);
});

test('filters are mutual', () => {
    const m = matcher();
    m.add(entry({ registered: true, keys: { userId: 'a' }, country: 'US', filters: { country: 'IN' } }), 0);
    assert.equal(m.add(entry({ registered: true, keys: { userId: 'b' }, country: 'IN', filters: { country: 'IN' } }), 0), null);
});

test('a filter matches someone who fits it', () => {
    const m = matcher();
    m.add(entry({ registered: true, keys: { userId: 'c' }, gender: 'female' }), 0);
    assert.ok(m.add(entry({ registered: true, keys: { userId: 'd' }, filters: { gender: 'female' } }), 0));
});

test('widen clears filters so the next sweep can match', () => {
    const m = matcher();
    const picky = entry({ registered: true, keys: { userId: 'e' }, interests: ['chess'], filters: { gender: 'female' } });
    m.add(picky, 0);
    m.add(entry(), 0);
    assert.equal(m.sweep(1000).pairs.length, 0);
    m.widen(picky.sessionId);
    assert.equal(m.sweep(1001).pairs.length, 1);
});

test('signed-up users are matched before older anonymous ones', () => {
    const m = matcher();
    m.add(entry({ joinedAt: 0, interests: ['x1'] }), 0);
    const member = entry({ registered: true, keys: { userId: 'f' }, joinedAt: 100, interests: ['x2'] });
    m.add(member, 100);
    const newcomer = entry({ joinedAt: 6000 });
    assert.equal(m.add(newcomer, 6000).sessionId, member.sessionId);
});

test('a skip blocks re-matching for 5 minutes', () => {
    const m = matcher();
    const a = entry({ keys: { deviceId: 'ka' } });
    const b = entry({ keys: { deviceId: 'kb' } });
    m.rememberSkip(a.keys, b.keys, 0);
    m.add(a, 1000);
    assert.equal(m.add(b, 1000), null);
    assert.equal(m.sweep(299000).pairs.length, 0);
    assert.equal(m.sweep(300001).pairs.length, 1);
});

test('remove takes someone out of the queue', () => {
    const m = matcher();
    const a = entry();
    m.add(a, 0);
    m.remove(a.sessionId);
    assert.equal(m.size(), 0);
    assert.equal(m.add(entry(), 0), null);
});
