import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import Avatar from '../../components/Avatar';
import Composer from '../../components/Composer';
import MessageList from './MessageList';
import MessageActions from './MessageActions';
import { formatLastSeen } from '../../lib/format';
import { LogoMark } from '../../components/Logo';
import styles from './ChatPanel.module.css';

function ChatHeader() {
    const chat = useChat();
    const { active } = chat;
    const typing = chat.typing[chat.activeKey];

    let name;
    let avatar;
    let status;
    let online;

    if (active.type === 'private') {
        const { user } = active;
        const presence = chat.presence[user._id] || {};
        online = presence.isOnline ?? user.isOnline;
        name = user.displayName || user.username;
        avatar = user.avatar;
        status = typing ? 'typing…' : online ? 'online' : formatLastSeen(presence.lastSeen ?? user.lastSeen);
    } else {
        const { room } = active;
        const current = chat.rooms?.find(r => r._id === room._id) || room;
        name = room.name;
        avatar = room.avatar;
        const members = current.stats?.memberCount ?? current.members?.length ?? 0;
        status = typing ? `${typing} is typing…` : `${members} ${members === 1 ? 'member' : 'members'}`;
    }

    return (
        <header className={styles.header}>
            <button className={`icon-btn ${styles.back}`} onClick={chat.closeChat} aria-label="Back to chats">
                <ArrowLeft size={22} />
            </button>
            <Avatar src={avatar} name={name} size={42} online={active.type === 'private' ? online : undefined} />
            <div className={styles.title}>
                <h2>{name}</h2>
                <p className={`${styles.status} ${typing ? styles.typing : ''} ${online && !typing ? styles.online : ''}`} aria-live="polite">
                    {status}
                </p>
            </div>
        </header>
    );
}

function EmptyChat() {
    return (
        <div className={styles.emptyState}>
            <LogoMark size={72} />
            <h2>Pick a chat to start talking</h2>
            <p>Your conversations show up on the left. Search for a friend by name, or hop into a room.</p>
        </div>
    );
}

export default function ChatPanel() {
    const chat = useChat();
    const [actionsFor, setActionsFor] = useState(null);

    if (!chat.active) {
        return (
            <main className={styles.panel} data-pane="chat">
                <EmptyChat />
            </main>
        );
    }

    const messages = chat.messages[chat.activeKey];
    const isRoom = chat.active.type === 'room';

    return (
        <main className={styles.panel} data-pane="chat">
            <ChatHeader />
            <MessageList
                key={chat.activeKey}
                messages={messages}
                myId={chat.myId}
                isRoom={isRoom}
                onReply={chat.setReplyTo}
                onActions={setActionsFor}
                onRetry={chat.retryMessage}
                emptyText={isRoom
                    ? 'No messages in this room yet. Start the conversation.'
                    : `This is the start of your chat with ${chat.active.user.displayName || chat.active.user.username}. Say hi 👋`}
            />
            <Composer
                focusKey={chat.activeKey}
                onSend={text => chat.sendMessage(text)}
                onTyping={chat.emitTyping}
                replyTo={chat.replyTo}
                onCancelReply={() => chat.setReplyTo(null)}
                placeholder={isRoom ? `Message ${chat.active.room.name}` : 'Message'}
            />
            {actionsFor && (
                <MessageActions
                    message={actionsFor}
                    isMine={actionsFor.sender?._id === chat.myId}
                    onClose={() => setActionsFor(null)}
                    onReply={() => chat.setReplyTo(actionsFor)}
                    onDelete={scope => chat.deleteMessage(actionsFor, scope)}
                />
            )}
        </main>
    );
}
