# @vadd/ui-spec

The vadd-ui document format as code, with no DOM: the relaxed-JSON parser, the normalizer that expands shorthands, the validator and its diagnostics, the value formatters, the component catalog and the JSON Schema.

```ts
import { parse, normalize, formatValue } from '@vadd/ui-spec'
import schema from '@vadd/ui-spec/schema.json' with { type: 'json' }
```

Use it to validate or transform documents on a server, or to build another renderer that formats values exactly as the official ones do. It has no dependencies.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
