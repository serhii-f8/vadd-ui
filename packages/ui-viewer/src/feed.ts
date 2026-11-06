import { readFileSync } from 'node:fs'

/** What `GET /` and `GET /app.js` serve. */
export interface FeedAssets {
  html: string
  script: string
}

/** A `V` on a blue tile, inline so the browser never asks for `/favicon.ico` (§4.1). */
const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%232563eb'/%3E%3Cpath d='M4 4.5 8 12l4-7.5' fill='none' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E"

/** Fits the §15.3 CSP: the script is a file (VD-006), and the page's CSS comes with it. */
export const feedHtml = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="color-scheme" content="light dark">',
  '<title>vadd-ui Viewer</title>',
  `<link rel="icon" href="${ICON}">`,
  '<script src="app.js" defer></script>',
  '</head><body></body></html>',
  '',
].join('\n')

/** The build puts the feed app beside this module. */
const SCRIPT = new URL('./app.js', import.meta.url)

export function readFeed(script: URL = SCRIPT): FeedAssets {
  return { html: feedHtml, script: readFileSync(script, 'utf8') }
}
