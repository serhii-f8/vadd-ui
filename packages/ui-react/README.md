# @vadd/ui-react

`<VuiView>`: a vadd-ui document as a React component, for React 18 and 19.

```tsx
import { VuiView } from '@vadd/ui-react'

<VuiView doc={doc} theme="auto" onDiagnostics={(list) => console.debug(list)} />
```

| Prop | Type | Meaning |
| --- | --- | --- |
| `doc` | `VuiDocument \| string` | The document, as an object or source text. Changing it updates in place. |
| `theme` | `'auto' \| 'light' \| 'dark'` | `auto` (the default) follows the system scheme. |
| `onDiagnostics` | `(diagnostics) => void` | Called with the diagnostics of each render. |

The view renders into a shadow root, so your CSS and vadd-ui's cannot affect each other. Host design tokens such as `--background`, `--card` and `--foreground` still inherit into it, which is how it matches your theme.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
