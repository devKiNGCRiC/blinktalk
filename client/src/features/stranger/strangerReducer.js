// State of the stranger chat screen.
// phase: 'idle' → 'searching' → 'connected' → 'ended' (→ 'searching' again)

let lineCounter = 0;
const systemLine = text => ({ id: `sys-${lineCounter++}`, kind: 'system', text });

export const initialStrangerState = {
    phase: 'idle',
    noMatch: false,          // filters found nobody: ask to widen
    limit: null,             // { limit, resetsAt } when today's guest chats are used up
    bannedUntil: null,
    partner: null,           // { registered, userId?, displayName?, avatar?, country? }
    icebreaker: null,
    lines: [],               // { id, kind: 'me'|'them'|'system', text, at, reaction: { mine, theirs } }
    typing: false,
    friend: 'none',          // 'none' | 'sent' | 'received' | 'added'
    friendUser: null,
    online: 0
};

/** A new search: clear everything about the last chat */
const freshSearch = state => ({
    ...state,
    phase: 'searching',
    noMatch: false,
    limit: null,
    bannedUntil: null,
    partner: null,
    icebreaker: null,
    lines: [],
    typing: false,
    friend: 'none',
    friendUser: null
});

/** The chat ended: keep the transcript, keep a friendship that was made */
const endChat = (state, text) => ({
    ...state,
    phase: 'ended',
    typing: false,
    noMatch: false,
    friend: state.friend === 'added' ? 'added' : 'none',
    lines: text ? [...state.lines, systemLine(text)] : state.lines
});

export function strangerReducer(state, action) {
    switch (action.type) {
        case 'SEARCH':
            return freshSearch(state);

        case 'SEARCHING':
            return state.phase === 'connected' ? state : { ...state, phase: 'searching' };

        case 'CONNECTED': {
            const who = action.partner?.registered ? action.partner.displayName : 'a stranger';
            return {
                ...freshSearch(state),
                phase: 'connected',
                partner: action.partner,
                icebreaker: action.icebreaker || null,
                lines: [systemLine(`You’re now chatting with ${who}. Say hi 👋`)]
            };
        }

        case 'MESSAGE':
            return {
                ...state,
                typing: action.from === 'you' ? state.typing : false,
                lines: [...state.lines, {
                    id: action.id,
                    kind: action.from === 'you' ? 'me' : 'them',
                    text: action.content,
                    at: action.timestamp,
                    reaction: { mine: null, theirs: null }
                }]
            };

        case 'TYPING':
            return { ...state, typing: action.on };

        case 'REACTION': {
            const side = action.from === 'you' ? 'mine' : 'theirs';
            return {
                ...state,
                lines: state.lines.map(line =>
                    line.id === action.messageId ? { ...line, reaction: { ...line.reaction, [side]: action.emoji } } : line
                )
            };
        }

        case 'PARTNER_LEFT':
            return state.phase === 'connected' ? endChat(state, 'Stranger left the chat 👋') : state;

        case 'ENDED':
            if (state.phase === 'searching') return { ...state, phase: 'idle', noMatch: false };
            return endChat(state, action.message || 'You left the chat.');

        case 'NO_MATCH':
            return state.phase === 'searching' ? { ...state, noMatch: true } : state;

        case 'WIDEN':
            return { ...state, noMatch: false };

        case 'LIMIT':
            return { ...state, phase: 'idle', noMatch: false, limit: { limit: action.limit, resetsAt: action.resetsAt } };

        case 'BANNED':
            return { ...state, phase: 'idle', noMatch: false, bannedUntil: action.until };

        case 'FRIEND_SENT':
            return { ...state, friend: 'sent' };

        case 'FRIEND_RECEIVED':
            return { ...state, friend: 'received' };

        case 'FRIEND_ADDED': {
            const name = action.user.displayName || action.user.username;
            return {
                ...state,
                friend: 'added',
                friendUser: action.user,
                lines: [...state.lines, systemLine(`You and ${name} are now friends 🎉`)]
            };
        }

        case 'DISMISS_ICEBREAKER':
            return { ...state, icebreaker: null };

        case 'ONLINE':
            return { ...state, online: action.count };

        case 'CONNECTION_LOST':
            if (state.phase === 'searching') return { ...state, phase: 'idle', noMatch: false };
            if (state.phase === 'connected') return endChat(state, 'Connection lost. The chat ended.');
            return state;

        default:
            return state;
    }
}
