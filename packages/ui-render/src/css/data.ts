// §6.3, §6.6.

const fillScale = Array.from(
  { length: 101 },
  (_, fill) => `.vui-root [data-vui-fill="${fill}"]{--vui-fill:${fill}%}`,
).join('')

export const dataCss = fillScale
