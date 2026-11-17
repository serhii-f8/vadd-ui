import { detectEnvironment } from '../environment.js'
import { type System, windowsShell } from '../system.js'

type Launch = [file: string, ...args: string[]]

const EXPLORER = 'explorer.exe'
/** Where Windows lives when `appendWindowsPath` keeps it off `PATH`. */
const WINDOWS_EXPLORER = '/mnt/c/Windows/explorer.exe'

/** `explorer.exe` exits 1 after opening a URL, so only a failure to run it counts. */
const isExplorer = (file: string) => file === EXPLORER || file === WINDOWS_EXPLORER

function launches(system: System, url: string): Launch[] {
  if (detectEnvironment(system).kind === 'wsl') {
    return [
      ['wslview', url],
      [EXPLORER, url],
      [WINDOWS_EXPLORER, url],
    ]
  }
  if (system.platform === 'darwin') return [['open', url]]
  if (system.platform === 'win32') {
    return [[windowsShell(system.env), '/d', '/c', 'start', '""', url]]
  }
  return [['xdg-open', url]]
}

/** §4.1. The command that opened `url`, or `undefined` if none did. Over SSH, none can. */
export async function openBrowser(system: System, url: string): Promise<string | undefined> {
  if (detectEnvironment(system).kind === 'ssh') return undefined
  for (const [file, ...args] of launches(system, url)) {
    const { ok, missing, timedOut } = await system.exec(file, args)
    if (ok || (isExplorer(file) && !missing && !timedOut)) return file
  }
  return undefined
}
