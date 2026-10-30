import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ChatProvider } from './context/ChatContext';
import AuthScreen from './features/auth/AuthScreen';
import AppShell from './features/sidebar/AppShell';
import { LogoMark } from './components/Logo';
import styles from './App.module.css';

function Screens() {
    const { status, authOpen } = useAuth();

    if (status === 'loading') {
        return (
            <div className={styles.splash} aria-label="Loading BlinkTalk">
                <LogoMark size={56} />
            </div>
        );
    }

    // Everyone lands on stranger chat; log in / sign up opens over the app
    return (
        <SocketProvider>
            {status === 'user' ? (
                <ChatProvider>
                    <AppShell />
                </ChatProvider>
            ) : (
                <AppShell guest />
            )}
            {authOpen && <AuthScreen />}
        </SocketProvider>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <AuthProvider>
                    <Screens />
                </AuthProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}
