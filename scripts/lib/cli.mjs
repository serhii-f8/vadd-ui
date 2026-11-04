import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Reads `--root <dir>`, which points a check at a test tree instead of this repo.
 *
 * @param {string[]} argv
 * @returns {string}
 */
export function rootArg(argv) {
  const index = argv.indexOf('--root')
  return index === -1 ? repoRoot : (argv[index + 1] ?? repoRoot)
}

/**
 * Prints findings and sets the exit code. Every check ends here.
 *
 * @param {string} name
 * @param {string[]} findings
 * @param {string} summary
 */
export function finish(name, findings, summary) {
  for (const finding of findings) console.error(finding)
  if (findings.length > 0) {
    console.error(`${name}: ${findings.length} finding(s)`)
    process.exitCode = 1
    return
  }
  console.log(`${name}: ${summary}`)
}
