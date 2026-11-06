/** What `GET /` and `GET /app.js` serve. The feed app (task 14) supplies the real pair. */
export interface FeedAssets {
  html: string
  script: string
}

/** Fits the §15.3 CSP: its script is a same-origin file and its favicon a `data:` URL (§4.1). */
export const placeholderFeed: FeedAssets = {
  html: [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>vadd-ui Viewer</title>',
    '<link rel="icon" href="data:,">',
    '<script src="app.js" defer></script>',
    '</head><body><main>vadd-ui Viewer</main></body></html>',
    '',
  ].join('\n'),
  script: '// The feed app replaces this file.\n',
}
