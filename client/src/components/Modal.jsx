import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

/**
 * Dialog that becomes a bottom sheet on small screens.
 * Closes on Escape, the scrim, or the close button, and returns focus afterwards.
 */
export default function Modal({ title, onClose, children, size = 'md' }) {
    const panelRef = useRef(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement;
        const firstField = panelRef.current?.querySelector('input, textarea, select, button:not([data-close])');
        (firstField || panelRef.current)?.focus();

        const onKey = event => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previouslyFocused?.focus?.();
        };
    }, [onClose]);

    return createPortal(
        <div className={styles.scrim} onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <div
                ref={panelRef}
                className={`${styles.panel} ${styles[size]}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
            >
                <header className={styles.header}>
                    <h2>{title}</h2>
                    <button className="icon-btn" onClick={onClose} aria-label="Close" data-close>
                        <X size={20} />
                    </button>
                </header>
                {children}
            </div>
        </div>,
        document.body
    );
}
