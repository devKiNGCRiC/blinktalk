import { useRef } from 'react';
import { Ghost, Filter } from 'lucide-react';
import { useStranger } from './useStranger';
import StrangerIntro from './StrangerIntro';
import StrangerChat from './StrangerChat';
import styles from './StrangerPanel.module.css';

/**
 * Stranger chat screen: start → searching → chat.
 */
export default function StrangerPanel({ active, guest, onOpenFriend }) {
    const stranger = useStranger();
    const { state, connected } = stranger;

    // "Next" and "New chat" reuse the interests and filters from the last start
    const lastSearch = useRef({});
    const start = options => {
        lastSearch.current = options;
        stranger.search(options);
    };
    const again = () => stranger.search(lastSearch.current);

    if (state.phase === 'idle') {
        return (
            <StrangerIntro
                guest={guest}
                online={state.online}
                limit={state.limit}
                bannedUntil={state.bannedUntil}
                connected={connected}
                onStart={start}
            />
        );
    }

    if (state.phase === 'searching') {
        return (
            <section className={styles.searching} aria-live="polite">
                <div className={styles.radar} aria-hidden="true">
                    <span /><span /><span />
                    <div className={styles.radarCore}><Ghost size={34} /></div>
                </div>
                {state.noMatch ? (
                    <>
                        <h2>No match yet</h2>
                        <p>Nobody who fits your filters is around right now. Widen your search to talk to anyone?</p>
                        <div className={styles.searchActions}>
                            <button className="btn btn-primary" onClick={stranger.widen}>
                                <Filter size={18} /> Widen search
                            </button>
                            <button className="btn btn-ghost" onClick={stranger.leave}>Cancel</button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2>Looking for someone…</h2>
                        <p>This usually takes a few seconds. Stay on this page.</p>
                        {state.online > 0 && <p className={styles.onlineCount}>{state.online.toLocaleString()} online now</p>}
                        <button className="btn btn-ghost" onClick={stranger.leave}>Cancel</button>
                    </>
                )}
            </section>
        );
    }

    return (
        <StrangerChat
            stranger={stranger}
            active={active}
            guest={guest}
            onNext={again}
            onOpenFriend={onOpenFriend}
        />
    );
}
