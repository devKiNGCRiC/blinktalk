// Theme presets. The colors live in styles/themes.css under [data-theme="<id>"].
export const THEMES = [
    { id: 'midnight', name: 'Midnight Neon', dark: true, swatch: ['#0b0b12', '#a78bfa', '#67e8f9'] },
    { id: 'sunset', name: 'Sunset', dark: true, swatch: ['#1a0f1f', '#fb923c', '#f472b6'] },
    { id: 'light', name: 'Clean Light', dark: false, swatch: ['#f6f7fb', '#4338ca', '#4f46e5'] },
    { id: 'matcha', name: 'Matcha', dark: false, swatch: ['#f3f6ef', '#276749', '#0f766e'] },
    { id: 'y2k', name: 'Y2K Pink', dark: false, swatch: ['#f4efff', '#ff5fb8', '#7cc8ff'] }
];

export const DEFAULT_THEME = 'midnight';

export function isValidTheme(id) {
    return THEMES.some(theme => theme.id === id);
}

export function isDarkTheme(id) {
    return THEMES.find(theme => theme.id === id)?.dark ?? true;
}

/**
 * Pick the theme to show on first load.
 * Saved choice wins; otherwise follow the OS light/dark setting.
 * (index.html has an inline copy of this logic to avoid a flash on load.)
 */
export function resolveInitialTheme(storedTheme, prefersLight) {
    if (isValidTheme(storedTheme)) return storedTheme;
    return prefersLight ? 'light' : DEFAULT_THEME;
}
