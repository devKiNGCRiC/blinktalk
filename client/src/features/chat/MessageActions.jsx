import { CornerUpLeft, Copy, Trash2, Users } from 'lucide-react';
import Modal from '../../components/Modal';
import { useToast } from '../../context/ToastContext';
import styles from './MessageActions.module.css';

/**
 * Actions for one message: reply, copy, delete for me, delete for everyone.
 * Opened by the trash button (mouse) or a long-press (touch).
 */
export default function MessageActions({ message, isMine, onClose, onReply, onDelete }) {
    const toast = useToast();

    const run = action => () => {
        action();
        onClose();
    };

    const copy = () => {
        navigator.clipboard?.writeText(message.content)
            .then(() => toast.success('Copied'))
            .catch(() => toast.error('Couldn’t copy. Select the text instead.'));
    };

    return (
        <Modal title="Message" onClose={onClose} size="sm">
            <p className={styles.preview}>{message.content}</p>
            <ul className={styles.list}>
                <li>
                    <button onClick={run(onReply)}><CornerUpLeft size={18} /> Reply</button>
                </li>
                <li>
                    <button onClick={run(copy)}><Copy size={18} /> Copy text</button>
                </li>
                <li>
                    <button className={styles.danger} onClick={run(() => onDelete('me'))}>
                        <Trash2 size={18} /> Delete for me
                    </button>
                </li>
                {isMine && (
                    <li>
                        <button className={styles.danger} onClick={run(() => onDelete('everyone'))}>
                            <Users size={18} /> Delete for everyone
                        </button>
                    </li>
                )}
            </ul>
        </Modal>
    );
}
