import { packageName as uiSpec } from '@vadd/ui-spec'

export const packageName = '@vadd/ui-render' as const

export const dependsOn = [uiSpec] as const
