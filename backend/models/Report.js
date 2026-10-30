// ============================================
// Report Model
// ============================================
// A stranger chat report. Several reports from different people lead to a ban.

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    // Who reported: "u:<userId>" or "d:<deviceId>" (or "ip:<address>" as a last resort)
    reporterKey: { type: String, required: true },
    // Every key of the reported person: "u:...", "d:...", "ip:..."
    reportedKeys: [{ type: String }],
    reason: {
        type: String,
        enum: ['spam', 'harassment', 'sexual', 'underage', 'other'],
        default: 'other'
    },
    sessionId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

reportSchema.index({ reportedKeys: 1, createdAt: -1 });
// Reports are kept for 30 days
reportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

/**
 * How many different people reported this key since `since`?
 * @returns {Promise<Number>}
 */
reportSchema.statics.distinctReportersAgainst = async function(key, since) {
    const reporters = await this.distinct('reporterKey', { reportedKeys: key, createdAt: { $gte: since } });
    return reporters.length;
};

module.exports = mongoose.model('Report', reportSchema);
