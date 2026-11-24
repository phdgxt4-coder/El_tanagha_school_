const KEY = 'tanagha-theme';
export type Theme = 'light' | 'dark';
export function getTheme(): Theme { return (localStorage.getItem(KEY) as Theme | null) ?? 'light'; }
export function applyTheme(theme: Theme) { document.documentElement.dataset.theme = theme; localStorage.setItem(KEY, theme); }
export function toggleTheme(): Theme { const next = getTheme() === 'dark' ? 'light' : 'dark'; applyTheme(next); return next; }
applyTheme(getTheme());
