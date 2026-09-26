import { useState } from 'react';
import { Check, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import * as usersApi from '../../api/users';
import * as authApi from '../../api/auth';
import { errorMessage } from '../../api/client';
import { THEMES } from '../../lib/theme';
import { checkPassword, isStrongPassword } from '../../lib/password';
import Avatar from '../../components/Avatar';
import styles from './SettingsPanel.module.css';

const AVATAR_STYLES = ['adventurer', 'avataaars', 'bottts-neutral', 'fun-emoji', 'lorelei', 'notionists', 'thumbs', 'pixel-art'];
const avatarUrl = (style, seed) => `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

function ThemePicker() {
    const { theme, setTheme } = useTheme();
    const { status, updateUser } = useAuth();

    function choose(id) {
        setTheme(id);
        // Save to the account too, so it follows the user to other devices
        if (status === 'user') {
            usersApi.updateProfile({ preferences: { theme: id } }).then(updateUser).catch(() => {});
        }
    }

    return (
        <div className={styles.themes} role="radiogroup" aria-label="Theme">
            {THEMES.map(option => (
                <button
                    key={option.id}
                    data-theme={option.id}
                    className={`${styles.themeCard} ${theme === option.id ? styles.themeActive : ''}`}
                    role="radio"
                    aria-checked={theme === option.id}
                    onClick={() => choose(option.id)}
                >
                    <span className={styles.mini} aria-hidden="true">
                        <span className={styles.miniThem}>hey 👋</span>
                        <span className={styles.miniMe}>hiii</span>
                    </span>
                    <span className={styles.themeName}>
                        {option.name}
                        {theme === option.id && <Check size={16} />}
                    </span>
                </button>
            ))}
        </div>
    );
}

function ProfileForm() {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [displayName, setDisplayName] = useState(user.displayName || '');
    const [bio, setBio] = useState(user.bio || '');
    const [avatar, setAvatar] = useState(user.avatar);
    const [busy, setBusy] = useState(false);

    const changed = displayName !== (user.displayName || '') || bio !== (user.bio || '') || avatar !== user.avatar;

    async function save(event) {
        event.preventDefault();
        setBusy(true);
        try {
            const updated = await usersApi.updateProfile({ displayName: displayName.trim(), bio: bio.trim(), avatar });
            updateUser(updated);
            toast.success('Profile saved');
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn’t save your profile.'));
        } finally {
            setBusy(false);
        }
    }

    const choices = [...new Set([user.avatar, ...AVATAR_STYLES.map(style => avatarUrl(style, user.username))])];

    return (
        <form className={styles.form} onSubmit={save}>
            <div className={styles.profileTop}>
                <Avatar src={avatar} name={displayName || user.username} size={72} />
                <div>
                    <p className={styles.profileName}>{displayName || user.username}</p>
                    <p className={styles.muted}>@{user.username}</p>
                    <p className={styles.muted}>{user.email}</p>
                </div>
            </div>

            <fieldset className={styles.avatars}>
                <legend>Avatar</legend>
                {choices.map(url => (
                    <label key={url} className={`${styles.avatarChoice} ${avatar === url ? styles.avatarActive : ''}`}>
                        <input type="radio" name="avatar" checked={avatar === url} onChange={() => setAvatar(url)} />
                        <Avatar src={url} name={user.username} size={48} />
                        <span className="visually-hidden">Avatar option</span>
                    </label>
                ))}
            </fieldset>

            <label className="field">
                <span>Display name</span>
                <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50} />
            </label>
            <label className="field">
                <span>Bio</span>
                <textarea className="input" value={bio} onChange={e => setBio(e.target.value)} maxLength={200} rows={2} />
                <small className={styles.counter}>{bio.length}/200</small>
            </label>
            <div>
                <button className="btn btn-primary" disabled={busy || !changed}>
                    {busy ? 'Saving…' : 'Save profile'}
                </button>
            </div>
        </form>
    );
}

function SoundToggle() {
    const { user, updateUser } = useAuth();
    const on = user.preferences?.sounds !== false;

    async function toggle() {
        const next = !on;
        updateUser({ ...user, preferences: { ...user.preferences, sounds: next } });
        try {
            updateUser(await usersApi.updateProfile({ preferences: { sounds: next } }));
        } catch {
            updateUser(user); // undo
        }
    }

    return (
        <div className={styles.toggleRow}>
            <div>
                <p className={styles.rowTitle}>Message sound</p>
                <p className={styles.muted}>Play a short sound when a message arrives in a chat you don’t have open.</p>
            </div>
            <button role="switch" aria-checked={on} className={`${styles.switch} ${on ? styles.switchOn : ''}`} onClick={toggle}>
                <span className="visually-hidden">Message sound</span>
            </button>
        </div>
    );
}

function PasswordForm() {
    const toast = useToast();
    const [fields, setFields] = useState({ current: '', next: '', confirm: '' });
    const [busy, setBusy] = useState(false);
    const set = name => event => setFields(current => ({ ...current, [name]: event.target.value }));
    const valid = fields.current && isStrongPassword(fields.next) && fields.next === fields.confirm;

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        try {
            await authApi.changePassword(fields.current, fields.next, fields.confirm);
            setFields({ current: '', next: '', confirm: '' });
            toast.success('Password changed');
        } catch (error) {
            toast.error(errorMessage(error, 'Couldn’t change your password.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className={styles.form} onSubmit={submit}>
            <label className="field">
                <span>Current password</span>
                <input className="input" type="password" value={fields.current} onChange={set('current')} autoComplete="current-password" />
            </label>
            <label className="field">
                <span>New password</span>
                <input className="input" type="password" value={fields.next} onChange={set('next')} autoComplete="new-password" />
            </label>
            {fields.next && (
                <ul className={styles.rules}>
                    {checkPassword(fields.next).map(rule => (
                        <li key={rule.id} className={rule.met ? styles.met : ''}><Check size={13} /> {rule.label}</li>
                    ))}
                </ul>
            )}
            <label className="field">
                <span>Confirm new password</span>
                <input className="input" type="password" value={fields.confirm} onChange={set('confirm')} autoComplete="new-password" />
                {fields.confirm && fields.confirm !== fields.next && <span className="field-error">Passwords don’t match</span>}
            </label>
            <div>
                <button className="btn btn-ghost" disabled={busy || !valid}>{busy ? 'Changing…' : 'Change password'}</button>
            </div>
        </form>
    );
}

function Section({ title, description, children }) {
    return (
        <section className={styles.section}>
            <div className={styles.sectionHead}>
                <h2>{title}</h2>
                {description && <p className={styles.muted}>{description}</p>}
            </div>
            {children}
        </section>
    );
}

export default function SettingsPanel({ guest }) {
    const { logout, leaveGuest } = useAuth();

    return (
        <div className={styles.page}>
            <div className={styles.column}>
                <h1 className={styles.heading}>{guest ? 'Theme' : 'Settings'}</h1>

                {!guest && (
                    <Section title="Profile" description="This is how people see you in chats and rooms.">
                        <ProfileForm />
                    </Section>
                )}

                <Section title="Theme" description="Pick a vibe. It changes instantly.">
                    <ThemePicker />
                </Section>

                {guest ? (
                    <Section title="Make it yours" description="An account lets you add friends, join rooms and keep your chat history.">
                        <div>
                            <button className="btn btn-primary" onClick={leaveGuest}>
                                <UserPlus size={18} /> Create an account
                            </button>
                        </div>
                    </Section>
                ) : (
                    <>
                        <Section title="Notifications">
                            <SoundToggle />
                        </Section>
                        <Section title="Password">
                            <PasswordForm />
                        </Section>
                        <Section title="Account">
                            <div>
                                <button className="btn btn-danger" onClick={logout}>
                                    <LogOut size={18} /> Log out
                                </button>
                            </div>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}
