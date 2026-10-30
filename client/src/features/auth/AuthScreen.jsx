import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { checkPassword, isStrongPassword, usernameError } from '../../lib/password';
import Logo from '../../components/Logo';
import DemoChat from './DemoChat';
import styles from './AuthScreen.module.css';

function PasswordInput({ id, value, onChange, autoComplete, placeholder }) {
    const [visible, setVisible] = useState(false);
    return (
        <div className={styles.passwordWrap}>
            <input
                id={id}
                className="input"
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={event => onChange(event.target.value)}
                autoComplete={autoComplete}
                placeholder={placeholder}
                required
            />
            <button
                type="button"
                className={styles.reveal}
                onClick={() => setVisible(v => !v)}
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </div>
    );
}

function LoginForm() {
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await login(identifier.trim(), password);
        } catch (err) {
            setError(errorMessage(err, 'Couldn\'t log in. Try again.'));
            setBusy(false);
        }
    }

    return (
        <form className={styles.form} onSubmit={submit} noValidate>
            <label className="field">
                <span>Email or username</span>
                <input
                    className="input"
                    value={identifier}
                    onChange={event => setIdentifier(event.target.value)}
                    autoComplete="username"
                    required
                />
            </label>
            <div className="field">
                <label htmlFor="login-password"><span className={styles.label}>Password</span></label>
                <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || !identifier.trim() || !password}>
                {busy ? 'Logging in…' : 'Log in'}
            </button>
        </form>
    );
}

function SignupForm() {
    const { register } = useAuth();
    const [fields, setFields] = useState({ username: '', email: '', password: '', confirmPassword: '' });
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [touched, setTouched] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const set = name => value => setFields(current => ({ ...current, [name]: value }));
    const touch = name => () => setTouched(current => ({ ...current, [name]: true }));

    const nameProblem = fields.username && usernameError(fields.username);
    const mismatch = fields.confirmPassword && fields.confirmPassword !== fields.password;
    const rules = checkPassword(fields.password);
    const canSubmit = !usernameError(fields.username) && /\S+@\S+\.\S+/.test(fields.email)
        && isStrongPassword(fields.password) && fields.password === fields.confirmPassword && acceptedTerms;

    async function submit(event) {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError('');
        try {
            await register({ ...fields, username: fields.username.trim(), email: fields.email.trim(), acceptedTerms });
        } catch (err) {
            setError(errorMessage(err, 'Couldn\'t create your account. Try again.'));
            setBusy(false);
        }
    }

    return (
        <form className={styles.form} onSubmit={submit} noValidate>
            <label className="field">
                <span>Username</span>
                <input
                    className="input"
                    value={fields.username}
                    onChange={event => set('username')(event.target.value)}
                    onBlur={touch('username')}
                    autoComplete="username"
                    placeholder="letters, numbers, _"
                    aria-invalid={Boolean(touched.username && nameProblem)}
                    required
                />
                {touched.username && nameProblem && <span className="field-error">{nameProblem}</span>}
            </label>
            <label className="field">
                <span>Email</span>
                <input
                    className="input"
                    type="email"
                    value={fields.email}
                    onChange={event => set('email')(event.target.value)}
                    autoComplete="email"
                    required
                />
            </label>
            <div className="field">
                <label htmlFor="signup-password"><span className={styles.label}>Password</span></label>
                <PasswordInput id="signup-password" value={fields.password} onChange={set('password')} autoComplete="new-password" />
                <ul className={styles.rules} aria-label="Password requirements">
                    {rules.map(rule => (
                        <li key={rule.id} className={rule.met ? styles.met : ''}>
                            <Check size={14} aria-hidden="true" />
                            {rule.label}
                            <span className="visually-hidden">{rule.met ? '(done)' : '(missing)'}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="field">
                <label htmlFor="signup-confirm"><span className={styles.label}>Confirm password</span></label>
                <PasswordInput id="signup-confirm" value={fields.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
                {mismatch && <span className="field-error">Passwords don’t match</span>}
            </div>
            <label className={styles.terms}>
                <input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} />
                <span>I’m 18 or older and I’ll follow the rules: be kind, no harassment, no sharing anyone’s personal details.</span>
            </label>
            {error && <p className="field-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || !canSubmit}>
                {busy ? 'Creating account…' : 'Create account'}
            </button>
        </form>
    );
}

export default function AuthScreen() {
    const { authMode, closeAuth } = useAuth();
    const [mode, setMode] = useState(authMode || 'login');

    // Esc closes the screen and goes back to chatting
    useEffect(() => {
        const onKey = event => event.key === 'Escape' && closeAuth();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeAuth]);

    return (
        <div className={styles.screen} role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Log in' : 'Sign up'}>
            <button className={`icon-btn ${styles.close}`} onClick={closeAuth} aria-label="Close and keep chatting">
                <X size={22} />
            </button>
            <div className={styles.glow} aria-hidden="true" />

            {/* Full-screen backdrop scrolls; the content stays centered */}
            <div className={styles.layout}>
                <section className={styles.hero}>
                    <Logo size={36} />
                    <h1 className={styles.headline}>
                        Met someone fun?
                        <br />
                        Keep them.
                    </h1>
                    <p className={styles.lede}>
                        With an account you get unlimited chats, gender and country filters, more interests, and friends you can message any time.
                    </p>
                    <div className={styles.demo}>
                        <DemoChat />
                    </div>
                </section>

                <section className={styles.cardWrap}>
                    <div className={styles.card}>
                        <div className={styles.tabs} role="tablist">
                            <button
                                role="tab"
                                aria-selected={mode === 'login'}
                                className={mode === 'login' ? styles.activeTab : ''}
                                onClick={() => setMode('login')}
                            >
                                Log in
                            </button>
                            <button
                                role="tab"
                                aria-selected={mode === 'signup'}
                                className={mode === 'signup' ? styles.activeTab : ''}
                                onClick={() => setMode('signup')}
                            >
                                Sign up
                            </button>
                        </div>

                        {mode === 'login' ? <LoginForm /> : <SignupForm />}

                        <p className={styles.note}>
                            Or <button className={styles.link} onClick={closeAuth}>keep chatting without an account</button>
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
