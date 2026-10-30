// ============================================
// Stranger Chat Socket Handler
// ============================================
// Random stranger chat: matching, messages, typing, reactions, reports,
// the anonymous daily limit, bans and the live "online" count.
//
// Usage (from socketHandler.js):
//   const stranger = setupStranger(io);   // once
//   stranger.attach(socket);              // for every connection

const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Message = require('../models/Message');
const UsageCounter = require('../models/UsageCounter');
const Report = require('../models/Report');
const Ban = require('../models/Ban');
const { createMatcher } = require('./matcher');
const { createRateLimiter } = require('./rateLimiter');
const { REACTIONS, cleanContent, cleanStrangerText } = require('./moderation');
const { randomIcebreaker } = require('./icebreakers');
const { keyStrings, reporterKeyOf, countedKeys } = require('./identity');

// ============================================
// Settings (env overrides are used by the tests)
// ============================================

const numberFromEnv = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const DAILY_LIMIT = numberFromEnv('ANON_DAILY_LIMIT', 15);
const TAG_WAIT_MS = numberFromEnv('STRANGER_TAG_WAIT_MS', 5000);
const FILTER_WAIT_MS = numberFromEnv('STRANGER_FILTER_WAIT_MS', 15000);
const SEARCH_COOLDOWN_MS = numberFromEnv('STRANGER_SEARCH_COOLDOWN_MS', 1500);
const BAN_THRESHOLD = numberFromEnv('REPORT_BAN_THRESHOLD', 3);
const BAN_MS = 24 * 60 * 60 * 1000;
const REPORT_WINDOW_MS = 5 * 60 * 1000; // report someone up to 5 minutes after they leave
const SWEEP_MS = 250;

const REPORT_REASONS = ['spam', 'harassment', 'sexual', 'underage', 'other'];
const GENDERS = ['male', 'female', 'nonbinary'];
const MAX_TAG_LENGTH = 24;

// ============================================
// Small Helpers
// ============================================

/** The ids that identify whoever is behind this socket */
function keysOf(socket) {
    return { userId: socket.userId || null, deviceId: socket.deviceId || null, ip: socket.ip || null };
}

/** Interest tags: trimmed, lowercased, unique, at most `max` */
function cleanInterests(interests, max) {
    if (!Array.isArray(interests)) return [];
    const tags = [];
    for (const tag of interests) {
        if (typeof tag !== 'string') continue;
        const clean = tag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
        if (clean && !tags.includes(clean)) tags.push(clean);
        if (tags.length >= max) break;
    }
    return tags;
}

/** Gender/country filters (signed-up users only) */
function cleanFilters(filters) {
    const f = filters && typeof filters === 'object' ? filters : {};
    return {
        gender: GENDERS.includes(f.gender) ? f.gender : null,
        country: typeof f.country === 'string' && /^[A-Z]{2}$/.test(f.country) ? f.country : null
    };
}

/**
 * Set up stranger chat for this Socket.io server
 * @param {Object} io - Socket.io server instance
 * @returns {{ attach: Function }}
 */
