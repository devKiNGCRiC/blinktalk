// ============================================
// Stranger Chat Moderation
// ============================================
// Cleans stranger chat text before it reaches the other person:
// masks bad words and (for anonymous users) removes links.

// Matched as whole words, case-insensitive
const BAD_WORDS = [
    // English
    'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
    'asshole', 'dick', 'dickhead', 'cunt', 'pussy', 'slut', 'whore', 'idiot', 'moron',
    'retard', 'retarded', 'wanker', 'twat', 'prick', 'cock', 'jerkoff', 'dumbass',
    'nigger', 'nigga', 'faggot', 'fag', 'tranny',
    // Hindi / Hinglish
    'chutiya', 'chutiye', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike', 'bhosdi',
    'gandu', 'randi', 'harami', 'kamina', 'lund', 'lauda', 'lavda', 'saala', 'kutta', 'kutti'
];

const BAD_WORD_PATTERN = new RegExp(`\\b(${BAD_WORDS.join('|')})\\b`, 'gi');

// Common top-level domains people use to share links
const TLDS = 'com|net|org|io|in|co|me|app|dev|gg|xyz|ru|info|link|ly|to|tv';

const LINK_PATTERN = new RegExp(
    [
        'https?:\\/\\/\\S+',                                  // http://... or https://...
        'www\\.\\S+',                                         // www.example...
        `\\b[a-z0-9-]+(\\.[a-z0-9-]+)*\\.(${TLDS})\\b(\\/\\S*)?` // example.com/path
    ].join('|'),
    'gi'
);

/**
 * Replaces each letter of a bad word with *
 * @param {String} text
 * @returns {String}
 */
function maskBadWords(text) {
    return text.replace(BAD_WORD_PATTERN, word => '*'.repeat(word.length));
}

/**
 * Replaces links with [link removed]
 * @param {String} text
 * @returns {String}
 */
function removeLinks(text) {
    return text.replace(LINK_PATTERN, '[link removed]');
}

/**
 * Cleans a stranger chat message
 * @param {String} text
 * @param {Object} options - { allowLinks } signed-up users may send links
 * @returns {String}
 */
function cleanStrangerText(text, { allowLinks }) {
    const masked = maskBadWords(text);
    return allowLinks ? masked : removeLinks(masked);
}

module.exports = { maskBadWords, removeLinks, cleanStrangerText };
