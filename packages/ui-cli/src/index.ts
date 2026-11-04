import { packageName as ui } from '@vadd/ui'
import { packageName as uiSpec } from '@vadd/ui-spec'
import { packageName as uiText } from '@vadd/ui-text'
import { packageName as uiViewer } from '@vadd/ui-viewer'

export const packageName = '@vadd/ui-cli' as const

export const dependsOn = [uiSpec, ui, uiText, uiViewer] as const
