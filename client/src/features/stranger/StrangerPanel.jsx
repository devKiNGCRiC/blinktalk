import { useEffect, useRef, useState } from 'react';
import { Ghost, SkipForward, LogOut, Sparkles } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import Composer from '../../components/Composer';
import { formatClock } from '../../lib/format';
import styles from './StrangerPanel.module.css';

const TYPING_SHOW_MS = 2500;

/**
 * Anonymous stranger chat.
 * phase: 'idle' → 'searching' → 'connected' → 'ended' (→ 'searching' again)
 */
export default function StrangerPanel({ active, guest }) {
    const { socket, connected } = useSocket();
    const { leaveGuest } = useAuth();
    const [phase, setPhase] = useState('idle');
    const [lines, setLines] = useState([]);
    const [strangerTyping, setStrangerTyping] = useState(false);
    const typingTimer = useRef(null);
    const scrollRef = useRef(null);
    const nextId = useRef(0);
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    const addLine = line => setLines(current => [...current, { id: nextId.current++, ...line }]);

    useEffect(() => {
        if (!socket) return undefined;

        const handlers = {
            'stranger:searching': () => setPhase('searching'),
            'stranger:connected': () => {
                setLines([]);
                addLine({ kind: 'system', text: 'You’re connected to a stranger. Say hi 👋' });
                setPhase('connected');
            },
            'stranger:message': data => {
                setStrangerTyping(false);
                addLine({ kind: data.from === 'you' ? 'me' : 'them', text: data.content, at: data.timestamp });
            },
            'stranger:typing': () => {
                setStrangerTyping(true);
                clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => setStrangerTyping(false), TYPING_SHOW_MS);
            },
            'stranger:disconnected': () => {
                setStrangerTyping(false);
                addLine({ kind: 'system', text: 'Stranger left the chat 👋' });
                setPhase('ended');
            },
            'stranger:ended': () => {
                setStrangerTyping(false);
                if (phaseRef.current === 'searching') {
                    setPhase('idle');
                } else {
                    addLine({ kind: 'system', text: 'You left the chat.' });
                    setPhase('ended');
                }
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
        return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
    }, [socket]);

    // A dropped connection ends the stranger chat on the server
    useEffect(() => {
        if (!connected && (phase === 'connected' || phase === 'searching')) {
            if (phase === 'connected') addLine({ kind: 'system', text: 'Connection lost. The chat ended.' });
            setPhase(phase === 'connected' ? 'ended' : 'idle');
        }
    }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

    // Follow new lines
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines, strangerTyping]);

    useEffect(() => () => clearTimeout(typingTimer.current), []);

    const search = () => {
        setLines([]);
        setPhase('searching');
        socket?.emit('stranger:search', {});
    };
    const leave = () => socket?.emit('stranger:disconnect');
    const send = text => socket?.emit('stranger:message', { content: text });
    const typing = isTyping => isTyping && socket?.emit('stranger:typing');

    if (phase === 'idle') {
        return (
            <section className={styles.intro}>
                <div className={styles.introIcon}><Ghost size={40} /></div>
                <h1>Meet someone new</h1>
                <p>
                    We’ll pair you with a random person who’s also looking to talk.
                    Nobody sees your name. Leave whenever you want.
                </p>
                <button className="btn btn-primary" onClick={search} disabled={!connected}>
                    <Sparkles size={18} />
                    {connected ? 'Find a stranger' : 'Connecting…'}
                </button>
                <ul className={styles.tips}>
                    <li>Be kind. There’s a real person on the other side.</li>
                    <li>Don’t share your phone number, address or passwords.</li>
                </ul>
                {guest && (
                    <p className={styles.signup}>
                        Want to keep your chats and add friends?{' '}
                        <button onClick={leaveGuest}>Create an account</button>
                    </p>
                )}
            </section>
        );
    }

    if (phase === 'searching') {
        return (
            <section className={styles.searching} aria-live="polite">
                <div className={styles.radar} aria-hidden="true">
                    <span /><span /><span />
                    <div className={styles.radarCore}><Ghost size={34} /></div>
                </div>
                <h2>Looking for someone…</h2>
                <p>This usually takes a few seconds. Stay on this page.</p>
                <button className="btn btn-ghost" onClick={leave}>Cancel</button>
            </section>
        );
    }

    return (
        <section className={styles.chat}>
            <header className={styles.header}>
                <span className={styles.ghost}><Ghost size={22} /></span>
                <div className={styles.title}>
                    <h2>Stranger</h2>
                    <p className={strangerTyping ? styles.typing : phase === 'connected' ? styles.online : ''}>
                        {phase === 'ended' ? 'chat ended' : strangerTyping ? 'typing…' : 'connected'}
                    </p>
                </div>
                <div className={styles.actions}>
                    {phase === 'connected' ? (
                        <>
                            <button className="btn btn-ghost" onClick={search} title="Skip to a new stranger">
                                <SkipForward size={18} />
                                <span className={styles.actionLabel}>Next</span>
                            </button>
                            <button className="icon-btn" onClick={leave} aria-label="Leave chat" title="Leave chat">
                                <LogOut size={20} />
                            </button>
                        </>
                    ) : (
                        <button className="btn btn-primary" onClick={search} disabled={!connected}>
                            <Sparkles size={18} />
                            Find another
                        </button>
                    )}
                </div>
            </header>

            <div className={styles.messages} ref={scrollRef} role="log" aria-live="polite">
                {lines.map(line =>
                    line.kind === 'system' ? (
                        <p key={line.id} className={styles.system}>{line.text}</p>
                    ) : (
                        <div key={line.id} className={`${styles.bubble} ${styles[line.kind]}`}>
                            <p>{line.text}</p>
                            <span>{formatClock(line.at)}</span>
                        </div>
                    )
                )}
                {strangerTyping && (
                    <div className={`${styles.bubble} ${styles.them} ${styles.dots}`} aria-label="Stranger is typing">
                        <i /><i /><i />
                    </div>
                )}
            </div>

            <Composer
                focusKey={phase}
                onSend={send}
                onTyping={typing}
                disabled={phase !== 'connected' || !active}
                placeholder={phase === 'connected' ? 'Say something nice' : 'Find a stranger to chat'}
            />
        </section>
    );
}
