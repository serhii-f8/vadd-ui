// What some hosts do not have, so a test of it skips there instead of failing (task 25, VD-203).
// Each name is the reason; a test skips only for behavior that does not exist on the host.

const WINDOWS = process.platform === 'win32'

/** Windows has no POSIX permission bits: `statSync().mode` reads 0o666 whatever was asked. */
export const NO_POSIX_MODES = WINDOWS

/**
 * A directory `chmod` cannot make read-only or unsearchable: Windows ignores the bits on
 * directories, and root passes every permission check.
 */
export const NO_READONLY_DIRS = WINDOWS || process.getuid?.() === 0

/** No `/proc` on Windows (nor macOS), so no process group or command line to read there. */
export const NO_PROC = process.platform !== 'linux'

/** Windows runs no SIGTERM handler: `kill('SIGTERM')` ends the process at once, exit code null. */
export const NO_SIGTERM = WINDOWS

/** Windows refuses control characters such as a newline in a file name. */
export const NO_CONTROL_NAMES = WINDOWS
