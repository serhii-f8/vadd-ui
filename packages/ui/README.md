# @vadd/ui

The vadd-ui browser bundle: 24 components and 8 chart kinds, no runtime dependencies, 37.9 KiB gzipped.

## Script tag

```html
<script src="https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js"></script>
<script type="application/vui+json">
{title: 'Report', body: [
  {type: 'table', columns: ['Test', 'Status:status', 'Time:ms'], rows: [['login', 'ok', 120], ['refresh', 'fail', 340]]},
]}
</script>
```

Every `application/vui+json` script on the page is rendered in place. Use `vui-ext.min.js` instead when a document needs `compare`, `flow` or a `scatter` chart.

## Module

```ts
import { render } from '@vadd/ui'

const handle = render(source, element, { diagnostics: 'badge' })
handle.update(nextSource)
handle.destroy()
```

`render` takes source text or a document object and never throws to the host; invalid input becomes a visible error card. It uses no `innerHTML` or `eval` and makes no network requests, so documents can be treated as untrusted input.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
