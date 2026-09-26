import { daysBetween, formatDayLabel } from './format';

// Messages from the same person within this window form one visual group
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

function senderId(message) {
    return message.sender?._id ?? message.sender ?? null;
}

function sameDay(a, b) {
    return daysBetween(new Date(a), new Date(b)) === 0;
}

function belongsTogether(a, b) {
    return Boolean(a) && Boolean(b)
        && a.type !== 'system' && b.type !== 'system'
        && senderId(a) === senderId(b)
        && sameDay(a.createdAt, b.createdAt)
        && Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) <= GROUP_WINDOW_MS;
}

/**
 * Turn a list of messages (oldest first) into render items:
 *   { kind: 'day', key, label }
 *   { kind: 'message', key, message, isMine, isFirst, isLast }
 * isFirst / isLast mark the edges of a sender group (the tail goes on isLast,
 * the sender's name in rooms goes on isFirst).
 */
export function groupMessages(messages, myId, now = new Date()) {
    const items = [];

    messages.forEach((message, index) => {
        const previous = messages[index - 1];
        const next = messages[index + 1];

        if (!previous || !sameDay(previous.createdAt, message.createdAt)) {
            items.push({
                kind: 'day',
                key: `day-${message.createdAt}`,
                label: formatDayLabel(message.createdAt, now)
            });
        }

        items.push({
            kind: 'message',
            key: message._id ?? message.tempId,
            message,
            isMine: senderId(message) === myId,
            isFirst: !belongsTogether(previous, message),
            isLast: !belongsTogether(message, next)
        });
    });

    return items;
}
