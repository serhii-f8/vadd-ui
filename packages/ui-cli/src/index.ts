import { packageName as ui } from '@vadd/ui'
import { packageName as uiSpec } from '@vadd/ui-spec'
import { packageName as uiText } from '@vadd/ui-text'
import { packageName as uiViewer } from '@vadd/ui-viewer'

export type { Counter, CounterInfo, OfflineCounter, TokenEstimate } from './bench/tokens.js'
export { offlineCounter } from './bench/tokens.js'
export type { Io } from './io.js'
export type { ExitCode, Outcome } from './outcome.js'
export { renderOutput, writeOutput } from './output.js'
export { exitCodeOf, prepare } from './pipeline.js'
export { run } from './run.js'

export const packageName = '@vadd/ui-cli' as const

export const dependsOn = [uiSpec, ui, uiText, uiViewer] as const
