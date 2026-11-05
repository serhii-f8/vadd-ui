export interface Token {
  name: string
  /** The host token it reads. Null for a token that is local to vadd-ui. */
  source: string | null
  light: string
  dark: string
}

const token = (
  name: string,
  source: string | null,
  light: string,
  dark: string = light,
): Token => ({ name, source, light, dark })

/** §8.1. */
export const TOKENS: readonly Token[] = [
  token('--vui-bg', '--background', '#ffffff', '#0a0a0a'),
  token('--vui-fg', '--foreground', '#171717', '#ededed'),
  token('--vui-surface', '--card', '#ffffff', '#141414'),
  token('--vui-surface-fg', '--card-foreground', '#171717', '#ededed'),
  token('--vui-muted', '--muted', '#f5f5f5', '#1f1f1f'),
  token('--vui-muted-fg', '--muted-foreground', '#737373', '#a3a3a3'),
  token('--vui-border', '--border', '#e5e5e5', '#2a2a2a'),
  token('--vui-accent', '--accent', '#f5f5f5', '#262626'),
  token('--vui-accent-fg', '--accent-foreground', '#171717', '#ededed'),
  token('--vui-primary', '--primary', '#171717', '#ededed'),
  token('--vui-primary-fg', '--primary-foreground', '#fafafa', '#171717'),
  token('--vui-err', '--destructive', '#dc2626', '#f87171'),
  token('--vui-ok', null, '#16a34a', '#4ade80'),
  token('--vui-warn', null, '#d97706', '#fbbf24'),
  token('--vui-info', null, '#2563eb', '#60a5fa'),
  token('--vui-chart-1', '--chart-1', '#2563eb', '#60a5fa'),
  token('--vui-chart-2', '--chart-2', '#16a34a', '#4ade80'),
  token('--vui-chart-3', '--chart-3', '#d97706', '#fbbf24'),
  token('--vui-chart-4', '--chart-4', '#9333ea', '#c084fc'),
  token('--vui-chart-5', '--chart-5', '#db2777', '#f472b6'),
  token('--vui-radius', '--radius', '8px'),
  token('--vui-font', '--font-sans', 'system-ui'),
  token('--vui-mono', '--font-mono', 'ui-monospace'),
]

/**
 * How much tone is left in tone-colored text. §8.1's `#16a34a` and `#d97706` reach only
 * 3.3:1 on white, so text mixes them toward the foreground to pass §15.2 (VD-059).
 */
export const TONE_TEXT_SHARE = 0.7

function declarations(scheme: 'light' | 'dark'): string {
  return TOKENS.map(({ name, source, [scheme]: fallback }) =>
    source === null ? `${name}:${fallback};` : `${name}:var(${source},${fallback});`,
  ).join('')
}

const toneText = ['ok', 'warn', 'err', 'info']
  .map(
    (tone) =>
      `--vui-${tone}-text:color-mix(in srgb,var(--vui-${tone}) ${TONE_TEXT_SHARE * 100}%,var(--vui-surface-fg));`,
  )
  .join('')

const LIGHT = `color-scheme:light;${declarations('light')}`
const DARK = `color-scheme:dark;${declarations('dark')}`

// VD-007 and VD-058. The repeated class outranks `:root.dark .vui-root`, and `:where` keeps
// the OS rule below it. Orca's live toggle leaves `class=""` behind, which means light.
const OS_ROOT = ':root:where(:not(.dark):not(.light):not([class=""]))'
const FOLLOW_OS = `${OS_ROOT} .vui-root`
const FORCED = '.vui-root.vui-root.vui-root[data-vui-theme='

const paint = (scheme: 'light' | 'dark') =>
  `{color-scheme:${scheme};background:var(--background,${TOKENS[0]?.[scheme]})}`

/**
 * The page behind a boot-script document: without it a dark OS gets light text on a white
 * canvas (VD-073). Zero specificity, so a host's own rule wins. `stylesheet` leaves it out,
 * because a host that mounts `render` owns its page.
 */
export const pageCss = [
  `:where(:root)${paint('light')}`,
  `:where(:root.dark)${paint('dark')}`,
  `@media (prefers-color-scheme: dark){:where(${OS_ROOT})${paint('dark')}}`,
].join('')

export const tokenCss = [
  `.vui-root{${LIGHT}${toneText}}`,
  `:root.dark .vui-root{${DARK}}`,
  `@media (prefers-color-scheme: dark){${FOLLOW_OS}{${DARK}}}`,
  `${FORCED}"dark"]{${DARK}}`,
  `${FORCED}"light"]{${LIGHT}}`,
].join('')
