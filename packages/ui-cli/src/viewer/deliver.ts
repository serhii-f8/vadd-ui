import type { Diagnostic, VuiDocument } from '@vadd/ui-spec'
import { readViewerInfo, updateViewerInfo } from '@vadd/ui-viewer'
import { branchOf } from '../git.js'
import { EXIT, noHost, type Outcome } from '../outcome.js'
import { exitCodeOf, type Overrides } from '../pipeline.js'
import { formatDiagnostics, safe } from '../print.js'
import type { System } from '../system.js'
import { customEndpoint, type Posted, postDocument, type Target } from './client.js'
import { ensureViewer, placeOf, type Running } from './lifecycle.js'
import { type Pane, showPane } from './pane.js'

export interface Delivery {
  document: VuiDocument
  diagnostics: Diagnostic[]
  noOpen: boolean
  system: System
}

type Delivered = Extract<Posted, { kind: 'delivered' }>

/** VD-112. Only this host gets them, so `render` and a visual file hold no local path. */
export function viewerOverrides(system: System): Overrides {
  const { workspace } = placeOf(system)
  return { meta: { cwd: system.cwd(), branch: branchOf(workspace) } }
}

function shownLine(document: VuiDocument, seq: number): string {
  const { title } = document
  const name = typeof title === 'string' ? `"${title}"` : 'untitled'
  return safe(`vui: shown ${name} (#${seq}) in viewer`)
}

function refused(posted: Extract<Posted, { kind: 'refused' }>): Outcome {
  const { diagnostics } = posted
  const code = exitCodeOf(diagnostics)
  return {
    exit: code === EXIT.ok ? EXIT.invalid : code,
    stderr:
      diagnostics.length > 0
        ? formatDiagnostics(diagnostics)
        : 'vui: the Viewer refused the document\n',
    json: { diagnostics },
  }
}

const localTarget = ({ info }: Running): Target => ({
  base: `http://127.0.0.1:${info.port}/v/${info.readToken}`,
  token: info.writeToken,
})

/** A Viewer can die between discovery and the POST, so a refused connection starts over once. */
async function postLocal(
  document: VuiDocument,
  system: System,
): Promise<{ posted: Posted; viewer: Running }> {
  const viewer = await ensureViewer(system)
  const posted = await postDocument(localTarget(viewer), document, system)
  if (posted.kind !== 'unreachable') return { posted, viewer }
  const next = await ensureViewer(system)
  const retried = await postDocument(localTarget(next), document, system)
  if (retried.kind === 'unreachable') throw noHost('the Viewer does not answer')
  return { posted: retried, viewer: { ...next, previous: next.previous ?? viewer.previous } }
}

function success(
  { document, diagnostics }: Delivery,
  posted: Delivered,
  pane: Pane,
  urlLine: boolean,
): Outcome {
  const { seq, id, url, clients } = posted
  const lines = [shownLine(document, seq), ...(urlLine ? [safe(`vui: open ${url}`)] : [])]
  const warning =
    pane.failure === undefined
      ? ''
      : `${safe(`vui: warning: Orca did not open a pane (${pane.failure})`)}
`
  const { title = null } = document
  return {
    exit: EXIT.ok,
    stdout: `${lines.join('\n')}\n`,
    stderr: `${formatDiagnostics(diagnostics)}${warning}`,
    json: {
      host: 'viewer',
      seq,
      id,
      url,
      title,
      clients,
      pane: pane.state,
      ...(pane.pageId === undefined ? {} : { browserPageId: pane.pageId }),
      ...(pane.failure === undefined ? {} : { paneFailure: pane.failure }),
      diagnostics,
    },
  }
}

/** Custom endpoints get no pane: a page id has no `viewer.json` to live in. */
async function deliverCustom(delivery: Delivery, target: Target): Promise<Outcome> {
  const posted = await postDocument(target, delivery.document, delivery.system)
  if (posted.kind === 'unreachable') throw noHost('VUI_VIEWER_URL does not answer')
  if (posted.kind === 'refused') return refused(posted)
  return success(delivery, posted, { state: 'none' }, posted.clients === 0)
}

/** §4.1: once per Viewer start, when nothing is showing the feed and no pane will. */
function takeUrlLine(viewer: Running, posted: Delivered, pane: Pane): boolean {
  if (posted.clients > 0 || pane.state !== 'none') return false
  const { stateDir } = viewer.place
  if (readViewerInfo(stateDir)?.urlShown === true) return false
  try {
    updateViewerInfo(stateDir, viewer.info.pid, { urlShown: true })
  } catch {
    // The worst case prints this line again, after a document that is already stored.
  }
  return true
}

/** §3's Viewer data flow, steps 3 to 6. */
export async function deliverToViewer(delivery: Delivery): Promise<Outcome> {
  const { document, noOpen, system } = delivery
  const target = customEndpoint(system.env)
  if (target !== undefined) return deliverCustom(delivery, target)
  const { posted, viewer } = await postLocal(document, system)
  if (posted.kind === 'refused') return refused(posted)
  if (posted.kind === 'unreachable') throw noHost('the Viewer does not answer')
  const skip = noOpen || posted.clients > 0
  const pane: Pane = skip ? { state: 'none' } : await showPane(system, viewer)
  return success(delivery, posted, pane, takeUrlLine(viewer, posted, pane))
}
