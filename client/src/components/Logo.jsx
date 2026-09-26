import styles from './Logo.module.css';

/** Chat-bubble mark with two "eyes" that blink, plus the wordmark */
export function LogoMark({ size = 32 }) {
    return (
        <svg className={styles.mark} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
            <path
                d="M12 8h40a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H28l-12 10v-10h-4a8 8 0 0 1-8-8V16a8 8 0 0 1 8-8z"
                fill="url(#logo-gradient)"
            />
            <g className={styles.eyes}>
                <rect x="22" y="22" width="6" height="12" rx="3" />
                <rect x="36" y="22" width="6" height="12" rx="3" />
            </g>
            <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" className={styles.stopA} />
                    <stop offset="1" className={styles.stopB} />
                </linearGradient>
            </defs>
        </svg>
    );
}

export default function Logo({ size = 32 }) {
    return (
        <span className={styles.logo}>
            <LogoMark size={size} />
            <span className={styles.word}>BlinkTalk</span>
        </span>
    );
}
