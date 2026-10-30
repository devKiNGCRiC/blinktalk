// ============================================
// Sliding-Window Rate Limiter (in memory)
// ============================================

/**
 * Creates a limiter that allows `max` hits per key in any `windowMs` window
 * @param {Object} options - { max, windowMs }
 * @returns {{ hit: Function, reset: Function }}
 */
function createRateLimiter({ max, windowMs }) {
    // key -> timestamps of recent hits
    const hits = new Map();

    /**
     * Records a hit for `key`
     * @returns {Boolean} - true if allowed, false if over the limit
     */
    function hit(key, now = Date.now()) {
        const recent = (hits.get(key) || []).filter(time => now - time < windowMs);
        if (recent.length >= max) {
            hits.set(key, recent);
            return false;
        }
        recent.push(now);
        hits.set(key, recent);
        return true;
    }

    function reset(key) {
        hits.delete(key);
    }

    // Forget keys with no recent hits so the map doesn't grow forever
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, times] of hits) {
            if (!times.some(time => now - time < windowMs)) hits.delete(key);
        }
    }, Math.max(windowMs, 60000));
    cleanup.unref();

    return { hit, reset };
}

module.exports = { createRateLimiter };
