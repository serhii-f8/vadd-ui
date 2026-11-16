# @vadd/ui-viewer

The vadd-ui Viewer: a small local server with a live feed page that shows every document an agent sends, in light and dark themes.

You normally do not use this package directly. [`@vadd/ui-cli`](https://github.com/serhii-f8/vadd-ui/tree/main/packages/ui-cli) starts and manages it:

```sh
vui show report.vui
vui viewer status
```

It binds to `127.0.0.1`, serves the feed under an unguessable path, keeps one instance per workspace, and renders each document in its own shadow root with `@vadd/ui`. Needs Node 20 or newer.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
