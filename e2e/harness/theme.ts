import type { NativeChatVisualTheme } from './orca/src/shared/native-chat/visuals/native-chat-visual-shell.js'

// Real token values from Orca's `src/renderer/src/assets/main.css` at the commit named in
// `orca/README.md`. Orca resolves `--chart-*` to Tailwind's blue scale, written out here.

const FONTS = {
  '--font-sans': "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--font-mono':
    "'SF Mono', SFMono-Regular, ui-monospace, 'Cascadia Code', Menlo, Consolas, 'Liberation Mono', monospace",
  '--radius': '0.625rem',
}

const CHARTS = {
  '--chart-1': 'oklch(80.9% 0.105 251.813)',
  '--chart-2': 'oklch(62.3% 0.214 259.815)',
  '--chart-3': 'oklch(54.6% 0.245 262.881)',
  '--chart-4': 'oklch(48.8% 0.243 264.376)',
  '--chart-5': 'oklch(42.4% 0.199 265.638)',
}

export const ORCA_LIGHT: NativeChatVisualTheme = {
  colorScheme: 'light',
  tokens: {
    '--background': '#fff',
    '--foreground': '#0a0a0a',
    '--card': '#fff',
    '--card-foreground': '#0a0a0a',
    '--popover': '#fff',
    '--popover-foreground': '#0a0a0a',
    '--primary': '#171717',
    '--primary-foreground': '#fafafa',
    '--secondary': '#f5f5f5',
    '--secondary-foreground': '#171717',
    '--muted': '#f5f5f5',
    '--muted-foreground': '#696969',
    '--accent': '#f5f5f5',
    '--accent-foreground': '#171717',
    '--destructive': '#e40014',
    '--destructive-foreground': '#fff',
    '--border': '#e5e5e5',
    '--input': '#e5e5e5',
    '--ring': '#a1a1a1',
    ...FONTS,
    ...CHARTS,
  },
}

export const ORCA_DARK: NativeChatVisualTheme = {
  colorScheme: 'dark',
  tokens: {
    '--background': '#0a0a0a',
    '--foreground': '#f0f0f0',
    '--card': '#171717',
    '--card-foreground': '#f0f0f0',
    '--popover': '#171717',
    '--popover-foreground': '#f0f0f0',
    '--primary': '#e5e5e5',
    '--primary-foreground': '#171717',
    '--secondary': '#262626',
    '--secondary-foreground': '#f0f0f0',
    '--muted': '#262626',
    '--muted-foreground': '#acacac',
    '--accent': '#404040',
    '--accent-foreground': '#f0f0f0',
    '--destructive': '#ff6568',
    '--destructive-foreground': '#450a0a',
    '--border': 'rgb(255 255 255 / 0.07)',
    '--input': 'rgb(255 255 255 / 0.15)',
    '--ring': '#737373',
    ...FONTS,
    ...CHARTS,
  },
}

export const THEMES = { light: ORCA_LIGHT, dark: ORCA_DARK }
export type Scheme = keyof typeof THEMES
