import { packageName as ui } from '@vadd/ui'
import { packageName as uiSpec } from '@vadd/ui-spec'

export const packageName = '@vadd/ui-viewer' as const

export const dependsOn = [uiSpec, ui] as const
