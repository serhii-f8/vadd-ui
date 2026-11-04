import { packageName as uiRender } from '@vadd/ui-render'
import { packageName as uiSpec } from '@vadd/ui-spec'

export const packageName = '@vadd/ui' as const

export const dependsOn = [uiSpec, uiRender] as const
