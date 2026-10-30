// ============================================
// Ban Model
// ============================================
// A temporary stranger chat ban on one key ("u:...", "d:..." or "ip:...").

const mongoose = require('mongoose');

const banSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    until: { type: Date, required: true }
});

// Removed automatically when the ban ends
banSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

/**
 * When does the latest active ban on any of these keys end?
 * @returns {Promise<Date|null>}
 */
banSchema.statics.activeFor = async function(keys) {
    const ban = await this.findOne({ key: { $in: keys }, until: { $gt: new Date() } }).sort({ until: -1 });
    return ban ? ban.until : null;
};

/**
 * Bans every key until `until` (extends an existing ban)
 */
banSchema.statics.banKeys = function(keys, until) {
    return this.bulkWrite(keys.map(key => ({
        updateOne: { filter: { key }, update: { $set: { until } }, upsert: true }
    })));
};

module.exports = mongoose.model('Ban', banSchema);
