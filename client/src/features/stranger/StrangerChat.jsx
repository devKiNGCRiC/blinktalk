import { useEffect, useRef } from 'react';
import { Ghost, SkipForward, LogOut, Sparkles } from 'lucide-react';
import Composer from '../../components/Composer';
import { formatClock } from '../../lib/format';
import styles from './StrangerPanel.module.css';

/** The conversation with a stranger (connected, or ended with the transcript still visible) */
export default function StrangerChat({ stranger, active, onNext }) {
    const { state, connected } = stranger;
    const { phase, lines, typing } = state;
    const scrollRef = useRef(null);

    // Follow new lines
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines, typing]);

    return (
        <section className={styles.chat}>
            <header className={styles.header}>
                <span className={styles.ghost}><Ghost size={22} /></span>
                <div className={styles.title}>
                    <h2>Stranger</h2>
                    <p className={typing ? styles.typing : phase === 'connected' ? styles.online : ''}>
                        {phase === 'ended' ? 'chat ended' : typing ? 'typing…' : 'connected'}
                    </p>
                </div>
                <div className={styles.actions}>
                    {phase === 'connected' ? (
                        <>
                            <button className="btn btn-ghost" onClick={onNext} title="Skip to a new stranger">
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
                {typing && (
                    <div className={`${styles.bubble} ${styles.them} ${styles.dots}`} aria-label="Stranger is typing">
                        <i /><i /><i />
                    </div>
                )}
            </div>

            <Composer
                focusKey={phase}
                onSend={stranger.send}
                onTyping={stranger.typing}
                disabled={phase !== 'connected' || !active}
                placeholder={phase === 'connected' ? 'Say something nice' : 'Start a new chat to talk'}
            />
        </section>
    );
}
