import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { groupMessages } from '../../lib/grouping';
import MessageBubble from './MessageBubble';
import styles from './MessageList.module.css';

const NEAR_BOTTOM_PX = 120;

/**
 * Scrollable list of messages with day dividers.
 * Sticks to the bottom as new messages arrive, unless the user scrolled up to read.
 */
export default function MessageList({ messages, myId, isRoom, onReply, onActions, onRetry, emptyText }) {
    const scrollRef = useRef(null);
    const atBottom = useRef(true);
    const [showJump, setShowJump] = useState(false);
    const items = useMemo(() => groupMessages(messages || [], myId), [messages, myId]);
    const last = messages?.[messages.length - 1];

    // Start at the bottom when the conversation first loads
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && messages) el.scrollTop = el.scrollHeight;
    }, [Boolean(messages)]); // eslint-disable-line react-hooks/exhaustive-deps

    // New message: follow it if we were at the bottom or it's our own
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !last) return;
        const mine = (last.sender?._id ?? last.sender) === myId;
        if (atBottom.current || mine) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
            setShowJump(true);
        }
    }, [last, myId]);

    function onScroll() {
        const el = scrollRef.current;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        if (atBottom.current) setShowJump(false);
    }

    function jumpToLatest() {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        setShowJump(false);
    }

    // Clicking a quoted reply scrolls to the original and flashes it
    function jumpToMessage(id) {
        const target = scrollRef.current?.querySelector(`[data-message-id="${id}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove(styles.flash);
        void target.offsetWidth; // restart the animation
        target.classList.add(styles.flash);
    }

    return (
        <div className={styles.wrap}>
            <div className={styles.scroll} ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
                {!messages && <div className={styles.loading}><span /><span /><span /></div>}

                {messages && messages.length === 0 && <p className={styles.empty}>{emptyText}</p>}

                {items.map(item =>
                    item.kind === 'day' ? (
                        <div key={item.key} className={styles.day}><span>{item.label}</span></div>
                    ) : (
                        <MessageBubble
                            key={item.key}
                            item={item}
                            isRoom={isRoom}
                            onReply={onReply}
                            onActions={onActions}
                            onRetry={onRetry}
                            onQuoteClick={jumpToMessage}
                        />
                    )
                )}
            </div>

            {showJump && (
                <button className={styles.jump} onClick={jumpToLatest}>
                    <ArrowDown size={16} />
                    New messages
                </button>
            )}
        </div>
    );
}
