export { type FeedAssets, feedHtml, readFeedScript } from './feed.js'
export {
  createViewerHandler,
  type ViewerHandler,
  type ViewerHandlerOptions,
  viewerUrl,
} from './handler.js'
export { type RunDeps, runViewer } from './main.js'
export { stateDirOf, workspaceHash, workspaceOf } from './paths.js'
export {
  FIRST_PORT,
  IDLE_MS,
  isAlive,
  LAST_PORT,
  liveViewer,
  type RetiredInfo,
  type RunningViewer,
  readViewerInfo,
  retireViewerInfo,
  type StartOptions,
  startViewer,
  updateViewerInfo,
  type ViewerInfo,
  ViewerRunningError,
  ViewerStartError,
  type ViewerState,
  viewerState,
} from './server.js'
export {
  type DocHeader,
  DocStore,
  type DocStoreOptions,
  MAX_BYTES,
  MAX_DOCS,
  slugify,
} from './store.js'
export {
  cdnHtml,
  embedJson,
  escapeHtml,
  GENERATOR,
  GENERATOR_LABEL,
  type InlineOptions,
  inlineHtml,
  readBundle,
} from './visual-file.js'

export const packageName = '@vadd/ui-viewer' as const
