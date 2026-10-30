import { useChat } from '../../context/ChatContext';
import { privateKey } from '../../context/chatReducer';
import Avatar from '../../components/Avatar';
import SkeletonRows from '../../components/Skeleton';
import { formatListTime } from '../../lib/format';
import styles from './ListPanel.module.css';

function Preview({ lastMessage, typing }) {
    if (typing) return <span className={styles.typing}>typing…</span>;
    if (!lastMessage) return <span>Say hi 👋</span>;
    if (lastMessage.isDeleted) return <em>Message deleted</em>;
    return <span>{lastMessage.fromMe ? 'You: ' : ''}{lastMessage.content}</span>;
}

function ContactRow({ contact, isActive, typing, presence, onOpen }) {
    const online = presence?.isOnline ?? contact.user.isOnline;
    const name = contact.user.displayName || contact.user.username;
    return (
        <li>
            <button className={`${styles.row} ${isActive ? styles.active : ''}`} onClick={onOpen}>
                <Avatar src={contact.user.avatar} name={name} size={48} online={online} />
                <span className={styles.body}>
                    <span className={styles.top}>
                        <span className={styles.name}>{name}</span>
                        <span className={styles.time}>{formatListTime(contact.lastMessage?.createdAt)}</span>
                    </span>
                    <span className={styles.bottom}>
                        <span className={styles.preview}><Preview lastMessage={contact.lastMessage} typing={typing} /></span>
                        {contact.unreadCount > 0 && <span className={styles.unread}>{contact.unreadCount}</span>}
                    </span>
                </span>
            </button>
        </li>
    );
}

function Empty({ title, children }) {
    return (
        <div className={styles.empty}>
            <p className={styles.emptyTitle}>{title}</p>
            <p>{children}</p>
        </div>
    );
}

/** Friends made in stranger chat, most recent conversation first */
export default function ListPanel() {
    const chat = useChat();

    function renderFriends() {
        if (!chat.contacts) return <SkeletonRows />;
        if (!chat.contacts.length) {
            return (
                <Empty title="No friends yet">
                    Meet someone in Chat and tap Add friend. If they accept, they show up here.
                </Empty>
            );
        }
        return (
            <ul className={styles.list}>
                {chat.contacts.map(contact => (
                    <ContactRow
                        key={contact.user._id}
                        contact={contact}
                        isActive={chat.activeKey === privateKey(contact.user._id)}
                        typing={Boolean(chat.typing[privateKey(contact.user._id)])}
                        presence={chat.presence[contact.user._id]}
                        onOpen={() => chat.openChat({ type: 'private', user: contact.user })}
                    />
                ))}
            </ul>
        );
    }

    return (
        <aside className={styles.panel} data-pane="list">
            <header className={styles.header}>
                <h1>Friends</h1>
            </header>
            <div className={styles.scroll}>{renderFriends()}</div>
        </aside>
    );
}