module.exports = function setupStranger(io) {
    const matcher = createMatcher({ tagWaitMs: TAG_WAIT_MS, filterWaitMs: FILTER_WAIT_MS });
    const messageLimiter = createRateLimiter({ max: 5, windowMs: 3000 });
    const searchLimiter = createRateLimiter({ max: 1, windowMs: SEARCH_COOLDOWN_MS });

    // sessionId -> { socket, entry, partnerId, friendRequested }
    const sessions = new Map();

    // ============================================
    // Online Count
    // ============================================

    let onlineTimer = null;

    /** Tell everyone how many people are online (at most once a second) */
    function scheduleOnlineCount() {
        if (onlineTimer) return;
        onlineTimer = setTimeout(() => {
            onlineTimer = null;
            io.emit('stats:online', { count: io.engine.clientsCount });
        }, 1000);
        onlineTimer.unref();
    }

    // ============================================
    // Sessions
    // ============================================

    function sessionOf(socket) {
        return socket.strangerSessionId ? sessions.get(socket.strangerSessionId) : null;
    }

    function partnerOf(session) {
        return session && session.partnerId ? sessions.get(session.partnerId) : null;
    }

    /** What the other person sees about you */
    function publicProfile(entry) {
        if (!entry.registered) return { registered: false };
        return {
            registered: true,
            displayName: entry.profile.displayName,
            avatar: entry.profile.avatar,
            ...(entry.country && { country: entry.country })
        };
    }

    /**
     * End this socket's stranger session (searching or chatting)
     * @param {Object} options - { notifySelf, skip, message }
     */
    function endSession(socket, { notifySelf = false, skip = false, message = 'You left the chat.' } = {}) {
        const session = sessionOf(socket);
        socket.strangerSessionId = null;

        if (session) {
            const partner = partnerOf(session);
            if (partner) {
                partner.socket.emit('stranger:disconnected', { message: 'Stranger has disconnected.' });
                partner.partnerId = null;
                partner.friendRequested = false;
                if (skip) matcher.rememberSkip(session.entry.keys, partner.entry.keys);

                // Either of them can still report the other for a few minutes
                const now = Date.now();
                socket.strangerLastPartner = { entry: partner.entry, socket: partner.socket, at: now };
                partner.socket.strangerLastPartner = { entry: session.entry, socket, at: now };
            }

            matcher.remove(session.entry.sessionId);
            sessions.delete(session.entry.sessionId);
        }

        // Always answer, so the screen never waits on a search that no longer exists
        if (notifySelf) socket.emit('stranger:ended', { message });
    }

    /** Matching or counting failed: tell both people instead of leaving them waiting */
    function connectFailed(a, b, error) {
        console.error('Stranger Connect Error:', error);
        for (const entry of [a, b]) {
            const session = sessions.get(entry.sessionId);
            if (session) {
                endSession(session.socket, { notifySelf: true, message: 'Something went wrong. Please try again.' });
            }
        }
    }

    /**
     * Pair two queue entries: count anonymous chats, then tell both
     */
    async function connect(a, b) {
        // Count today's chat for each anonymous side
        const refused = [];
        for (const entry of [a, b]) {
            if (entry.registered) continue;
            const { allowed, resetsAt } = await UsageCounter.hitDaily(
                keyStrings({ deviceId: entry.keys.deviceId, ip: entry.keys.ip }),
                DAILY_LIMIT
            );
            if (!allowed) refused.push({ entry, resetsAt });
        }

        // Someone may have left while we were counting
        const sessionA = sessions.get(a.sessionId);
        const sessionB = sessions.get(b.sessionId);

        if (refused.length) {
            for (const { entry, resetsAt } of refused) {
                const session = sessions.get(entry.sessionId);
                if (session) {
                    session.socket.emit('stranger:limit', { limit: DAILY_LIMIT, resetsAt });
                    endSession(session.socket);
                }
            }
        }

        const stillHere = [sessionA, sessionB].filter(s => s && sessions.has(s.entry.sessionId));
        if (stillHere.length < 2) {
            // Put whoever is left back in the queue
            stillHere.forEach(s => queue(s));
            return;
        }

        sessionA.partnerId = b.sessionId;
        sessionB.partnerId = a.sessionId;

        const icebreaker = randomIcebreaker();
        sessionA.socket.emit('stranger:connected', { sessionId: a.sessionId, icebreaker, partner: publicProfile(b) });
        sessionB.socket.emit('stranger:connected', { sessionId: b.sessionId, icebreaker, partner: publicProfile(a) });
        console.log(`🤝 Strangers connected: ${a.sessionId} <-> ${b.sessionId}`);
    }

    /** Try to match a session now, or leave it waiting in the queue */
    function queue(session) {
        const partner = matcher.add(session.entry);
        if (partner) {
            connect(session.entry, partner).catch(error => connectFailed(session.entry, partner, error));
        }
    }

    /**
     * Two signed-up strangers become friends; each is told about the other
     */
    async function makeFriends(sessionA, sessionB) {
        const idA = sessionA.entry.keys.userId;
        const idB = sessionB.entry.keys.userId;
        await User.updateOne({ _id: idA }, { $addToSet: { friends: idB } });
        await User.updateOne({ _id: idB }, { $addToSet: { friends: idA } });

        const [userA, userB] = await Promise.all([
            User.findById(idA).select('username displayName avatar isOnline lastSeen'),
            User.findById(idB).select('username displayName avatar isOnline lastSeen')
        ]);
        sessionA.friendRequested = false;
        sessionB.friendRequested = false;
        sessionA.socket.emit('stranger:friend:added', { user: userB });
        sessionB.socket.emit('stranger:friend:added', { user: userA });
    }

    // ============================================
    // Matching Loop
    // ============================================

    function sweep() {
        const { pairs, noMatch } = matcher.sweep(Date.now());
        for (const [a, b] of pairs) {
            connect(a, b).catch(error => connectFailed(a, b, error));
        }
        for (const entry of noMatch) {
            const session = sessions.get(entry.sessionId);
            if (session) session.socket.emit('stranger:no-match');
        }
    }

    setInterval(sweep, SWEEP_MS).unref();

    // ============================================
    // Per-Connection Events
    // ============================================

    function attach(socket) {
        scheduleOnlineCount();
        socket.on('disconnect', () => {
            socket.strangerSearchId = (socket.strangerSearchId || 0) + 1;
            endSession(socket);
            scheduleOnlineCount();
        });

        socket.on('stats:get', () => {
            socket.emit('stats:online', { count: io.engine.clientsCount });
        });

        /**
         * Event: stranger:search ("Next" is just another search)
         * Data: { interests, filters }
         */
        socket.on('stranger:search', async data => {
            try {
                // Leave the current chat first (counts as skipping that person)
                endSession(socket, { skip: true });

                if (!searchLimiter.hit(socket.id)) {
                    socket.strangerSearchId = (socket.strangerSearchId || 0) + 1;
                    socket.emit('stranger:rate-limited', { message: 'Slow down a little before the next chat.' });
                    return socket.emit('stranger:ended', { message: 'Slow down a little before the next chat.' });
                }

                // Ignore this search if a newer one starts while we wait on the database
                const searchId = (socket.strangerSearchId || 0) + 1;
                socket.strangerSearchId = searchId;
                const outdated = () => socket.strangerSearchId !== searchId || socket.disconnected;

                const keys = keysOf(socket);
                const user = keys.userId
                    ? await User.findById(keys.userId).select('username displayName avatar gender country language isActive')
                    : null;
                const registered = Boolean(user && user.isActive);

                const bannedUntil = await Ban.activeFor(keyStrings(keys));
                if (outdated()) return;
                if (bannedUntil) return socket.emit('stranger:banned', { until: bannedUntil });

                if (!registered) {
                    const { allowed, resetsAt } = await UsageCounter.checkDaily(
                        keyStrings({ deviceId: keys.deviceId, ip: keys.ip }),
                        DAILY_LIMIT
                    );
                    if (outdated()) return;
                    if (!allowed) return socket.emit('stranger:limit', { limit: DAILY_LIMIT, resetsAt });
                }

                const options = data && typeof data === 'object' ? data : {};
                const entry = {
                    sessionId: uuidv4(),
                    socketId: socket.id,
                    keys: registered ? keys : { ...keys, userId: null },
                    registered,
                    interests: cleanInterests(options.interests, registered ? 5 : 1),
                    language: registered ? user.language : null,
                    gender: registered ? user.gender : null,
                    country: registered ? user.country : null,
                    filters: registered ? cleanFilters(options.filters) : { gender: null, country: null },
                    profile: registered ? { displayName: user.displayName || user.username, avatar: user.avatar } : null,
                    joinedAt: Date.now()
                };

                const session = { socket, entry, partnerId: null, friendRequested: false };
                sessions.set(entry.sessionId, session);
                socket.strangerSessionId = entry.sessionId;

                socket.emit('stranger:searching', { sessionId: entry.sessionId });
                queue(session);
            } catch (error) {
                console.error('Stranger Search Error:', error);
                socket.emit('error', { message: 'Failed to search for a stranger' });
            }
        });

        /**
         * Event: stranger:widen - drop filters and match with anyone
         */
        socket.on('stranger:widen', () => {
            const session = sessionOf(socket);
            if (!session || session.partnerId) return;
            matcher.widen(session.entry.sessionId);
            sweep();
        });

        /**
         * Event: stranger:message
         * Data: { content }
         */
        socket.on('stranger:message', async data => {
            try {
                const content = cleanContent(data && data.content);
                if (!content) return;

                const session = sessionOf(socket);
                const partner = partnerOf(session);
                if (!partner) return socket.emit('error', { message: 'No stranger connected' });

                if (!messageLimiter.hit(socket.id)) {
                    return socket.emit('stranger:rate-limited', { message: 'You’re sending messages too fast.' });
                }

                const text = cleanStrangerText(content, { allowLinks: session.entry.registered });
                const message = await Message.create({
                    sender: null,
                    receiver: null,
                    content: text,
                    type: 'text',
                    isAnonymous: true,
                    anonymousSessionId: session.entry.sessionId
                });

                const payload = { id: message._id.toString(), content: text, timestamp: message.createdAt };
                // The partner may have left while saving
                if (sessions.has(partner.entry.sessionId)) {
                    partner.socket.emit('stranger:message', { ...payload, from: 'stranger' });
                }
                socket.emit('stranger:message', { ...payload, from: 'you' });
            } catch (error) {
                console.error('Stranger Message Error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Event: stranger:typing
         */
        socket.on('stranger:typing', () => {
            const partner = partnerOf(sessionOf(socket));
            if (partner) partner.socket.emit('stranger:typing');
        });

        /**
         * Event: stranger:react
         * Data: { messageId, emoji } - emoji null removes your reaction
         */
        socket.on('stranger:react', data => {
            const { messageId, emoji } = data || {};
            if (typeof messageId !== 'string' || messageId.length > 64) return;
            if (emoji !== null && !REACTIONS.includes(emoji)) return;

            const partner = partnerOf(sessionOf(socket));
            if (!partner) return;
            partner.socket.emit('stranger:reaction', { messageId, emoji, from: 'stranger' });
            socket.emit('stranger:reaction', { messageId, emoji, from: 'you' });
        });

        /**
         * Event: stranger:friend:request - ask the partner to be friends
         * (both need an account)
         */
        socket.on('stranger:friend:request', async () => {
            try {
                const session = sessionOf(socket);
                const partner = partnerOf(session);
                if (!partner) return socket.emit('stranger:friend:error', { message: 'No stranger connected' });
                if (!session.entry.registered || !partner.entry.registered) {
                    return socket.emit('stranger:friend:error', { message: 'You both need an account to add friends' });
                }

                // Both pressed "Add friend": that's a yes from both sides
                if (partner.friendRequested) return makeFriends(session, partner);

                session.friendRequested = true;
                partner.socket.emit('stranger:friend:requested');
            } catch (error) {
                console.error('Friend Request Error:', error);
                socket.emit('stranger:friend:error', { message: 'Could not send the friend request' });
            }
        });

        /**
         * Event: stranger:friend:accept - accept the partner's request
         */
        socket.on('stranger:friend:accept', async () => {
            try {
                const session = sessionOf(socket);
                const partner = partnerOf(session);
                if (!partner || !partner.friendRequested) {
                    return socket.emit('stranger:friend:error', { message: 'There is no friend request to accept' });
                }
                await makeFriends(session, partner);
            } catch (error) {
                console.error('Friend Accept Error:', error);
                socket.emit('stranger:friend:error', { message: 'Could not add friend' });
            }
        });

        /**
         * Event: stranger:disconnect - leave the chat or stop searching
         */
        socket.on('stranger:disconnect', () => {
            // Also stops a search that is still being set up
            socket.strangerSearchId = (socket.strangerSearchId || 0) + 1;
            endSession(socket, { notifySelf: true, skip: true });
        });

        /**
         * Event: stranger:report - report the partner (also leaves the chat),
         * or the last partner within a few minutes of them leaving
         * Data: { reason }
         */
        socket.on('stranger:report', async data => {
            try {
                const reason = REPORT_REASONS.includes(data && data.reason) ? data.reason : 'other';
                const thanks = 'Thanks for reporting. We’ll look into it.';

                let target;
                const partner = partnerOf(sessionOf(socket));
                if (partner) {
                    target = { entry: partner.entry, socket: partner.socket };
                    endSession(socket, { notifySelf: true, skip: true, message: thanks });
                } else {
                    const last = socket.strangerLastPartner;
                    if (!last || Date.now() - last.at > REPORT_WINDOW_MS) return;
                    target = last;
                    socket.emit('stranger:reported', { message: thanks });
                }
                // One report per chat
                socket.strangerLastPartner = null;

                const reportedKeys = keyStrings(target.entry.keys);
                await Report.create({
                    reporterKey: reporterKeyOf(socket),
                    reportedKeys,
                    reason,
                    sessionId: target.entry.sessionId
                });

                // Ban when enough different people reported this account or device
                const since = new Date(Date.now() - BAN_MS);
                for (const key of countedKeys(target.entry.keys)) {
                    if (await Report.distinctReportersAgainst(key, since) >= BAN_THRESHOLD) {
                        const until = new Date(Date.now() + BAN_MS);
                        await Ban.banKeys(reportedKeys, until);
                        target.socket.emit('stranger:banned', { until });
                        console.log(`🚫 Banned ${reportedKeys.join(', ')} until ${until.toISOString()}`);
                        break;
                    }
                }
            } catch (error) {
                console.error('Stranger Report Error:', error);
            }
        });
    }

    return { attach };
};
