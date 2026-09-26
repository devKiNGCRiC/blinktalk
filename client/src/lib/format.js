// Date and time formatting for the chat UI.
// Every function takes an optional `now` so tests can use a fixed date.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Whole calendar days between two dates (0 = same day, 1 = yesterday) */
export function daysBetween(date, now = new Date()) {
    return Math.round((startOfDay(now) - startOfDay(date)) / (24 * HOUR));
}

/** "14:05" */
export function formatClock(value) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "22 Sep", plus the year when it isn't this year */
function formatShortDate(date, now) {
    const options = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString([], options);
}

/** Time shown in the chat list: "14:05", "Yesterday", "Mon", "22 Sep" */
export function formatListTime(value, now = new Date()) {
    if (!value) return '';
    const date = new Date(value);
    const days = daysBetween(date, now);
    if (days === 0) return formatClock(date);
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return formatShortDate(date, now);
}

/** Divider between days in a conversation: "Today", "Yesterday", "Mon, 22 Sep" */
export function formatDayLabel(value, now = new Date()) {
    const date = new Date(value);
    const days = daysBetween(date, now);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString([], options);
}

/** Header status for someone offline: "last seen 5m ago", "last seen today at 14:05" */
export function formatLastSeen(value, now = new Date()) {
    if (!value) return 'offline';
    const date = new Date(value);
    const diff = now - date;
    if (diff < MINUTE) return 'last seen just now';
    if (diff < HOUR) return `last seen ${Math.floor(diff / MINUTE)}m ago`;
    const days = daysBetween(date, now);
    if (days === 0) return `last seen today at ${formatClock(date)}`;
    if (days === 1) return `last seen yesterday at ${formatClock(date)}`;
    return `last seen ${formatShortDate(date, now)}`;
}
