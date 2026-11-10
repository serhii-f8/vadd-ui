// `vui bench [dir]` (§11.1, §14): every §14.2 budget in one run.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENT_TYPES, validateText } from '@vadd/ui-spec'
import type { ParsedArgs } from '../args.js'
import { catalogText } from '../commands.js'
import type { Io } from '../io.js'
import { EXIT, type Outcome } from '../outcome.js'
import { formatDiagnostics, safe } from '../print.js'
import { selectCounter } from './api.js'
import {
  type Budget,
  budget,
  CATALOG_LIMIT,
  DIRECTIVE,
  FIXED_CDN,
  FIXED_SHOW,
  hasGfmTable,
  LIMITS,
  ratio,
} from './budgets.js'
import { type BenchCase, DEFAULT_CORPUS, readCorpus } from './corpus.js'
import type { Counter, CounterInfo } from './tokens.js'

const MONOREPO_SKILL = fileURLToPath(
  new URL('../../../../skills/vadd-ui/SKILL.md', import.meta.url),
)

/** The repo's own skill first, since an installed copy may be older. */
export function skillCandidates(cwd: string, home: string): string[] {
  const installed = ['.claude', 'skills', 'vadd-ui', 'SKILL.md'] as const
  return [MONOREPO_SKILL, join(cwd, ...installed), join(home, ...installed)]
}

function readFirst(paths: readonly string[]): { path: string; text: string } | undefined {
  for (const path of paths) {
    try {
      return { path, text: readFileSync(path, 'utf8') }
    } catch {
      // The next place, then none: an installed CLI may have no skill beside it.
    }
  }
  return undefined
}

export interface CaseResult {
  name: string
  vui: number
  md: number
  html: number
  ratioMd: number
  ratioHtml: number
  mdTable: boolean
}

function describeCounter(info: CounterInfo): string {
  return info.kind === 'api'
    ? `Anthropic token counting API (${info.model})`
    : `offline estimate (${info.tokenizer}, ${info.method})`
}

function invalidCases(cases: readonly BenchCase[]): string {
  return cases
    .map(({ name, vui }) => {
      const errors = validateText(vui).diagnostics.filter(({ severity }) => severity === 'error')
      const lines = formatDiagnostics(errors).split('\n').filter(Boolean)
      return lines.map((line) => `${safe(name)}: ${line}\n`).join('')
    })
    .join('')
}

async function measureCase(item: BenchCase, counter: Counter): Promise<CaseResult> {
  const vui = await counter.count(item.vui)
  const md = await counter.count(item.md)
  const html = await counter.count(item.html)
  return {
    name: item.name,
    vui,
    md,
    html,
    ratioMd: ratio(vui, md),
    ratioHtml: ratio(vui, html),
    mdTable: hasGfmTable(item.md),
  }
}

