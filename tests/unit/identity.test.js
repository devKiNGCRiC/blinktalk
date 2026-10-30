// Unit tests for working out who a socket is
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientIp, cleanDeviceId, countedKeys, reporterKeyOf } = require('../../backend/stranger/identity');

test('without a trusted proxy, X-Forwarded-For is ignored', () => {
    assert.equal(clientIp({ 'x-forwarded-for': '6.6.6.6' }, '10.0.0.1', false), '10.0.0.1');
});

test('behind a trusted proxy, the right-most (proxy-added) address is used', () => {
    // The client can put anything at the front; the proxy appends the real address
    assert.equal(clientIp({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, '10.0.0.1', true), '203.0.113.9');
    assert.equal(clientIp({ 'x-forwarded-for': '203.0.113.9' }, '10.0.0.1', true), '203.0.113.9');
    assert.equal(clientIp({}, '10.0.0.1', true), '10.0.0.1');
});

test('device ids must look like ids', () => {
    assert.equal(cleanDeviceId('2f6c0b1e-1234-4abc-9def-001122334455'), '2f6c0b1e-1234-4abc-9def-001122334455');
    assert.equal(cleanDeviceId('short'), null);
    assert.equal(cleanDeviceId({ evil: true }), null);
    assert.equal(cleanDeviceId(null), null);
});

test('reports count against the account and device, or the IP when there is neither', () => {
    assert.deepEqual(countedKeys({ userId: 'u1', deviceId: 'dev-12345', ip: '1.2.3.4' }), ['u:u1', 'd:dev-12345']);
    assert.deepEqual(countedKeys({ userId: null, deviceId: null, ip: '1.2.3.4' }), ['ip:1.2.3.4']);
});

test('one reporter is one account, or one IP for guests', () => {
    assert.equal(reporterKeyOf({ userId: 'u1', ip: '1.2.3.4' }), 'u:u1');
    assert.equal(reporterKeyOf({ userId: null, deviceId: 'a-new-device', ip: '1.2.3.4' }), 'ip:1.2.3.4');
});
