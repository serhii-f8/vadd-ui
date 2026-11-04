import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The §3 package table, the one place the checks read it from.
 *
 * - `scanned`: reaches a browser, so the §15.1 banned-API lint applies.
 * - `zeroDep`: may have no runtime dependency beyond its §3 workspace edges.
 *
 * @typedef {object} Package
 * @property {string} name
 * @property {string} dir
 * @property {string[]} deps
 * @property {'browser' | 'node'} target
 * @property {boolean} scanned
 * @property {boolean} zeroDep
 */

/** @type {Package[]} */
export const PACKAGES = [
  {
    name: '@vadd/ui-spec',
    dir: 'packages/ui-spec',
    deps: [],
    target: 'browser',
    scanned: true,
    zeroDep: true,
  },
  {
    name: '@vadd/ui-render',
    dir: 'packages/ui-render',
    deps: ['@vadd/ui-spec'],
    target: 'browser',
    scanned: true,
    zeroDep: true,
  },
  {
    name: '@vadd/ui-text',
    dir: 'packages/ui-text',
    deps: ['@vadd/ui-spec'],
    target: 'browser',
    scanned: true,
    zeroDep: false,
  },
  {
    name: '@vadd/ui',
    dir: 'packages/ui',
    deps: ['@vadd/ui-spec', '@vadd/ui-render'],
    target: 'browser',
    scanned: true,
    zeroDep: true,
  },
  {
    name: '@vadd/ui-viewer',
    dir: 'packages/ui-viewer',
    deps: ['@vadd/ui-spec', '@vadd/ui'],
    target: 'node',
    scanned: true,
    zeroDep: false,
  },
  {
    name: '@vadd/ui-cli',
    dir: 'packages/ui-cli',
    deps: ['@vadd/ui-spec', '@vadd/ui', '@vadd/ui-text', '@vadd/ui-viewer'],
    target: 'node',
    scanned: false,
    zeroDep: false,
  },
  {
    name: '@vadd/ui-react',
    dir: 'packages/ui-react',
    deps: ['@vadd/ui-render'],
    target: 'browser',
    scanned: true,
    zeroDep: false,
  },
]

/**
 * Parses a JSON file, or records why it could not and returns null.
 *
 * @param {string} root
 * @param {string} file
 * @param {string[]} findings
 * @returns {Record<string, any> | null}
 */
export function readJson(root, file, findings) {
  try {
    return JSON.parse(readFileSync(join(root, file), 'utf8'))
  } catch {
    findings.push(`${file}: unreadable`)
    return null
  }
}
