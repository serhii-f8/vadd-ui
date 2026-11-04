// A comment may mention innerHTML, eval(x) and new Function(x).
/* document.write and insertAdjacentHTML here are harmless too. */
type Callback = Function
export const url = 'https://example.com/path' // innerHTML after a URL string is still a comment
export const words = ['evaluate', 'medieval', 'retrieval', 'dysfunction(']
export const slashes = /\/\/ not a comment/
export const run = (fn: Callback) => fn
