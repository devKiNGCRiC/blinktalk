// ============================================
// Stranger Matcher (in memory)
// ============================================
// Holds the queue of people looking for a stranger and decides who
// gets paired with whom. Pure logic: no sockets, no database.
//
// Entry shape:
// {
//   sessionId, socketId,
//   keys: { userId, deviceId, ip },   // who this is (null when unknown)
//   registered,                       // signed up?
//   interests: [String], language, gender, country,
//   filters: { gender, country },     // signed-up users only
//   joinedAt                          // ms timestamp
// }

/**
 * Identity keys that mean "same person". IP is left out on purpose:
 * people in the same home or college share one.
 */
function identityKeys(keys) {
    const list = [];
    if (keys.userId) list.push(`u:${keys.userId}`);
    if (keys.deviceId) list.push(`d:${keys.deviceId}`);
    return list;
}

/**
 * Does `person` pass the filters of `seeker`?
 */
function passesFilters(seeker, person) {
    const { gender, country } = seeker.filters || {};
    if (gender && person.gender !== gender) return false;
    if (country && person.country !== country) return false;
    return true;
}

function hasFilters(e) {
    return Boolean(e.filters && (e.filters.gender || e.filters.country));
}

/**
 * Creates a matcher
 * @param {Object} options - { tagWaitMs, filterWaitMs, skipMemoryMs }
 */
function createMatcher({ tagWaitMs, filterWaitMs, skipMemoryMs = 5 * 60 * 1000 }) {
    let queue = [];
    // "keyA|keyB" -> time the skip memory ends
    const skips = new Map();

    /** Has this person waited long enough to be matched with anyone? */
    function doneWaiting(e, now) {
        return e.widened || e.interests.length === 0 || now - e.joinedAt >= tagWaitMs;
    }

    function skipped(a, b, now) {
        for (const ka of identityKeys(a.keys)) {
            for (const kb of identityKeys(b.keys)) {
                const until = skips.get(`${ka}|${kb}`);
                if (until && until > now) return true;
            }
        }
        return false;
    }

    function canMatch(a, b, now) {
        // Never the same person (two tabs, same device)
        const aKeys = identityKeys(a.keys);
        if (identityKeys(b.keys).some(key => aKeys.includes(key))) return false;

        if (skipped(a, b, now)) return false;
        if (!passesFilters(a, b) || !passesFilters(b, a)) return false;

        const sharedTag = a.interests.some(tag => b.interests.includes(tag));
        const sharedLanguage = a.language && a.language === b.language;
        if (sharedTag || sharedLanguage) return true;

        return doneWaiting(a, now) && doneWaiting(b, now);
    }

    /** Queue in matching order: signed-up first, then who waited longest */
    function ordered() {
        return [...queue].sort((x, y) =>
            (Number(y.registered) - Number(x.registered)) || (x.joinedAt - y.joinedAt)
        );
    }

    /** Best partner for `e` among the queue, or null */
    function findPartner(e, now) {
        return ordered().find(other => other !== e && canMatch(e, other, now)) || null;
    }

    /**
     * Adds someone to the queue, or pairs them straight away
     * @returns {Object|null} - the partner entry when matched
     */
    function add(e, now = Date.now()) {
        const partner = findPartner(e, now);
        if (partner) {
            remove(partner.sessionId);
            return partner;
        }
        queue.push(e);
        return null;
    }

    function remove(sessionId) {
        queue = queue.filter(e => e.sessionId !== sessionId);
    }

    /**
     * Pairs anyone who can be paired now, and reports people with
     * filters who have waited too long (once each)
     * @returns {{ pairs: Array<[Object, Object]>, noMatch: Array<Object> }}
     */
    function sweep(now = Date.now()) {
        const pairs = [];
        for (const e of ordered()) {
            if (!queue.includes(e)) continue; // already paired in this sweep
            const partner = findPartner(e, now);
            if (partner) {
                remove(e.sessionId);
                remove(partner.sessionId);
                pairs.push([e, partner]);
            }
        }

        const noMatch = queue.filter(e =>
            hasFilters(e) && !e.noMatchSent && now - e.joinedAt >= filterWaitMs
        );
        noMatch.forEach(e => { e.noMatchSent = true; });

        for (const [key, until] of skips) {
            if (until <= now) skips.delete(key);
        }

        return { pairs, noMatch };
    }

    /** Drops someone's filters and lets them match with anyone */
    function widen(sessionId) {
        const e = queue.find(item => item.sessionId === sessionId);
        if (!e) return;
        e.filters = { gender: null, country: null };
        e.widened = true;
    }

    /** Stops two people being matched again for a while */
    function rememberSkip(keysA, keysB, now = Date.now()) {
        const until = now + skipMemoryMs;
        for (const ka of identityKeys(keysA)) {
            for (const kb of identityKeys(keysB)) {
                skips.set(`${ka}|${kb}`, until);
                skips.set(`${kb}|${ka}`, until);
            }
        }
    }

    return { add, remove, sweep, widen, rememberSkip, size: () => queue.length };
}

module.exports = { createMatcher };
