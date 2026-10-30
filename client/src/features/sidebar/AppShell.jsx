import { useState } from 'react';
import { MessageCircle, Ghost, Settings, LogIn } from 'lucide-react';
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
    { id: 'chat', label: 'Chat', icon: Ghost },
    { id: 'friends', label: 'Friends', icon: MessageCircle },
    { id: 'settings', label: 'Settings', icon: Settings }
];

const GUEST_TABS = [
    { id: 'chat', label: 'Chat', icon: Ghost },
    { id: 'settings', label: 'Theme', icon: Settings }
];

function Nav({ tabs, tab, setTab, unread, user, onSignIn }) {
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
                                {id === 'friends' && unread > 0 && (
                                    <span className={styles.badge} aria-label={`${unread} unread`}>
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </span>
                            <span className={styles.navLabel}>{label}</span>
                        </button>
                    </li>
                ))}
                {onSignIn && (
                    <li>
                        <button className={styles.navItem} onClick={onSignIn}>
                            <span className={styles.navIcon}><LogIn size={22} /></span>
                            <span className={styles.navLabel}>Sign in</span>
                        </button>
                    </li>
                )}
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
    const { active, totalUnread, openChat } = useChat();
    const [tab, setTab] = useState('chat');

    const inFriends = tab === 'friends';

    // "Message" on a new friend in stranger chat opens their chat here
    const openFriend = friend => {
        openChat({ type: 'private', user: friend });
        setTab('friends');
    };

    return (
        <div className={`${styles.shell} ${inFriends && active ? styles.chatOpen : ''}`}>
            <Nav tabs={USER_TABS} tab={tab} setTab={setTab} unread={totalUnread} user={user} />

            {inFriends && (
                <>
                    <ListPanel />
                    <ChatPanel />
                </>
            )}

            {/* Kept mounted so a stranger chat survives switching tabs */}
            <div className={styles.full} hidden={tab !== 'chat'}>
                <StrangerPanel active={tab === 'chat'} onOpenFriend={openFriend} />
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
    const { openAuth } = useAuth();
    const [tab, setTab] = useState('chat');
    return (
        <div className={styles.shell}>
            <Nav tabs={GUEST_TABS} tab={tab} setTab={setTab} onSignIn={() => openAuth('login')} />
            <div className={styles.full} hidden={tab !== 'chat'}>
                <StrangerPanel active={tab === 'chat'} guest />
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
