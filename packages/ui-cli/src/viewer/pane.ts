import { readViewerInfo, updateViewerInfo } from '@vadd/ui-viewer'
import { detectEnvironment } from '../environment.js'
import { createTab, gotoTab, listTabs, resolveOrca, type Tab } from '../host/orca.js'
import type { System } from '../system.js'
import { PANE_LOCK, type Running, tryLock } from './lifecycle.js'

/** `busy`: another show holds the lock and is doing this. */
export type PaneState = 'opened' | 'moved' | 'kept' | 'busy' | 'none'

export interface Pane {
  state: PaneState
  pageId?: string
  /** A failed Orca call, as a printable reason. */
  failure?: string
}

const isAt = (tabs: Tab[] | undefined, pageId: string | undefined, url: string) => {
  return tabs?.some((tab) => tab.browserPageId === pageId && tab.url.startsWith(url)) === true
}

function record(viewer: Running, pageId: string, state: PaneState): Pane {
  updateViewerInfo(viewer.place.stateDir, viewer.info.pid, { browserPageId: pageId })
  return { state, pageId }
}

/**
 * VD-122: one pane per Viewer. A page takes a moment to connect, so `clients: 0` alone cannot
 * tell a closed pane from a loading one, and only `tab list` can.
 */
async function openOrReuse(system: System, orca: string, viewer: Running): Promise<Pane> {
  const pageId = readViewerInfo(viewer.place.stateDir)?.browserPageId
  const { previous } = viewer
  if (pageId !== undefined || previous !== undefined) {
    const tabs = await listTabs(system, orca)
    if (isAt(tabs, pageId, viewer.url)) return { state: 'kept', pageId }
    if (previous !== undefined && isAt(tabs, previous.pageId, previous.url)) {
      const moved = await gotoTab(system, orca, previous.pageId, viewer.url)
      if (moved) return record(viewer, previous.pageId, 'moved')
    }
  }
  const tab = await createTab(system, orca, viewer.url)
  if ('failure' in tab) return { state: 'none', failure: tab.failure }
  return record(viewer, tab.pageId, 'opened')
}

/**
 * §4.1, §4.0 (SSH: "no auto-open") and §17.3. The document is stored by now, so no failure here
 * may fail the show: a retry would store it twice.
 */
export async function showPane(system: System, viewer: Running): Promise<Pane> {
  if (detectEnvironment(system).kind === 'ssh') return { state: 'none' }
  const orca = resolveOrca(system)
  if (orca === undefined) return { state: 'none' }
  try {
    const release = tryLock(viewer.place.stateDir, PANE_LOCK)
    if (release === undefined) return { state: 'busy' }
    try {
      return await openOrReuse(system, orca, viewer)
    } finally {
      release()
    }
  } catch {
    return { state: 'none', failure: 'state-not-writable' }
  }
}
