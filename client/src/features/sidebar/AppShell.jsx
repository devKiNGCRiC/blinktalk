import { useState } from 'react';
import { MessageCircle, Users, Ghost, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../../components/Avatar';
import { LogoMark } from '../../components/Logo';
import ListPanel from './ListPanel';
import ChatPanel from '../chat/ChatPanel';
import StrangerPanel from '../stranger/StrangerPanel';
import SettingsPanel from '../settings/SettingsPanel';
import styles from './AppShell.module.css';

const USER_TABS = [
    { id: 'chats', label: 'Chats', icon: MessageCircle },
    { id: 'rooms', label: 'Rooms', icon: Users },
    { id: 'stranger', label: 'Stranger', icon: Ghost },
    { id: 'settings', label: 'Settings', icon: Settings }
];

const GUEST_TABS = [
    { id: 'stranger', label: 'Stranger', icon: Ghost },
    { id: 'settings', label: 'Theme', icon: Settings }
];

function Nav({ tabs, tab, setTab, unread, user }) {
    return (
        <nav className={styles.nav} aria-label="Main">
            <div className={styles.navTop}>
                {user ? (
                    <button className={styles.me} onClick={() => setTab('settings')} aria-label="Your profile">
                        <Avatar src={user.avatar} name={user.displayName || user.username} size={40} />
                    </button>
                ) : (
                    <span className={styles.me}><LogoMark size={36} /></span>
                )}
            </div>
            <ul className={styles.navList}>
                {tabs.map(({ id, label, icon: Icon }) => (
                    <li key={id}>
                        <button
                            className={`${styles.navItem} ${tab === id ? styles.navActive : ''}`}
                            onClick={() => setTab(id)}
                            aria-current={tab === id ? 'page' : undefined}
                        >
                            <span className={styles.navIcon}>
                                <Icon size={22} />
                                {id === 'chats' && unread > 0 && (
                                    <span className={styles.badge} aria-label={`${unread} unread`}>
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </span>
                            <span className={styles.navLabel}>{label}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

function ReconnectBanner() {
    const { reconnecting } = useSocket();
    if (!reconnecting) return null;
    return (
        <div className={styles.banner} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            Reconnecting…
        </div>
    );
}

function UserShell() {
    const { user } = useAuth();
    const { active, totalUnread } = useChat();
    const [tab, setTab] = useState('chats');

    const inChats = tab === 'chats' || tab === 'rooms';

    return (
        <div className={`${styles.shell} ${inChats && active ? styles.chatOpen : ''}`}>
            <Nav tabs={USER_TABS} tab={tab} setTab={setTab} unread={totalUnread} user={user} />

            {inChats && (
                <>
                    <ListPanel tab={tab} />
                    <ChatPanel />
                </>
            )}

            {/* Kept mounted so a stranger chat survives switching tabs */}
            <div className={styles.full} hidden={tab !== 'stranger'}>
                <StrangerPanel active={tab === 'stranger'} />
            </div>

            {tab === 'settings' && (
                <div className={styles.full}>
                    <SettingsPanel />
                </div>
            )}

            <ReconnectBanner />
        </div>
    );
}

function GuestShell() {
    const [tab, setTab] = useState('stranger');
    return (
        <div className={styles.shell}>
            <Nav tabs={GUEST_TABS} tab={tab} setTab={setTab} />
            <div className={styles.full} hidden={tab !== 'stranger'}>
                <StrangerPanel active={tab === 'stranger'} guest />
            </div>
            {tab === 'settings' && (
                <div className={styles.full}>
                    <SettingsPanel guest />
                </div>
            )}
            <ReconnectBanner />
        </div>
    );
}

export default function AppShell({ guest }) {
    return guest ? <GuestShell /> : <UserShell />;
}
