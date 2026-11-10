// VD-136 and VD-148: the one offline token estimate, for `SKILL.md`, the catalog and the corpus.
// `js-tiktoken` is pure JavaScript and is imported here only, lazily, so no other command
// loads it and no browser package depends on it.

/** Which counter produced a report (§14.3: "the report states which"). */
export type CounterInfo =
  | { kind: 'offline'; tokenizer: string; method: string }
  | { kind: 'api'; model: string }

export interface Counter {
  describe: CounterInfo
  count(text: string): Promise<number>
}

export interface TokenEstimate {
  cl100k: number
  chars: number
  fromCl100k: number
  fromChars: number
  estimate: number
}

export interface OfflineCounter extends Counter {
  estimate(text: string): TokenEstimate
}

/** Anthropic glossary, read 2026-11-06: Claude 4.7 and later give about 30% more tokens. */
const NEW_TOKENIZER_FACTOR = 1.3
/** The same page: about 3.5 English characters per token on earlier models. */
const CHARS_PER_TOKEN = 3.5

const DESCRIBE: CounterInfo = {
  kind: 'offline',
  tokenizer: 'js-tiktoken 1.0.21 cl100k_base',
  method: 'max(cl100k × 1.3, chars × 1.3 / 3.5)',
}

let loading: Promise<OfflineCounter> | undefined

async function load(): Promise<OfflineCounter> {
  const { Tiktoken } = await import('js-tiktoken/lite')
  const { default: ranks } = await import('js-tiktoken/ranks/cl100k_base')
  const encoding = new Tiktoken(ranks)
  const estimate = (text: string): TokenEstimate => {
    const cl100k = encoding.encode(text).length
    const chars = [...text].length
    const fromCl100k = Math.ceil(cl100k * NEW_TOKENIZER_FACTOR)
    const fromChars = Math.ceil((chars * NEW_TOKENIZER_FACTOR) / CHARS_PER_TOKEN)
    return { cl100k, chars, fromCl100k, fromChars, estimate: Math.max(fromCl100k, fromChars) }
  }
  return { describe: DESCRIBE, estimate, count: async (text) => estimate(text).estimate }
}

/** VD-136: an estimate of real model tokens, not a count of them. Loaded once. */
export function offlineCounter(): Promise<OfflineCounter> {
  loading ??= load()
  return loading
}
