# Runtime support (§17.4)

Statement for vadd-ui 1.x, written 2026-11-15 (task 21). "Tested" means a test in this repository ran on that engine or host; "stated" means it follows from documentation or reasoning and was not run here.

## Browser engines

| Engine | §17.4 minimum | Tested here | What holds |
|---|---|---|---|
| Chromium | 110+ | Chromium 156.0.8078.4 (Playwright 1.64.1): the whole e2e suite, pixel baselines, axe, XSS, budgets | Full fidelity from **Chromium 111**; on 110 see `color-mix()` below |
| Firefox | 115+ | Firefox 157.0 (Playwright `firefox-1555`): the engine smoke, `e2e/engines.spec.ts`, 8 tests | Full fidelity from Firefox 116 for `pl-PL` money; see below |
| Safari / WebKit | 16.4+ (Orca mobile) | WebKit 27.2 (Playwright `webkit-2370`): the engine smoke, 8 tests | Full fidelity from 16.4 as far as this repo knows; Safari's first copy of a folded document is unchecked (VD-122) |

The engine smoke runs the CLI's real standalone file (§4.3) by `file://` and checks: the three §19 examples render with no error card and no page error; `CSS.supports('color', 'color-mix(…)')`, custom properties, `ResizeObserver` and `Intl.RelativeTimeFormat` exist; `pl-PL` money reads exactly as the CLI formats it (`1 234,50 zł`, with no-break spaces); a fold opens with `aria-expanded`; the canvas follows `prefers-color-scheme` (`rgb(255, 255, 255)` light, `rgb(10, 10, 10)` dark). Chromium runs it in `pnpm gate`; CI's `engines` job runs Firefox and WebKit (`VUI_ENGINES=1`). Run here on 2026-11-15: 8/8 in Chromium, 16/16 in Firefox and WebKit.

**Not tested: the minimum versions themselves.** Playwright ships current engines, so Chromium 110, Firefox 115 and Safari 16.4 were never run. The two known gaps at the minimums follow.

### `color-mix()` and Chromium 110

§8.1 requires `color-mix()`, and the renderer uses it in 7 declarations (`packages/ui-render/src/css/`: tone text colours in `tokens.ts`, status pills and error cards in `base.ts`, callout and marked code lines in `components.ts`, bar fills and code tones in `data.ts`), with no fallback declaration before them. `color-mix()` shipped in Chromium 111, Safari 16.2 and Firefox 113 (release notes, from memory; not run here). So **Chromium 110, the §17.4 floor, does not support a feature §17.4 requires.** On Chromium 110 those declarations are dropped: tinted backgrounds (status pills, callouts, error cards, marked lines) are transparent, and tone text falls back to the inherited text colour. Text, icons and labels stay, and status is never conveyed by colour alone (§15.2), so a visual stays readable and correct but loses its tints. This is stated from CSS rules, not observed. The supported floor for full fidelity is **Chromium 111**; Orca's Electron is far newer, so no shipped host is affected. Logged as VD-177 (DEVIATION).

### `pl-PL` money in Firefox 115

`formatValue` asks for `useGrouping: 'always'` (VD-043), so `pl-PL` groups four-digit amounts (`1 234,50 zł`), as the CLI's Node does. That string value is part of `Intl.NumberFormat` v3, which Firefox shipped in 116 (from memory; not run here). Firefox 115 reads the option as the boolean `true`, the locale's default, and `pl-PL`'s minimum grouping digits of 2 then leave four-digit amounts ungrouped: `1234,50 zł` in the browser against `1 234,50 zł` in the CLI's text output. Five digits and more group the same in both. Values are not changed, only one separator. Firefox 157 matches the CLI (tested). Stated in VD-177.

### Safari's first copy of a folded document (VD-122)

"Copy spec" in the Viewer feed was tested in Chromium only. For a folded entry the copy runs after a network read, which can lose the click's user activation: Chromium allows about 5 s, Safari may refuse, and the button then says "Copy failed"; a second click works, since the text is kept (VD-122). Manual check: `ORCA_E2E_CHECKLIST.md`, step 9.

## Required features (§17.4 row 2)

| Feature | Where checked |
|---|---|
| ES2020 | `scripts/check-targets.mjs` in `pnpm check`: every browser package compiles to ES2020 (VD-019) |
| CSS custom properties | engine smoke; the whole theme system (§8.1) |
| `color-mix()` | engine smoke (present in all three current engines); see Chromium 110 above |
| `ResizeObserver` | engine smoke; the Orca shell harness's height reporting (`e2e/orca-shell.spec.ts`) |
| `Intl.NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat` | engine smoke; `ui-spec` unit tests across `en-US`, `pl-PL`, `uk-UA` (§16) |

## CLI (§17.4 row 3: Node.js 20+, macOS, Linux, Windows, WSL)

| Host | Status |
|---|---|
| Linux (WSL 2 Ubuntu 24.04, Node 22.20.0) | Tested: the whole gate and the §16.1 scenario |
| Linux (`ubuntu-latest`) | CI `gate` job, written, not run (no remote, VD-010) |
| Windows (native) | CI `portable` job, written, not run; manual steps in `HOST_MATRIX.md` |
| macOS | CI `portable` job, written, not run |
| Node 20 | `engines.node: ">=20"` in `@vadd/ui-cli`; `vui doctor` fails below 20. Every run here used Node 22; Node 20 itself is unrun |

## VADD web (§17.4 row 4: React 18+)

`@vadd/ui-react` is tested under React 18 and React 19 (VD-143, Vitest projects `jsdom-react18` and `jsdom`) and in Chromium (`e2e/ui-react.spec.ts`).
