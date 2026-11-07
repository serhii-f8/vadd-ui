import { createElement, version } from 'react'
import { createRoot } from 'react-dom/client'
import { type Diagnostic, type VuiTheme, VuiView } from '../../packages/ui-react/src/index.js'

// A dashboard page's script: mounts `<VuiView>` with the props a test asks for. Bundled by
// `vui-view-page.ts`, once per React (VD-143).

interface Mount {
  doc: unknown
  theme?: VuiTheme
}

declare global {
  interface Window {
    reactVersion: string
    diagnostics: Diagnostic[][]
    mountView(target: HTMLElement, props: Mount): (next: Mount) => void
  }
}

window.reactVersion = version
window.diagnostics = []
window.mountView = (target, props) => {
  const root = createRoot(target)
  const draw = ({ doc, theme }: Mount) =>
    root.render(
      createElement(VuiView, {
        doc: doc as string,
        theme,
        onDiagnostics: (diagnostics) => window.diagnostics.push(diagnostics),
      }),
    )
  draw(props)
  return draw
}
