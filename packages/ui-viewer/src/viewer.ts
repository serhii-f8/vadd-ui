import { runViewer } from './main.js'

runViewer(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`vui: viewer: ${message}\n`)
  process.exitCode = 1
})
