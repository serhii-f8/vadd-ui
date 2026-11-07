import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const packages = path('../../packages/')
const react18 = `${packages}ui-react/react18/node_modules/`

export type ReactLine = '18' | '19'

const cached = new Map<ReactLine, string>()

/** `vui-view.ts` as one IIFE, on React 19 from `ui-react` or React 18 from its fixture. */
export function viewBundle(react: ReactLine): string {
  const hit = cached.get(react)
  if (hit !== undefined) return hit
  const alias: Record<string, string> = {
    '@vadd/ui-spec': `${packages}ui-spec/src/index.ts`,
    '@vadd/ui-render': `${packages}ui-render/src/index.ts`,
  }
  if (react === '18') {
    alias.react = `${react18}react`
    alias['react-dom'] = `${react18}react-dom`
  }
  const { outputFiles } = buildSync({
    entryPoints: [path('./vui-view.ts')],
    alias,
    // React 19 resolves from `ui-react`, where it is a dev dependency.
    nodePaths: [`${packages}ui-react/node_modules`],
    define: { 'process.env.NODE_ENV': '"production"', __VUI_VERSION__: '"0.0.0"' },
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    write: false,
  })
  const text = (outputFiles[0] as { text: string }).text
  cached.set(react, text)
  return text
}

/** VADD's shadcn tokens, as `packages/web/src/index.css` declares them (read, not copied in). */
export const DASHBOARD_TOKENS = `
:root{--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--card:oklch(1 0 0);--card-foreground:oklch(0.145 0 0);--primary:oklch(0.205 0 0);--primary-foreground:oklch(0.985 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0);--accent:oklch(0.97 0 0);--destructive:oklch(0.577 0.245 27.325);--border:oklch(0.922 0 0);--radius:0.625rem}
.dark{--background:oklch(0.145 0 0);--foreground:oklch(0.985 0 0);--card:oklch(0.205 0 0);--card-foreground:oklch(0.985 0 0);--primary:oklch(0.922 0 0);--primary-foreground:oklch(0.205 0 0);--muted:oklch(0.269 0 0);--muted-foreground:oklch(0.708 0 0);--accent:oklch(0.269 0 0);--destructive:oklch(0.704 0.191 22.216);--border:oklch(1 0 0 / 10%)}
body{margin:0;background:var(--background);color:var(--foreground);font:14px/1.5 system-ui,sans-serif}
.dash-top{padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600}
.dash-main{padding:16px}
`

/**
 * Rules a dashboard might hold that would wreck a visual if they reached it: element and
 * class selectors, `!important` included. None may match inside the shadow root.
 */
export const HOSTILE_CSS = `
h1,h2,h3,p,span,table,td,th,button,li,pre,code,section,article{color:rgb(255,0,0)!important;padding:13px!important;border:3px solid lime!important;font-weight:900!important;background:yellow!important;letter-spacing:4px!important;text-transform:uppercase!important}
.vui-root,.vui-card,.vui-table,.vui-stats,.vui-checks,.vui-callout{display:none!important}
svg *{fill:red!important;stroke:red!important}
[data-vui-theme]{opacity:.2!important}
`

/** Light-DOM elements wearing vadd-ui's class names, which its stylesheet must not reach. */
export const DECOY =
  '<div class="vui-root" id="decoy"><div class="vui-card vui-callout" id="decoy-card">decoy</div><h2 id="decoy-h2">decoy</h2></div>'

export interface PageOptions {
  react: ReactLine
  hostile?: boolean
  decoy?: boolean
  dark?: boolean
}

export function dashboardPage({
  react,
  hostile = false,
  decoy = false,
  dark = false,
}: PageOptions) {
  const style = DASHBOARD_TOKENS + (hostile ? HOSTILE_CSS : '')
  return `<!doctype html><html${dark ? ' class="dark"' : ''}><head><meta charset="utf-8"><style>${style}</style></head><body><div class="dash-top">VADD · Objective #14</div><main class="dash-main">${decoy ? DECOY : ''}<div id="mount"></div></main><script>${viewBundle(react)}</script></body></html>`
}
