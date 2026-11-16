# @vadd/ui-text

Renders a vadd-ui document as markdown or aligned plain text, for hosts that cannot draw.

```ts
import { renderMarkdown, renderPlain } from '@vadd/ui-text'
```

```text
Test                          Status    Time
----------------------------  ------  ------
replayed token is rejected ✗  ✗ fail  1.21 s
refresh rotates the token     ✓ ok    340 ms
```

Values are formatted by the same functions as the DOM renderer, so numbers, durations and dates read the same everywhere.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
