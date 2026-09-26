import { useState } from 'react';
import styles from './Avatar.module.css';

function initials(name = '?') {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

/**
 * Round avatar with an optional online dot.
 * Falls back to initials when there is no image or it fails to load.
 */
export default function Avatar({ src, name, size = 44, online }) {
    const [failed, setFailed] = useState(false);
    // The server's default avatars (ui-avatars.com) use random colors that clash with
    // the themes, so show themed initials instead
    const isDefault = src?.includes('ui-avatars.com');
    const showImage = src && !isDefault && !failed;

    return (
        <span className={styles.avatar} style={{ '--size': `${size}px` }}>
            {showImage ? (
                <img src={src} alt="" onError={() => setFailed(true)} loading="lazy" />
            ) : (
                <span className={styles.initials} aria-hidden="true">{initials(name)}</span>
            )}
            {online !== undefined && (
                <span className={`${styles.dot} ${online ? styles.online : ''}`}>
                    <span className="visually-hidden">{online ? 'Online' : 'Offline'}</span>
                </span>
            )}
        </span>
    );
}
