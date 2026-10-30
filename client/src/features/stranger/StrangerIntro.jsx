import { useState } from 'react';
import { Ghost, Sparkles, X, Lock, Ban, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { COUNTRIES, GENDERS } from '../../lib/countries';
import styles from './StrangerIntro.module.css';

const TERMS_KEY = 'blinktalk:terms';
const INTERESTS_KEY = 'blinktalk:interests';
const MAX_TAG_LENGTH = 24;

function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

const clock = date => new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayAndClock = date => new Date(date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Type a tag, press Enter or comma to add it */
function InterestInput({ tags, setTags, max }) {
    const [draft, setDraft] = useState('');
    const full = tags.length >= max;

    const add = () => {
        const tag = draft.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
        if (tag && !tags.includes(tag) && !full) setTags([...tags, tag]);
        setDraft('');
    };

    const onKeyDown = event => {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
        } else if (event.key === 'Backspace' && !draft && tags.length) {
            setTags(tags.slice(0, -1));
        }
    };

    return (
        <div className={styles.tagBox}>
            {tags.map(tag => (
                <span key={tag} className={styles.tag}>
                    #{tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))} aria-label={`Remove ${tag}`}>
                        <X size={14} />
                    </button>
                </span>
            ))}
            {!full && (
                <input
                    className={styles.tagInput}
                    value={draft}
                    onChange={event => setDraft(event.target.value.replace(',', ''))}
                    onKeyDown={onKeyDown}
                    onBlur={add}
                    maxLength={MAX_TAG_LENGTH}
                    placeholder={tags.length ? 'Add another' : 'e.g. music, cricket, anime'}
                    aria-label="Add an interest"
                />
            )}
        </div>
    );
}

/** Start screen: interests, filters, rules, and limit or ban notices */
export default function StrangerIntro({ guest, online, limit, bannedUntil, connected, onStart }) {
    const { openAuth } = useAuth();
    const maxTags = guest ? 1 : 5;
    const [tags, setTagsState] = useState(() => readStorage(INTERESTS_KEY, []).slice(0, maxTags));
    const [gender, setGender] = useState('');
    const [country, setCountry] = useState('');
    const [accepted, setAccepted] = useState(() => !guest || readStorage(TERMS_KEY, false));

    const setTags = next => {
        setTagsState(next);
        writeStorage(INTERESTS_KEY, next);
    };

    const start = () => {
        if (guest) writeStorage(TERMS_KEY, true);
        const filters = guest ? undefined : { gender: gender || null, country: country || null };
        onStart({ interests: tags.slice(0, maxTags), filters });
    };

    const banned = bannedUntil && new Date(bannedUntil) > new Date();
    const blocked = banned || Boolean(limit);

    return (
        <section className={styles.intro}>
            <div className={styles.icon}><Ghost size={40} /></div>
            <h1>Meet someone new</h1>
            <p className={styles.lede}>
                We’ll pair you with a random person who’s also looking to talk.
                Leave whenever you want.
            </p>
            {online > 0 && (
                <p className={styles.online}>
                    <span className={styles.dot} aria-hidden="true" />
                    {online.toLocaleString()} online now
                </p>
            )}

            {banned && (
                <div className={`${styles.notice} ${styles.danger}`} role="alert">
                    <Ban size={20} />
                    <p>
                        Several people reported you, so stranger chat is paused for you
                        until <strong>{dayAndClock(bannedUntil)}</strong>.
                    </p>
                </div>
            )}

            {!banned && limit && (
                <div className={styles.notice} role="status">
                    <Clock size={20} />
                    <div>
                        <p>
                            You’ve used today’s {limit.limit} free chats. More at <strong>{clock(limit.resetsAt)}</strong>,
                            or sign up for unlimited chats.
                        </p>
                        <button className="btn btn-primary" onClick={() => openAuth('signup')}>Sign up free</button>
                    </div>
                </div>
            )}

            {!blocked && (
                <div className={styles.card}>
                    <div className="field">
                        <span className={styles.label}>
                            {guest ? 'Your interest (optional)' : 'Your interests (optional, up to 5)'}
                        </span>
                        <InterestInput tags={tags} setTags={setTags} max={maxTags} />
                        <span className={styles.hint}>We look for someone who shares one for a few seconds, then anyone.</span>
                    </div>

                    {guest ? (
                        <button className={styles.locked} onClick={() => openAuth('signup')}>
                            <Lock size={16} />
                            Gender and country filters, more interests and unlimited chats come with a free account
                        </button>
                    ) : (
                        <div className={styles.filters}>
                            <label className="field">
                                <span className={styles.label}>Talk to</span>
                                <select className="input" value={gender} onChange={event => setGender(event.target.value)}>
                                    <option value="">Anyone</option>
                                    {GENDERS.map(g => <option key={g.value} value={g.value}>{g.plural}</option>)}
                                </select>
                            </label>
                            <label className="field">
                                <span className={styles.label}>From</span>
                                <select className="input" value={country} onChange={event => setCountry(event.target.value)}>
                                    <option value="">Anywhere</option>
                                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                                </select>
                            </label>
                        </div>
                    )}

                    {guest && (
                        <label className={styles.terms}>
                            <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
                            <span>I’m 18 or older and I’ll be kind: no harassment, no sharing anyone’s personal details.</span>
                        </label>
                    )}

                    <button className={`btn btn-primary btn-block ${styles.start}`} onClick={start} disabled={!connected || !accepted}>
                        <Sparkles size={18} />
                        {connected ? 'Start chatting' : 'Connecting…'}
                    </button>
                </div>
            )}

            <ul className={styles.tips}>
                <li>There’s a real person on the other side. Be kind.</li>
                <li>Never share your phone number, address or passwords.</li>
            </ul>
        </section>
    );
}
