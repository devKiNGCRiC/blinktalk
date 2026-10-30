// ============================================
// Usage Counter Model
// ============================================
// Counts anonymous stranger chats per key (device or IP) per UTC day.

const mongoose = require('mongoose');

const usageCounterSchema = new mongoose.Schema({
    key: { type: String, required: true },     // e.g. "d:<deviceId>" or "ip:<address>"
    day: { type: String, required: true },     // "YYYY-MM-DD" (UTC)
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }  // removed automatically after this
});

usageCounterSchema.index({ key: 1, day: 1 }, { unique: true });
usageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Today's date in UTC as "YYYY-MM-DD" */
function today(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

/** Next UTC midnight - when the daily count starts over */
function nextReset(now = new Date()) {
    const reset = new Date(now);
    reset.setUTCHours(24, 0, 0, 0);
    return reset;
}

/**
 * Is any of these keys already at the daily limit?
 * @returns {Promise<{ allowed: Boolean, resetsAt: Date }>}
 */
usageCounterSchema.statics.checkDaily = async function(keys, limit) {
    const over = await this.exists({ key: { $in: keys }, day: today(), count: { $gte: limit } });
    return { allowed: !over, resetsAt: nextReset() };
};

/**
 * Counts one chat for every key, unless any key is already at the limit
 * @returns {Promise<{ allowed: Boolean, resetsAt: Date }>}
 */
usageCounterSchema.statics.hitDaily = async function(keys, limit) {
    const result = await this.checkDaily(keys, limit);
    if (!result.allowed) return result;

    const day = today();
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await this.bulkWrite(keys.map(key => ({
        updateOne: {
            filter: { key, day },
            update: { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
            upsert: true
        }
    })));
    return result;
};

module.exports = mongoose.model('UsageCounter', usageCounterSchema);
