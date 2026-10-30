// Unit tests for the stranger chat text filters
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { maskBadWords, removeLinks, cleanStrangerText } = require('../../backend/stranger/moderation');
const { randomIcebreaker } = require('../../backend/stranger/icebreakers');

test('bad words are masked, whole words only', () => {
    assert.equal(maskBadWords('you are an IDIOT'), 'you are an *****');
    assert.equal(maskBadWords('scunthorpe'), 'scunthorpe');
});

test('links are removed', () => {
    assert.equal(removeLinks('see https://x.com/a ok'), 'see [link removed] ok');
    assert.equal(removeLinks('go to google.com now'), 'go to [link removed] now');
    assert.equal(removeLinks('visit www.example.org'), 'visit [link removed]');
    assert.equal(removeLinks('3.5 is fine'), '3.5 is fine');
    assert.equal(removeLinks('ok.so what'), 'ok.so what');
});

test('cleanStrangerText masks words and keeps links when allowed', () => {
    assert.equal(cleanStrangerText('idiot www.a.io', { allowLinks: true }), '***** www.a.io');
    assert.equal(cleanStrangerText('idiot www.a.io', { allowLinks: false }), '***** [link removed]');
});

test('icebreaker is a non-empty string', () => {
    const question = randomIcebreaker();
    assert.equal(typeof question, 'string');
    assert.ok(question.length > 0);
});
