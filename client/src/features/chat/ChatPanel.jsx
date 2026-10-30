import { useState } from 'react';
import { ArrowLeft, UserMinus } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import Avatar from '../../components/Avatar';
import Composer from '../../components/Composer';
import Modal from '../../components/Modal';
import MessageList from './MessageList';
import MessageActions from './MessageActions';
import { formatLastSeen } from '../../lib/format';
import { LogoMark } from '../../components/Logo';
import styles from './ChatPanel.module.css';

function ChatHeader({ onUnfriend }) {
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
            {active.type === 'private' && (
                <button className={`icon-btn ${styles.headerEnd}`} onClick={onUnfriend} aria-label="Unfriend" title="Unfriend">
                    <UserMinus size={20} />
                </button>
            )}
        </header>
    );
}

function EmptyChat() {
    return (
        <div className={styles.emptyState}>
            <LogoMark size={72} />
            <h2>Pick a friend to keep talking</h2>
            <p>Friends you make in stranger chat show up on the left. Tap one to pick up where you left off.</p>
        </div>
    );
}

export default function ChatPanel() {
    const chat = useChat();
    const [actionsFor, setActionsFor] = useState(null);
    const [confirmUnfriend, setConfirmUnfriend] = useState(false);

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
            <ChatHeader onUnfriend={() => setConfirmUnfriend(true)} />
            <MessageList
                key={chat.activeKey}
                messages={messages}
                myId={chat.myId}
                isRoom={isRoom}
                onReply={chat.setReplyTo}
                onActions={setActionsFor}
                onRetry={chat.retryMessage}
                onReact={isRoom ? undefined : chat.react}
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
                    onReact={isRoom ? undefined : emoji => chat.react(actionsFor, emoji)}
                />
            )}
            {confirmUnfriend && !isRoom && (
                <Modal title="Unfriend?" onClose={() => setConfirmUnfriend(false)} size="sm">
                    <p className={styles.confirmText}>
                        You and {chat.active.user.displayName || chat.active.user.username} won’t be able to message each other.
                        Your chat history stays, but you’d need to meet again in stranger chat to be friends.
                    </p>
                    <div className={styles.confirmActions}>
                        <button className="btn btn-ghost" onClick={() => setConfirmUnfriend(false)}>Cancel</button>
                        <button
                            className="btn btn-danger"
                            onClick={() => { setConfirmUnfriend(false); chat.unfriend(chat.active.user); }}
                        >
                            Unfriend
                        </button>
                    </div>
                </Modal>
            )}
        </main>
    );
}
