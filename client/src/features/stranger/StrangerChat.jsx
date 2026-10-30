import { useEffect, useRef, useState } from 'react';
import {
    Ghost, SkipForward, LogOut, Sparkles, Flag, Download, UserPlus, UserCheck, Check,
    MessageCircle, SmilePlus, Lightbulb, X
} from 'lucide-react';
import Composer from '../../components/Composer';
import Avatar from '../../components/Avatar';
import Modal from '../../components/Modal';
import { formatClock } from '../../lib/format';
import { flagOf, countryName } from '../../lib/countries';
import { looksLikeContactInfo } from '../../lib/contactInfo';
import { buildTranscript, downloadText } from '../../lib/transcript';
import styles from './StrangerPanel.module.css';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const REPORT_REASONS = [
    { value: 'spam', label: 'Spam or ads' },
    { value: 'harassment', label: 'Harassment or hate' },
    { value: 'sexual', label: 'Sexual content' },
    { value: 'underage', label: 'Seems under 18' },
    { value: 'other', label: 'Something else' }
];
const ESC_WINDOW_MS = 2000;

function PartnerTitle({ partner, phase, typing }) {
    const status = phase === 'ended' ? 'chat ended' : typing ? 'typing…' : 'connected';
    const statusClass = typing ? styles.typing : phase === 'connected' ? styles.online : '';

    if (!partner?.registered) {
        return (
            <>
                <span className={styles.ghost}><Ghost size={22} /></span>
                <div className={styles.title}>
                    <h2>Stranger</h2>
                    <p className={statusClass}>{status}</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Avatar src={partner.avatar} name={partner.displayName} size={42} />
            <div className={styles.title}>
                <h2>
                    {partner.displayName}
                    {partner.country && (
                        <span className={styles.flag} title={countryName(partner.country)}> {flagOf(partner.country)}</span>
                    )}
                </h2>
                <p className={statusClass}>{status}</p>
            </div>
        </>
    );
}

/** Add friend → Request sent → Accept → Friends */
function FriendButton({ friend, onRequest, onAccept, onMessage }) {
    if (friend === 'added') {
        return (
            <button className="btn btn-ghost" onClick={onMessage} title="Open your chat with this friend">
                <MessageCircle size={18} />
                <span className={styles.actionLabel}>Message</span>
            </button>
        );
    }
    if (friend === 'received') {
        return (
            <button className={`btn btn-primary ${styles.pulse}`} onClick={onAccept} title="They want to be friends">
                <UserCheck size={18} />
                <span className={styles.actionLabel}>Accept friend</span>
            </button>
        );
    }
    if (friend === 'sent') {
        return (
            <button className="btn btn-ghost" disabled title="Waiting for them to accept">
                <Check size={18} />
                <span className={styles.actionLabel}>Request sent</span>
            </button>
        );
    }
    return (
        <button className="btn btn-ghost" onClick={onRequest} title="Ask to be friends">
            <UserPlus size={18} />
            <span className={styles.actionLabel}>Add friend</span>
        </button>
    );
}

function Bubble({ line, canReact, onReact }) {
    const [picking, setPicking] = useState(false);
    const pressTimer = useRef(null);
    const { mine, theirs } = line.reaction || {};

    // Long-press opens the picker on phones
    const startPress = () => { pressTimer.current = setTimeout(() => setPicking(true), 450); };
    const endPress = () => clearTimeout(pressTimer.current);

    const choose = emoji => {
        onReact(line.id, emoji === mine ? null : emoji);
        setPicking(false);
    };

    return (
        <div className={`${styles.bubbleRow} ${styles[`${line.kind}Row`]}`}>
            <div
                className={`${styles.bubble} ${styles[line.kind]}`}
                onTouchStart={canReact ? startPress : undefined}
                onTouchEnd={endPress}
                onTouchMove={endPress}
            >
                <p>{line.text}</p>
                <span>{formatClock(line.at)}</span>
                {(mine || theirs) && (
                    <div className={styles.reactions} aria-label="Reactions">
                        {theirs && <span title="Stranger reacted">{theirs}</span>}
                        {mine && <span className={styles.mine} title="Your reaction">{mine}</span>}
                    </div>
                )}
            </div>
            {canReact && (
                <button className={styles.reactButton} onClick={() => setPicking(p => !p)} aria-label="React" aria-expanded={picking}>
                    <SmilePlus size={16} />
                </button>
            )}
            {picking && (
                <div className={styles.picker} role="menu">
                    {REACTIONS.map(emoji => (
                        <button
                            key={emoji}
                            role="menuitem"
                            className={emoji === mine ? styles.picked : ''}
                            onClick={() => choose(emoji)}
                            aria-label={`React ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** The conversation with a stranger (connected, or ended with the transcript still visible) */
export default function StrangerChat({ stranger, active, guest, onNext, onOpenFriend }) {
    const { state, connected } = stranger;
    const { phase, lines, typing, partner, icebreaker, friend, friendUser } = state;
    const scrollRef = useRef(null);
    const [reporting, setReporting] = useState(false);
    const [pendingText, setPendingText] = useState(null);
    const [escArmed, setEscArmed] = useState(false);
    const startedAt = useRef(new Date());

    const isConnected = phase === 'connected';
    const canAddFriend = !guest && partner?.registered;

    useEffect(() => {
        if (isConnected) startedAt.current = new Date();
    }, [isConnected]);

    // Follow new lines
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines, typing]);

    // Esc twice (within 2 seconds) skips to the next stranger
    useEffect(() => {
        if (!active || !isConnected || reporting || pendingText !== null) return undefined;
        let timer = null;
        let armed = false;
        const onKey = event => {
            if (event.key !== 'Escape') return;
            if (armed) {
                clearTimeout(timer);
                armed = false;
                setEscArmed(false);
                onNext();
            } else {
                armed = true;
                setEscArmed(true);
                timer = setTimeout(() => { armed = false; setEscArmed(false); }, ESC_WINDOW_MS);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            clearTimeout(timer);
            setEscArmed(false);
        };
    }, [active, isConnected, reporting, pendingText, onNext]);

    // Ask before sending something that looks like a phone number or email
    const send = text => {
        if (looksLikeContactInfo(text)) setPendingText(text);
        else stranger.send(text);
    };

    const saveChat = () => {
        const stamp = startedAt.current.toISOString().slice(0, 16).replace(/[:T]/g, '-');
        downloadText(`blinktalk-chat-${stamp}.txt`, buildTranscript(lines, { startedAt: startedAt.current }));
    };

    const report = reason => {
        setReporting(false);
        stranger.report(reason);
    };

    const hasMessages = lines.some(line => line.kind !== 'system');

    return (
        <section className={styles.chat}>
            <header className={styles.header}>
                <PartnerTitle partner={partner} phase={phase} typing={typing} />
                <div className={styles.actions}>
                    {canAddFriend && (isConnected || friend === 'added') && (
                        <FriendButton
                            friend={friend}
                            onRequest={stranger.requestFriend}
                            onAccept={stranger.acceptFriend}
                            onMessage={() => friendUser && onOpenFriend?.(friendUser)}
                        />
                    )}
                    {hasMessages && (
                        <button className="icon-btn" onClick={saveChat} aria-label="Save chat" title="Save chat as a text file">
                            <Download size={20} />
                        </button>
                    )}
                    {isConnected ? (
                        <>
                            <button className="icon-btn" onClick={() => setReporting(true)} aria-label="Report" title="Report and skip">
                                <Flag size={20} />
                            </button>
                            <button className="btn btn-ghost" onClick={onNext} title="Skip to a new stranger (Esc Esc)">
                                <SkipForward size={18} />
                                <span className={styles.actionLabel}>Next</span>
                            </button>
                            <button className="icon-btn" onClick={stranger.leave} aria-label="Leave chat" title="Leave chat">
                                <LogOut size={20} />
                            </button>
                        </>
                    ) : (
                        <button className="btn btn-primary" onClick={onNext} disabled={!connected}>
                            <Sparkles size={18} />
                            New chat
                        </button>
                    )}
                </div>
            </header>

            <div className={styles.messages} ref={scrollRef} role="log" aria-live="polite">
                {icebreaker && isConnected && (
                    <div className={styles.icebreaker}>
                        <Lightbulb size={18} aria-hidden="true" />
                        <p><strong>Icebreaker:</strong> {icebreaker}</p>
                        <button className={styles.askIt} onClick={() => { stranger.send(icebreaker); stranger.dismissIcebreaker(); }}>
                            Ask it
                        </button>
                        <button className="icon-btn" onClick={stranger.dismissIcebreaker} aria-label="Dismiss icebreaker">
                            <X size={16} />
                        </button>
                    </div>
                )}
                {lines.map(line =>
                    line.kind === 'system' ? (
                        <p key={line.id} className={styles.system}>{line.text}</p>
                    ) : (
                        <Bubble key={line.id} line={line} canReact={isConnected} onReact={stranger.react} />
                    )
                )}
                {typing && (
                    <div className={`${styles.bubble} ${styles.them} ${styles.dots}`} aria-label="Stranger is typing">
                        <i /><i /><i />
                    </div>
                )}
            </div>

            {escArmed && <div className={styles.escHint} role="status">Press Esc again to skip</div>}

            <Composer
                focusKey={phase}
                onSend={send}
                onTyping={stranger.typing}
                disabled={!isConnected || !active}
                placeholder={isConnected ? 'Say something nice' : 'Start a new chat to talk'}
            />

            {reporting && (
                <Modal title="Report this stranger" onClose={() => setReporting(false)} size="sm">
                    <p className={styles.modalText}>What happened? You’ll be moved on from this chat right away.</p>
                    <div className={styles.reasonList}>
                        {REPORT_REASONS.map(reason => (
                            <button key={reason.value} className="btn btn-ghost btn-block" onClick={() => report(reason.value)}>
                                {reason.label}
                            </button>
                        ))}
                    </div>
                </Modal>
            )}

            {pendingText !== null && (
                <Modal title="Share contact info?" onClose={() => setPendingText(null)} size="sm">
                    <p className={styles.modalText}>
                        This looks like a phone number or email. Strangers can misuse it.
                        Only share it if you really trust this person.
                    </p>
                    <blockquote className={styles.quote}>{pendingText}</blockquote>
                    <div className={styles.modalActions}>
                        <button className="btn btn-ghost" onClick={() => setPendingText(null)}>Don’t send</button>
                        <button className="btn btn-primary" onClick={() => { stranger.send(pendingText); setPendingText(null); }}>
                            Send anyway
                        </button>
                    </div>
                </Modal>
            )}
        </section>
    );
}
