// ============================================
// Who Is Behind A Socket
// ============================================
// Device id and IP address, used for the guest daily limit, reports and bans.

/**
 * Device id sent by the browser (a random id kept in localStorage), or null
 */
function cleanDeviceId(id) {
    return typeof id === 'string' && /^[\w-]{8,64}$/.test(id) ? id : null;
}

/**
 * The client's IP address.
 * Behind a trusted proxy the real address is the LAST X-Forwarded-For entry
 * (the one the proxy appended); earlier entries come from the client and can be faked.
 * @param {Object} headers - request headers
 * @param {String} address - the connection's own address
 * @param {Boolean} trustProxy - running behind one trusted proxy?
 */
function clientIp(headers, address, trustProxy) {
    const forwarded = headers && headers['x-forwarded-for'];
    if (trustProxy && typeof forwarded === 'string' && forwarded.trim()) {
        const entries = forwarded.split(',').map(entry => entry.trim()).filter(Boolean);
        if (entries.length) return entries[entries.length - 1];
    }
    return address;
}

/** Keys as strings for the database: "u:<id>", "d:<id>", "ip:<address>" */
function keyStrings(keys) {
    const list = [];
    if (keys.userId) list.push(`u:${keys.userId}`);
    if (keys.deviceId) list.push(`d:${keys.deviceId}`);
    if (keys.ip) list.push(`ip:${keys.ip}`);
    return list;
}

/**
 * Who counts as "one reporter": the account for signed-up users, otherwise the IP.
 * (Guests can make new device ids at will, so one person can't fake several reporters.)
 */
function reporterKeyOf(socket) {
    return socket.userId ? `u:${socket.userId}` : `ip:${socket.ip}`;
}

/**
 * Keys that reports are counted against: account and device,
 * or the IP when the client sent neither
 */
function countedKeys(keys) {
    const identity = keyStrings({ userId: keys.userId, deviceId: keys.deviceId });
    return identity.length ? identity : keyStrings({ ip: keys.ip });
}

module.exports = { cleanDeviceId, clientIp, keyStrings, reporterKeyOf, countedKeys };