function worst(
  results: readonly CaseResult[],
  key: 'ratioMd' | 'ratioHtml',
): CaseResult | undefined {
  return results.reduce<CaseResult | undefined>((top, item) => {
    return top === undefined || item[key] > top[key] ? item : top
  }, undefined)
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function budgetLine(row: Budget, detail: string, note?: string): string {
  const mark = row.value === null ? 'n/a ' : row.ok ? 'ok  ' : 'fail'
  const value =
    row.value === null ? `not measured: ${note}` : `${row.value} ≤ ${row.limit}${detail}`
  return `${mark} ${row.name.padEnd(14)} ${value}\n`
}

export interface BenchOptions {
  /** Where to look for `SKILL.md`, in order. */
  skills?: readonly string[]
}

export async function bench(
  parsed: ParsedArgs,
  io: Io,
  options: BenchOptions = {},
): Promise<Outcome> {
  const dir = parsed.positional[0] ?? DEFAULT_CORPUS
  const cases = readCorpus(dir)
  const invalid = invalidCases(cases)
  if (invalid !== '') {
    return {
      exit: EXIT.invalid,
      stdout: invalid,
      json: { error: { code: 'invalid-case', message: invalid.trimEnd() } },
    }
  }

  const { env } = io.system
  const counter = await selectCounter(env)
  const results: CaseResult[] = []
  for (const item of cases) results.push(await measureCase(item, counter))
  const skills = options.skills ?? skillCandidates(io.system.cwd(), env.HOME || homedir())
  const skill = readFirst(skills)

  const tables = results.filter(({ mdTable }) => mdTable)
  const worstMd = worst(tables, 'ratioMd')
  const worstHtml = worst(results, 'ratioHtml') as CaseResult
  const catalog: Record<string, number> = {}
  for (const type of COMPONENT_TYPES)
    catalog[`catalog.${type}`] = await counter.count(catalogText(type))

  const metrics: Record<string, number | null> = {
    'fixed.show': await counter.count(FIXED_SHOW),
    'fixed.cdn': await counter.count(FIXED_CDN),
    'ratio.md': worstMd?.ratioMd ?? null,
    'ratio.html': worstHtml.ratioHtml,
    skill: skill === undefined ? null : await counter.count(skill.text),
    ...catalog,
  }
  const budgets = [
    ...Object.entries(LIMITS).map(([name, limit]) => budget(name, metrics[name] ?? null, limit)),
    ...Object.keys(catalog).map((name) => budget(name, metrics[name] ?? null, CATALOG_LIMIT)),
  ]
  const info = {
    directive: await counter.count(DIRECTIVE),
    showOrcaChat: await counter.count(FIXED_SHOW + DIRECTIVE),
    mdTotal: ratio(sum(results.map(({ vui }) => vui)), sum(results.map(({ md }) => md))),
    htmlTotal: ratio(sum(results.map(({ vui }) => vui)), sum(results.map(({ html }) => html))),
    tableCases: tables.length,
  }

  const byName = new Map(budgets.map((row) => [row.name, row]))
  const row = (name: string) => byName.get(name) as Budget
  const catalogRows = budgets.filter(({ name }) => name.startsWith('catalog.'))
  const largest = catalogRows.reduce((top, item) =>
    (item.value ?? 0) > (top.value ?? 0) ? item : top,
  )
  const catalogSummary: Budget = {
    name: 'catalog',
    value: largest.value,
    limit: CATALOG_LIMIT,
    ok: catalogRows.every(({ ok }) => ok),
  }
  const lines = [
    `vui bench: ${results.length} cases, ${describeCounter(counter.describe)}\n`,
    budgetLine(row('fixed.show'), ''),
    budgetLine(row('fixed.cdn'), ''),
    budgetLine(
      row('ratio.md'),
      ` (worst: ${safe(worstMd?.name ?? '')}, ${tables.length} table cases)`,
      'no case has a markdown table',
    ),
    budgetLine(row('ratio.html'), ` (worst: ${safe(worstHtml.name)})`),
    budgetLine(row('skill'), ` (${safe(skill?.path ?? '')})`, 'no SKILL.md found'),
    budgetLine(
      catalogSummary,
      ` per component (largest: ${largest.name.slice('catalog.'.length)})`,
    ),
    ...catalogRows.filter(({ ok }) => !ok).map((item) => budgetLine(item, '')),
    `info orca-chat host: ${info.showOrcaChat} tokens with its ::orca-visual line, which §14.2's "command line + envelope" leaves out\n`,
    `info markdown total ${info.mdTotal}, HTML total ${info.htmlTotal}, over all cases\n`,
  ]
  const ok = budgets.every((item) => item.ok)
  return {
    exit: ok ? EXIT.ok : EXIT.invalid,
    stdout: lines.join(''),
    json: {
      counter: counter.describe,
      cases: results,
      metrics,
      budgets,
      info,
      skillPath: skill?.path ?? null,
    },
  }
}
