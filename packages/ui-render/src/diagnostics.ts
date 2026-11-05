import type { Diagnostic, Severity } from '@vadd/ui-spec'
import { el } from './el.js'
import { statusBadge } from './inline.js'

export type DiagnosticsMode = 'hidden' | 'badge' | 'panel'

export const MAX_SHOWN = 50
const OPEN = 'open'

const STATUS_OF = { error: 'fail', warn: 'warn' } as const

function counted(diagnostics: Diagnostic[], severity: Severity, noun: string): string | undefined {
  const count = diagnostics.filter((item) => item.severity === severity).length
  if (count === 0) return undefined
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function entry({ severity, path, code, message, hint }: Diagnostic): HTMLElement {
  return el('li', { class: 'vui-diagnostic' }, [
    statusBadge(STATUS_OF[severity as keyof typeof STATUS_OF]),
    el('span', { class: 'vui-diagnostic-path' }, path === '' ? '/' : path),
    el('code', { class: 'vui-code' }, code),
    el('span', {}, message),
    hint === undefined ? null : el('span', { class: 'vui-diagnostic-hint' }, hint),
  ])
}

function panel(shown: Diagnostic[], hidden: boolean): HTMLElement {
  const extra = shown.length - MAX_SHOWN
  return el('ul', { class: 'vui-diagnostics-panel', hidden }, [
    ...shown.slice(0, MAX_SHOWN).map(entry),
    extra > 0 ? el('li', {}, `and ${extra} more`) : null,
  ])
}

/** §13.3: `error` and `warn` show, `info` stays silent. Null when there is nothing to show. */
export function diagnosticsView(
  diagnostics: Diagnostic[],
  mode: DiagnosticsMode,
  state: Map<string, unknown>,
): HTMLElement | null {
  const shown = diagnostics.filter((item) => item.severity !== 'info')
  if (mode === 'hidden' || shown.length === 0) return null
  if (mode === 'panel') return el('div', { class: 'vui-diagnostics' }, panel(shown, false))

  const open = state.get(OPEN) === true
  const list = panel(shown, !open)
  const summary = [counted(shown, 'error', 'error'), counted(shown, 'warn', 'warning')]
  const button = el(
    'button',
    {
      class: 'vui-button vui-diagnostics-badge',
      type: 'button',
      'aria-expanded': String(open),
      on: {
        click: () => {
          const opening = list.hidden
          list.hidden = !opening
          button.setAttribute('aria-expanded', String(opening))
          state.set(OPEN, opening)
        },
      },
    },
    summary.filter((item) => item !== undefined).join(', '),
  )
  return el('div', { class: 'vui-diagnostics' }, [button, list])
}
