import { memo, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, CornerUpLeft, Copy, Trash2, SmilePlus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/Avatar';
import { formatClock } from '../../lib/format';
import styles from './MessageBubble.module.css';

const LONG_PRESS_MS = 450;
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

/** Reaction chips under a bubble: each emoji once, with a count */
function Reactions({ reactions, myId, onReact }) {
    if (!reactions?.length) return null;
    const counts = new Map();
    for (const { emoji, user } of reactions) {
        const entry = counts.get(emoji) || { count: 0, mine: false };
        entry.count += 1;
        entry.mine ||= (user?._id ?? user) === myId;
        counts.set(emoji, entry);
    }
    return (
        <div className={styles.reactions}>
            {[...counts].map(([emoji, { count, mine }]) => (
                <button
                    key={emoji}
                    className={mine ? styles.myReaction : ''}
                    onClick={() => onReact(emoji)}
                    aria-label={mine ? `Remove your ${emoji}` : `React ${emoji}`}
                >
                    {emoji}{count > 1 && <span>{count}</span>}
                </button>
            ))}
        </div>
    );
}

/** ✓ sent, ✓✓ delivered, colored ✓✓ read (private chats); a clock while sending */
function Receipt({ message, isRoom }) {
    if (message.status === 'sending') return <Clock size={13} aria-label="Sending" />;
    if (isRoom) return <Check size={14} aria-label="Sent" />;
    if (message.isRead) return <CheckCheck size={15} className={styles.read} aria-label="Read" />;
    if (message.isDelivered) return <CheckCheck size={15} aria-label="Delivered" />;
    return <Check size={14} aria-label="Sent" />;
}

function Quote({ reply, onClick }) {
    const name = reply.sender?.displayName || reply.sender?.username || 'Message';
    return (
        <button className={styles.quote} onClick={() => onClick(reply._id)} type="button">
            <strong>{name}</strong>
            <span>{reply.isDeleted ? 'This message was deleted' : reply.content}</span>
        </button>
    );
}

function MessageBubble({ item, isRoom, onReply, onActions, onRetry, onReact, myId, onQuoteClick }) {
    const { message, isMine, isFirst, isLast } = item;
    const toast = useToast();
    const pressTimer = useRef(null);
    const [picking, setPicking] = useState(false);

    if (message.type === 'system') {
        return <div className={styles.system}>{message.content}</div>;
    }

    const sender = message.sender || {};
    const senderName = sender.displayName || sender.username || 'Someone';
    const deleted = message.isDeleted;
    const failed = message.status === 'failed';
    const canAct = Boolean(message._id) && !deleted;

    function copy() {
        navigator.clipboard?.writeText(message.content)
            .then(() => toast.success('Copied'))
            .catch(() => toast.error('Couldn’t copy. Select the text instead.'));
    }

    // Long-press opens the actions sheet on touch screens
    function onTouchStart() {
        if (!canAct) return;
        pressTimer.current = setTimeout(() => {
            navigator.vibrate?.(10);
            onActions(message);
        }, LONG_PRESS_MS);
    }
    function cancelPress() {
        clearTimeout(pressTimer.current);
    }

    const rowClass = [
        styles.row,
        isMine ? styles.mine : styles.theirs,
        isFirst ? styles.first : '',
        isLast ? styles.last : ''
    ].join(' ');

    return (
        <div className={rowClass} data-message-id={message._id}>
            {isRoom && !isMine && (
                <div className={styles.avatarSlot}>
                    {isLast && <Avatar src={sender.avatar} name={senderName} size={30} />}
                </div>
            )}

            <div className={styles.stack}>
                {isRoom && !isMine && isFirst && <span className={styles.sender}>{senderName}</span>}

                <div className={styles.line}>
                    <div
                        className={`${styles.bubble} ${deleted ? styles.deleted : ''} ${failed ? styles.failedBubble : ''}`}
                        onTouchStart={onTouchStart}
                        onTouchEnd={cancelPress}
                        onTouchMove={cancelPress}
                        onContextMenu={event => {
                            if (canAct && window.matchMedia('(pointer: coarse)').matches) event.preventDefault();
                        }}
                    >
                        {message.replyTo && !deleted && <Quote reply={message.replyTo} onClick={onQuoteClick} />}

                        {deleted ? (
                            <p className={styles.text}>This message was deleted</p>
                        ) : (
                            <p className={styles.text}>{message.content}</p>
                        )}

                        <span className={styles.meta}>
                            {formatClock(message.createdAt)}
                            {isMine && !deleted && <Receipt message={message} isRoom={isRoom} />}
                        </span>
                    </div>

                    {canAct && (
                        <div className={styles.tools} role="toolbar" aria-label="Message actions">
                            {onReact && (
                                <button onClick={() => setPicking(p => !p)} aria-label="React" aria-expanded={picking}>
                                    <SmilePlus size={16} />
                                </button>
                            )}
                            <button onClick={() => onReply(message)} aria-label="Reply"><CornerUpLeft size={16} /></button>
                            <button onClick={copy} aria-label="Copy text"><Copy size={16} /></button>
                            <button onClick={() => onActions(message)} aria-label="Delete"><Trash2 size={16} /></button>
                        </div>
                    )}
                </div>

                {picking && canAct && (
                    <div className={styles.picker} role="menu">
                        {REACTIONS.map(emoji => (
                            <button
                                key={emoji}
                                role="menuitem"
                                onClick={() => { onReact(message, emoji); setPicking(false); }}
                                aria-label={`React ${emoji}`}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}

                {onReact && !deleted && (
                    <Reactions reactions={message.reactions} myId={myId} onReact={emoji => onReact(message, emoji)} />
                )}

                {failed && (
                    <button className={styles.retry} onClick={() => onRetry(message)}>
                        <AlertCircle size={14} />
                        Failed to send. Tap to retry
                    </button>
                )}
            </div>
        </div>
    );
}

export default memo(MessageBubble);
