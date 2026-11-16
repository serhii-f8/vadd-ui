// Everything resolves through `var()`, so a theme switch needs no script (§8.2). Nothing here
// sizes to the viewport or leaves the root's own box (§8.4).

const SPACING = (a: number, b: number, c: number, d: number) =>
  `--vui-space-1:${a}px;--vui-space-2:${b}px;--vui-space-3:${c}px;--vui-space-4:${d}px;`

const TONES: Record<string, string[]> = {
  ok: ['var(--vui-ok)', 'var(--vui-ok-text)'],
  warn: ['var(--vui-warn)', 'var(--vui-warn-text)'],
  err: ['var(--vui-err)', 'var(--vui-err-text)'],
  info: ['var(--vui-info)', 'var(--vui-info-text)'],
  muted: ['var(--vui-muted-fg)', 'var(--vui-muted-fg)'],
  // `--vui-accent` is a background: as a line it would vanish on the surface.
  accent: ['var(--vui-accent)', 'var(--vui-accent-fg)', 'var(--vui-primary)'],
  default: ['var(--vui-border)', 'var(--vui-surface-fg)'],
}

const toneCss = Object.entries(TONES)
  .map(
    ([name, [tone, text, line = tone]]) =>
      `.vui-tone-${name}{--vui-tone:${tone};--vui-tone-text:${text};--vui-tone-line:${line}}`,
  )
  .join('')

export const baseCss = `
.vui-root{${SPACING(4, 8, 12, 16)}display:block;box-sizing:border-box;width:-webkit-fill-available;width:-moz-available;width:stretch;min-width:0;color:var(--vui-fg);font-family:var(--vui-font),sans-serif;line-height:1.5;overflow-wrap:anywhere}
.vui-root[data-vui-density="comfortable"]{${SPACING(6, 12, 18, 24)}}
.vui-root *,.vui-root *::before,.vui-root *::after{box-sizing:border-box}
.vui-doc{display:flex;flex-direction:column;gap:var(--vui-space-4);min-width:0}
.vui-header{display:flex;flex-direction:column;gap:var(--vui-space-1)}
.vui-title{margin:0;font-size:1.25em;font-weight:600;line-height:1.3}
.vui-subtitle{margin:0;color:var(--vui-muted-fg);font-size:.86em}
.vui-node,.vui-fold-body,.vui-md,.vui-tabs,.vui-tab-panel{display:flex;flex-direction:column;gap:var(--vui-space-2);min-width:0}
.vui-node-title{margin:0;font-size:1.05em;font-weight:600;line-height:1.35}
.vui-note{margin:0;color:var(--vui-muted-fg);font-size:.86em}
.vui-link{color:var(--vui-info-text);text-decoration:underline;text-underline-offset:2px}
.vui-code{padding:.1em .3em;border-radius:calc(var(--vui-radius) * .5);background:var(--vui-muted);color:var(--vui-surface-fg);font-family:var(--vui-mono),monospace;font-size:.92em}
.vui-path-base{font-weight:600}
${toneCss}
.vui-root span[class*="vui-tone-"]{color:var(--vui-tone-text)}
.vui-status{display:inline-flex;align-items:baseline;gap:.3em;padding:0 .45em;border-radius:999px;background:color-mix(in srgb,var(--vui-tone-line) 12%,var(--vui-surface));font-size:.86em;font-weight:500;white-space:nowrap}
.vui-root .vui-status.vui-tone-muted{color:var(--vui-surface-fg)}
.vui-status-icon{font-size:.95em}
.vui-card{display:flex;flex-direction:column;gap:var(--vui-space-2);min-width:0;padding:var(--vui-space-3);border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.vui-card-title{margin:0;font-weight:600}
.vui-card-detail{margin:0;color:var(--vui-muted-fg);font-size:.86em}
.vui-card-placeholder{background:var(--vui-muted);border-style:dashed}
.vui-card-placeholder .vui-card-detail,.vui-card-placeholder .vui-card-title{color:var(--vui-surface-fg)}
.vui-card-error{border-color:var(--vui-err);background:color-mix(in srgb,var(--vui-err) 12%,var(--vui-surface))}
.vui-card-error .vui-card-title{color:var(--vui-err-text)}
.vui-card-error .vui-card-detail{color:var(--vui-surface-fg)}
.vui-pre{margin:0;max-height:320px;overflow:auto;padding:var(--vui-space-2);border-radius:calc(var(--vui-radius) * .5);background:var(--vui-surface);color:var(--vui-surface-fg);font-family:var(--vui-mono),monospace;font-size:.86em;white-space:pre-wrap}
.vui-button{appearance:none;padding:var(--vui-space-1) var(--vui-space-2);border:1px solid var(--vui-border);border-radius:calc(var(--vui-radius) * .6);background:transparent;color:inherit;font:inherit;cursor:pointer}
.vui-button:hover{background:var(--vui-accent);color:var(--vui-accent-fg)}
.vui-fold-toggle{appearance:none;display:flex;align-items:baseline;gap:var(--vui-space-1);width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.vui-fold-icon{display:inline-block;color:var(--vui-muted-fg);font-size:.8em;transition:transform 120ms ease-out}
.vui-fold-toggle[aria-expanded="true"] .vui-fold-icon{transform:rotate(90deg)}
.vui-fold-body[hidden]{display:none}
.vui-fold-opening{animation:vui-reveal 120ms ease-out}
@keyframes vui-reveal{from{opacity:0}to{opacity:1}}
.vui-root :focus-visible{outline:2px solid var(--vui-info);outline-offset:2px}
.vui-diagnostics{display:flex;flex-direction:column;align-items:flex-start;gap:var(--vui-space-2);min-width:0}
.vui-diagnostics-badge{display:inline-flex;gap:var(--vui-space-2);font-size:.86em}
.vui-diagnostics-panel{display:flex;flex-direction:column;gap:var(--vui-space-1);width:100%;margin:0;padding:var(--vui-space-2);list-style:none;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg);font-size:.86em}
.vui-diagnostics-panel[hidden]{display:none}
.vui-diagnostic{display:flex;flex-wrap:wrap;gap:0 var(--vui-space-2)}
.vui-diagnostic-path{color:var(--vui-muted-fg);font-family:var(--vui-mono),monospace}
.vui-diagnostic-hint{width:100%;color:var(--vui-muted-fg)}
.vui-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion: reduce){.vui-root *{animation:none!important;transition:none!important}}
`
  .trim()
  .replace(/\n/g, '')
