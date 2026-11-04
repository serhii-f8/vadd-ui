import { parseInline } from '@vadd/ui-spec'
import { type Block, para } from './blocks.js'

// Placeholder until step 3 of the plan.
export function mdBlocks(value: string): Block[] {
  return [para(parseInline(value))]
}
