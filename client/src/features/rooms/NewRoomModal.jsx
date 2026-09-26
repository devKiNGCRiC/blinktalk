import { useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import Modal from '../../components/Modal';
import { useChat } from '../../context/ChatContext';
import { errorMessage } from '../../api/client';
import styles from './NewRoomModal.module.css';

const TYPES = [
    { id: 'public', label: 'Public', icon: Globe, help: 'Anyone can find it in search and join.' },
    { id: 'private', label: 'Private', icon: Lock, help: 'Hidden from search. Only members can read it.' }
];

export default function NewRoomModal({ onClose }) {
    const { createRoom } = useChat();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('public');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const nameOk = name.trim().length >= 3 && name.trim().length <= 50;

    async function submit(event) {
        event.preventDefault();
        if (!nameOk) return;
        setBusy(true);
        setError('');
        try {
            await createRoom({ name: name.trim(), description: description.trim(), type });
            onClose();
        } catch (err) {
            setError(errorMessage(err, 'Couldn\'t create the room.'));
            setBusy(false);
        }
    }

    return (
        <Modal title="New room" onClose={onClose}>
            <form className={styles.form} onSubmit={submit}>
                <label className="field">
                    <span>Name</span>
                    <input
                        className="input"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        placeholder="e.g. Cricket Fans"
                        maxLength={50}
                        required
                    />
                </label>
                <label className="field">
                    <span>Description (optional)</span>
                    <textarea
                        className="input"
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        placeholder="What’s this room about?"
                        maxLength={200}
                        rows={3}
                    />
                </label>

                <fieldset className={styles.types}>
                    <legend>Who can join</legend>
                    {TYPES.map(({ id, label, icon: Icon, help }) => (
                        <label key={id} className={`${styles.type} ${type === id ? styles.selected : ''}`}>
                            <input type="radio" name="room-type" value={id} checked={type === id} onChange={() => setType(id)} />
                            <Icon size={20} aria-hidden="true" />
                            <span>
                                <strong>{label}</strong>
                                <small>{help}</small>
                            </span>
                        </label>
                    ))}
                </fieldset>

                {error && <p className="field-error" role="alert">{error}</p>}

                <button className="btn btn-primary btn-block" disabled={busy || !nameOk}>
                    {busy ? 'Creating…' : 'Create room'}
                </button>
            </form>
        </Modal>
    );
}
