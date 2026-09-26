import { useEffect, useState } from 'react';
import { Search, Plus, X, Lock } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { privateKey, roomKey } from '../../context/chatReducer';
import * as usersApi from '../../api/users';
import * as roomsApi from '../../api/rooms';
import Avatar from '../../components/Avatar';
import SkeletonRows from '../../components/Skeleton';
import NewRoomModal from '../rooms/NewRoomModal';
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

const memberLabel = count => `${count} ${count === 1 ? 'member' : 'members'}`;

function RoomRow({ room, isActive, typing, onOpen, action }) {
    const last = room.lastMessage;
    let preview = room.description || 'No messages yet';
    if (typing) preview = <span className={styles.typing}>{typing} is typing…</span>;
    else if (last?.isDeleted) preview = <em>Message deleted</em>;
    else if (last && last.type !== 'system') preview = `${last.sender?.displayName || last.sender?.username || 'Someone'}: ${last.content}`;
    else if (last) preview = last.content;

    return (
        <li>
            <button className={`${styles.row} ${isActive ? styles.active : ''}`} onClick={onOpen}>
                <Avatar src={room.avatar} name={room.name} size={48} />
                <span className={styles.body}>
                    <span className={styles.top}>
                        <span className={styles.name}>
                            {room.type === 'private' && <Lock size={13} aria-label="Private room" />}
                            {room.name}
                        </span>
                        <span className={styles.time}>
                            {last ? formatListTime(last.createdAt) : memberLabel(room.stats?.memberCount ?? 0)}
                        </span>
                    </span>
                    <span className={styles.bottom}>
                        <span className={styles.preview}>{preview}</span>
                        {action}
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

/** Debounced search across people and public rooms */
function useSearch(query) {
    const [results, setResults] = useState(null);

    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setResults(null);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const [people, rooms] = await Promise.all([usersApi.searchUsers(q), roomsApi.searchRooms(q)]);
                if (!cancelled) setResults({ people, rooms });
            } catch {
                if (!cancelled) setResults({ people: [], rooms: [] });
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query]);

    return results;
}

export default function ListPanel({ tab }) {
    const chat = useChat();
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const results = useSearch(query);

    // Refresh rooms each time the Rooms tab opens, so rooms other people
    // created since the page loaded show up under "Public rooms to join"
    const { reloadRooms } = chat;
    useEffect(() => {
        if (tab === 'rooms') reloadRooms();
    }, [tab, reloadRooms]);

    const openUser = user => {
        chat.openChat({ type: 'private', user });
        setQuery('');
    };
    const openRoom = room => {
        chat.openChat({ type: 'room', room });
        setQuery('');
    };
    const joinRoom = room => {
        chat.joinAndOpenRoom(room);
        setQuery('');
    };

    const myRoomIds = new Set((chat.rooms || []).map(room => room._id));
    const contactFor = user => chat.contacts?.find(contact => contact.user._id === user._id) || { user };

    function renderSearch() {
        if (!results) return <SkeletonRows count={3} />;
        const { people, rooms } = results;
        if (!people.length && !rooms.length) {
            return <Empty title="No matches">Try a different name, or check the spelling.</Empty>;
        }
        return (
            <>
                {people.length > 0 && (
                    <section>
                        <h3 className={styles.section}>People</h3>
                        <ul className={styles.list}>
                            {people.map(user => (
                                <ContactRow
                                    key={user._id}
                                    contact={contactFor(user)}
                                    presence={chat.presence[user._id]}
                                    onOpen={() => openUser(user)}
                                />
                            ))}
                        </ul>
                    </section>
                )}
                {rooms.length > 0 && (
                    <section>
                        <h3 className={styles.section}>Rooms</h3>
                        <ul className={styles.list}>
                            {rooms.map(room => (
                                <RoomRow
                                    key={room._id}
                                    room={room}
                                    onOpen={() => (myRoomIds.has(room._id) ? openRoom(room) : joinRoom(room))}
                                    action={!myRoomIds.has(room._id) && <span className={styles.join}>Join</span>}
                                />
                            ))}
                        </ul>
                    </section>
                )}
            </>
        );
    }

    function renderChats() {
        if (!chat.contacts) return <SkeletonRows />;
        if (!chat.contacts.length) {
            return (
                <Empty title="No chats yet">
                    Search for someone above to start a conversation, or meet a stranger from the Stranger tab.
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
                        onOpen={() => openUser(contact.user)}
                    />
                ))}
            </ul>
        );
    }

    function renderRooms() {
        if (!chat.rooms) return <SkeletonRows />;
        return (
            <>
                {chat.rooms.length ? (
                    <ul className={styles.list}>
                        {chat.rooms.map(room => (
                            <RoomRow
                                key={room._id}
                                room={room}
                                isActive={chat.activeKey === roomKey(room._id)}
                                typing={chat.typing[roomKey(room._id)]}
                                onOpen={() => openRoom(room)}
                            />
                        ))}
                    </ul>
                ) : (
                    <Empty title="You’re not in any rooms">Create one for your group, or join a public room below.</Empty>
                )}

                {chat.publicRooms.length > 0 && (
                    <section>
                        <h3 className={styles.section}>Public rooms to join</h3>
                        <ul className={styles.list}>
                            {chat.publicRooms.map(room => (
                                <RoomRow
                                    key={room._id}
                                    room={room}
                                    onOpen={() => joinRoom(room)}
                                    action={<span className={styles.join}>Join</span>}
                                />
                            ))}
                        </ul>
                    </section>
                )}
            </>
        );
    }

    return (
        <aside className={styles.panel} data-pane="list">
            <header className={styles.header}>
                <h1>{tab === 'rooms' ? 'Rooms' : 'Chats'}</h1>
                {tab === 'rooms' && (
                    <button className={styles.newRoom} onClick={() => setCreating(true)}>
                        <Plus size={18} />
                        New room
                    </button>
                )}
            </header>

            <div className={styles.search}>
                <Search size={18} aria-hidden="true" />
                <label className="visually-hidden" htmlFor="list-search">Search people and rooms</label>
                <input
                    id="list-search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search people and rooms"
                    autoComplete="off"
                />
                {query && (
                    <button className={styles.clear} onClick={() => setQuery('')} aria-label="Clear search">
                        <X size={16} />
                    </button>
                )}
            </div>

            <div className={styles.scroll}>
                {query.trim() ? renderSearch() : tab === 'rooms' ? renderRooms() : renderChats()}
            </div>

            {creating && <NewRoomModal onClose={() => setCreating(false)} />}
        </aside>
    );
}
