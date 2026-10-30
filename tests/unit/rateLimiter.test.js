// Unit tests for the sliding-window rate limiter
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../../backend/stranger/rateLimiter');

test('allows max hits per window, then blocks until the window slides', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    assert.equal(limiter.hit('a', 0), true);
    assert.equal(limiter.hit('a', 10), true);
    assert.equal(limiter.hit('a', 20), false);
    assert.equal(limiter.hit('a', 1001), true);
});

test('keys are independent and reset clears a key', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    assert.equal(limiter.hit('a', 0), true);
    assert.equal(limiter.hit('b', 0), true);
    assert.equal(limiter.hit('a', 5), false);
    limiter.reset('a');
    assert.equal(limiter.hit('a', 6), true);
});
