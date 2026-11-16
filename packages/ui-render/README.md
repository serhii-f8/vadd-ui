# @vadd/ui-render

The DOM renderer behind every vadd-ui host: the Viewer, Orca chat visuals, standalone HTML files and `<VuiView>`.

```ts
import { render, stylesheet } from '@vadd/ui-render'

const handle = render(source, target, { diagnostics: 'panel' })
```

- `render(input, target, options?)` mounts a document (source text or object) and returns `{ diagnostics, update, destroy }`.
- `stylesheet` is the full CSS as a string; inject it once per document or shadow root.
- `@vadd/ui-render/core` is the same API without the ext components (`compare`, `flow`, `scatter`).

Most applications want [`@vadd/ui`](https://github.com/serhii-f8/vadd-ui/tree/main/packages/ui) or [`@vadd/ui-react`](https://github.com/serhii-f8/vadd-ui/tree/main/packages/ui-react) instead, which wrap this package.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
