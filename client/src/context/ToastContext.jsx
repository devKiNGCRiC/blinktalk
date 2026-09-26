import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import styles from '../components/Toast.module.css';

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismiss = useCallback(id => {
        setToasts(list => list.filter(toast => toast.id !== id));
    }, []);

    const show = useCallback((text, type = 'info') => {
        const id = nextId.current++;
        setToasts(list => [...list.slice(-2), { id, text, type }]); // at most 3 on screen
        setTimeout(() => dismiss(id), type === 'error' ? 5000 : 3500);
    }, [dismiss]);

    const api = useMemo(() => ({
        show,
        success: text => show(text, 'success'),
        error: text => show(text, 'error'),
        info: text => show(text, 'info')
    }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className={styles.host} aria-live="polite">
                {toasts.map(toast => {
                    const Icon = ICONS[toast.type];
                    return (
                        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`} role={toast.type === 'error' ? 'alert' : 'status'}>
                            <Icon size={18} aria-hidden="true" />
                            <span>{toast.text}</span>
                            <button className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                                <X size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
