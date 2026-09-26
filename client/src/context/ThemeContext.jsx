import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { isValidTheme, resolveInitialTheme, isDarkTheme } from '../lib/theme';

const ThemeContext = createContext(null);

function readInitialTheme() {
    // index.html already set data-theme before React loaded
    const current = document.documentElement.getAttribute('data-theme');
    if (isValidTheme(current)) return current;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    let stored = null;
    try { stored = localStorage.getItem('theme'); } catch { /* storage blocked */ }
    return resolveInitialTheme(stored, prefersLight);
}

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(readInitialTheme);

    // Apply a theme on this device (the settings panel also saves it to the profile)
    const setTheme = useCallback(id => {
        if (!isValidTheme(id)) return;
        document.documentElement.setAttribute('data-theme', id);
        try { localStorage.setItem('theme', id); } catch { /* storage blocked */ }
        setThemeState(id);
    }, []);

    const value = useMemo(() => ({ theme, setTheme, isDark: isDarkTheme(theme) }), [theme, setTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}
