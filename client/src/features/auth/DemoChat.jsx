import { useEffect, useState } from 'react';
import styles from './DemoChat.module.css';

// A short stranger-chat conversation that plays on the landing page
const SCRIPT = [
    { from: 'them', text: 'anyone awake? 👀' },
    { from: 'me', text: 'always. where are you from?' },
    { from: 'them', text: 'pune! you?' },
    { from: 'me', text: 'bangalore. same rain, different city 🌧️' },
    { from: 'them', text: 'ok you’re officially my favourite stranger' }
];

const STEP_MS = 1500;
const TYPING_MS = 900;
const PAUSE_MS = 3500;

/** Plays SCRIPT one bubble at a time, with typing dots before each reply, then loops */
export default function DemoChat() {
    const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [shown, setShown] = useState(reducedMotion ? SCRIPT.length : 0);
    const [typing, setTyping] = useState(false);

    useEffect(() => {
        if (reducedMotion) return undefined;
        let timer;

        if (shown >= SCRIPT.length) {
            timer = setTimeout(() => setShown(0), PAUSE_MS);
        } else if (SCRIPT[shown].from === 'them') {
            timer = setTimeout(() => {
                setTyping(true);
                timer = setTimeout(() => {
                    setTyping(false);
                    setShown(count => count + 1);
                }, TYPING_MS);
            }, shown === 0 ? 400 : STEP_MS - TYPING_MS);
        } else {
            timer = setTimeout(() => setShown(count => count + 1), STEP_MS);
        }
        return () => clearTimeout(timer);
    }, [shown, reducedMotion]);

    return (
        <div className={styles.demo} aria-label="Example conversation with a stranger" role="img">
            <div className={styles.header}>
                <span className={styles.avatar} aria-hidden="true">?</span>
                <div>
                    <strong>Stranger</strong>
                    <span className={styles.status}>{typing ? 'typing…' : 'connected'}</span>
                </div>
            </div>
            <div className={styles.messages}>
                {SCRIPT.slice(0, shown).map((line, index) => (
                    <p key={index} className={`${styles.bubble} ${styles[line.from]}`}>
                        {line.text}
                    </p>
                ))}
                {typing && (
                    <p className={`${styles.bubble} ${styles.them} ${styles.dots}`}>
                        <span /><span /><span />
                    </p>
                )}
            </div>
        </div>
    );
}
