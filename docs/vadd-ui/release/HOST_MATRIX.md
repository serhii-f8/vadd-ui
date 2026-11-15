# Host and environment matrix (§16.1)

Each cell must pass one scenario: "`vui show` delivers a document that appears in the pane within 1 s; a second show appends without opening another pane; killing the Viewer and showing again restarts it and the open page reconnects; `vui doctor` reports no failures."

`scripts/host-scenario.mjs` runs that scenario with the real CLI (`pnpm build` first) in a temporary git workspace and state directory, so it never meets your own Viewers, and closes the pane it opened:

```sh
node scripts/host-scenario.mjs --surface orca      # in an Orca terminal: the real Orca browser pane
node scripts/host-scenario.mjs --surface browser   # outside Orca: headless Chromium as the browser
node scripts/host-scenario.mjs --surface browser --out report.json   # plus a JSON report
```

What it measures (VD-173):

- **Cold**: the first show, with no Viewer and no pane: from the CLI's spawn to the pane's arrival of `api/docs/<id>` (Resource Timing in the pane), then a check that the title rendered. In Orca this includes `orca tab create`.
- **Warm**: a show with the pane open; the number the CLI controls (VD-129).
- **Restart**: `kill -9` of the Viewer, then a show: the Viewer restarts (new pid) and the open page shows the new document. In Orca the CLI moves the same pane with `goto` (VD-125). Outside Orca the old page reports "This Viewer has stopped", the CLI prints the new URL line, and the scenario follows it, which is how a person gets back in a system browser (VD-125). A fourth show must see a connected client.
- **Panes**: Orca tabs on the Viewer's origin after each step (must stay 1); outside Orca, a URL line on the second show would mean the CLI wants another page.
- **Doctor**: `vui doctor --json` with no `fail`.
- **VD-142**: in Orca, `tab list` right after the first `tab create` must already list the new pane.
- **Clocks**: the Orca pane runs on Windows' clock and the CLI on WSL's. An `orca eval` round trip is most of a second, so the pane measures the offset itself: it briefly visits a page this script serves, which reads this process's clock 20 times with millisecond round trips; the tightest sample gives the offset (NTP-style), and the pane goes back to the feed.

A cold show over 1 s in Orca is reported as VD-129's known deviation (Orca creating the pane), not a failure; everything else over budget fails.

## Results on this machine (2026-11-15)

Windows 11, WSL 2 `Ubuntu-22.04` (Ubuntu 24.04.4, kernel 6.6.87.2), `networkingMode=mirrored`, Orca 1.4.259 (`orca-ide`), Node 22.20.0, Chromium 156.0.8078.4.

| Cell | Runs | Cold (first show, new pane) | Warm (open pane) | Restart | Panes | Doctor | VD-142 | Verdict |
|---|---|---|---|---|---|---|---|---|
| Windows 11, WSL 2, mirrored, terminal in Orca | 3 | 3,359 / 1,648 / 1,631 ms | 71 / 71 / 69 ms | 2,515 / 2,573 / 2,470 ms | 1 / 1 / 1 | no fail | listed | **pass**; cold over 1 s is VD-129 |
| Linux-style terminal outside Orca (WSL, Orca hidden from the CLI; headless Chromium as the browser) | 3 | 196 / 192 / 190 ms | 68 / 69 / 69 ms | 795 / 786 / 790 ms | 1 / 1 / 1 | no fail | n/a | **pass**; old page said "stopped" each time |

These are the final runs, at the branch head. Earlier runs during development read the same (Orca warm 67–78 ms over 5 more runs; browser warm 72–74 ms). Clock offset in the Orca runs: 0 ± 1, 1 ± 1, 0 ± 1 ms (the WSL and Windows clocks agree; the warm numbers are exact to about a millisecond). Cold in Orca is the CLI and Viewer (about 170 ms, VD-129) plus `orca tab create`: the first show's CLI took 3,437 / 1,739 / 1,709 ms. VD-129 measured about 1.05 s cold on the same machine on 2026-11-06, so Orca's pane creation is slower today, and only Orca can change it. Restart includes the old page noticing (outside Orca: its backoff until the new Viewer answers its old token with 404) or the CLI's `tab list` + `goto` (in Orca). Doctor's `windows` check took 21 s on mirrored networking (VD-128). The Orca pane after a run (taken by `orca screenshot`) shows the four documents in order with the feed live; the browser surface writes `report.png` next to `--out`.

Outside-Orca reading (VD-125): the browser surface uses Playwright's Chromium in place of `xdg-open`/`wslview`, because `vui viewer open` would pop a window on the user's desktop unattended. Running the real opener is a manual step below.

## Every cell

| Environment | Surface | Status | Where |
|---|---|---|---|
| Windows 11, native PowerShell terminal in Orca | Orca browser pane | CI (browser surface) + **manual** (Orca pane) | CI `portable` (windows-latest); steps A |
| Windows 11, WSL 2 Ubuntu, default NAT, terminal in Orca | Orca browser pane via `localhost` forwarding | CI (browser surface, NAT doctor check) + **manual** (Orca pane) | CI `wsl-nat`; steps B |
| Windows 11, WSL 2, `networkingMode=mirrored`, terminal in Orca | Orca browser pane | **Run here: pass** | above |
| Windows 11, WSL 2, Windows Terminal outside Orca | System browser via `wslview`/`explorer.exe` | **manual** | steps C |
| macOS, terminal in Orca | Orca browser pane | CI (browser surface) + **manual** (Orca pane) | CI `portable` (macos-latest); steps D |
| Linux, terminal outside Orca | System browser | **Run here: pass** (headless Chromium) + CI | above; CI `gate` |
| SSH host with `ssh -L` forward | Local browser | **manual** | steps E |
| Devcontainer with forwarded port | Local browser | **manual** | steps F |
| Orca structured chat, native local | Inline transcript visual | **manual** | `ORCA_E2E_CHECKLIST.md` |

`wsl-nat` runs only when the repository variable `WSL2_RUNNER` names a Windows runner with WSL 2 (GitHub's standard runners lack nested virtualization); it then fails unless doctor's `windows` check reads `ok`, which is the NAT forwarding proof. CI jobs are written and validated (`actionlint` 1.7.7, `scripts/test/ci-workflow.test.ts`) but have never run: the repository has no remote (VD-003, VD-010). Their first run may surface host-specific failures that this machine could not show (POSIX-only assumptions in tests on Windows, font-dependent pixels on `ubuntu-latest`); see `RELEASE_CHECKLIST.md`.

## Manual steps

All steps assume a clone with `pnpm install && pnpm build` done, and Node 22+. "Run the scenario" means `node scripts/host-scenario.mjs --surface orca --out report.json` in an Orca terminal (or `--surface browser` outside Orca); attach `report.json` to the release record.

### A. Windows 11, native PowerShell in Orca

1. In Orca on Windows, open a **PowerShell** terminal (not WSL) in the repo. `$env:ORCA_CLI_COMMAND` or `orca` must resolve (`Get-Command orca`). The scenario script runs the Orca CLI without a shell, and Node refuses to start a `.cmd` that way: if `Get-Command orca` names a `.cmd`, set `$env:ORCA_CLI_COMMAND` to the full path of Orca's `.exe` CLI for the scenario (the `vui` CLI itself handles `.cmd`, step 3).
2. Run the scenario with `--surface orca`. Expect pass; cold over 1 s is VD-129.
3. Native-Windows checks the scenario does not cover:
   - **`.cmd` through `cmd.exe`:** if `orca` resolves to `orca.cmd`, the pane still opens (the scenario's first show reports a `browserPageId`). Confirm with `Get-Command orca | Select-Object Source`.
   - **`start`:** `node packages/ui-cli/dist/bin.js viewer open` opens the Viewer URL in the default browser. Pass if the browser shows the feed.
   - **PowerShell UTF-16 pipe:** in Windows PowerShell 5.1, force UTF-16 with `$OutputEncoding = [Text.Encoding]::Unicode`, then `'{"title":"x","body":["hi"]}' | node packages/ui-cli/dist/bin.js show`. Expect exit 2 with a clear one-line diagnostic, not a crash or garbage: `vui: input is not valid UTF-8` (with a byte-order mark), or a parse error naming `U+0000` (without one); both were seen here on WSL with the same bytes. Then `$OutputEncoding = [Text.UTF8Encoding]::new($false)` and repeat: exit 0.
   - **Closed stdin:** `cmd /c "node packages\ui-cli\dist\bin.js show < NUL"`: expect exit 2 with `error: line 1, column 1: unexpected end of input; expected a value` (what WSL prints for `< /dev/null`), not a hang.
   - **`EACCES` reserved port (VD-118):** list Windows' excluded ranges with `netsh interface ipv4 show excludedportrange protocol=tcp`. If one covers 47100, run `vui show`: today the port search ends at an `EACCES` port instead of moving on (VD-118), so expect exit 4. If no range covers 47100, create one as administrator (`netsh int ipv4 add excludedportrange protocol=tcp startport=47100 numberofports=1`), test, then remove it (`netsh int ipv4 delete excludedportrange protocol=tcp startport=47100 numberofports=1`). Record the result; a fix is a follow-up.
4. `vui doctor` reports no `fail`; the state directory is under `%LOCALAPPDATA%\vadd-ui\`.

### B. Windows 11, WSL 2 with default NAT, terminal in Orca

1. In `%UserProfile%\.wslconfig`, remove `networkingMode=mirrored` (or set `networkingMode=nat`), run `wsl --shutdown`, reopen Orca.
2. In a WSL terminal in Orca, `wslinfo --networking-mode` (or `cat /proc/net/route`) shows NAT.
3. Run the scenario with `--surface orca`. Expect pass, and `vui doctor`'s `windows` check `ok` (Windows reaches the Viewer over `localhost` forwarding).
4. Restore `.wslconfig` and `wsl --shutdown`.

### C. Windows 11, WSL 2, Windows Terminal outside Orca

1. Open Windows Terminal with the WSL profile (Orca closed, or at least not this terminal). `env | grep ORCA_` prints nothing.
2. `echo '{"title":"C1","body":["first"]}' | node packages/ui-cli/dist/bin.js show`: expect `vui: shown …` and a `vui: open http://localhost:<port>/v/<token>/` line.
3. `node packages/ui-cli/dist/bin.js viewer open`: the Windows default browser opens the feed (through `wslview` if installed, else `explorer.exe`). C1 is there.
4. Show a second document (`C2`): it appears in the open page within 1 s, with no new URL line.
5. `kill -9 "$(node -p "require(process.env.HOME+'/.local/state/vadd-ui/'+require('fs').readdirSync(process.env.HOME+'/.local/state/vadd-ui')[0]+'/viewer.json').pid")"` (or find the pid with `vui viewer status`), then show `C3`. The old page says "This Viewer has stopped"; the CLI prints the new URL; opening it shows C1–C3.
6. `vui doctor` reports no `fail`.

### D. macOS, terminal in Orca

1. In Orca on macOS, open a terminal in the repo; `command -v orca` resolves.
2. Run the scenario with `--surface orca`. Expect pass.
3. `node packages/ui-cli/dist/bin.js viewer open` from a terminal outside Orca opens the default browser through `open`.

### E. SSH host with `ssh -L`

1. On the remote host: clone, `pnpm install && pnpm build`, then `echo '{"title":"E1","body":["remote"]}' | node packages/ui-cli/dist/bin.js show`. Note the port in the `vui: open` URL (47100 by default) and confirm `vui doctor` reports environment `ssh` and no URL auto-open.
2. On your machine: `ssh -N -L 47100:127.0.0.1:47100 <host>`. Open the printed URL locally: E1 is there.
3. Show E2 on the remote: it appears within 1 s. Kill the remote Viewer, show E3: the old page says it stopped; the new URL (same port if free) works through the same forward.

### F. Devcontainer with a forwarded port

1. In the container: `vui viewer start --bind 0.0.0.0` is needed only if the forward cannot reach loopback; it prints a warning on every start (§15.3). Prefer forwarding `127.0.0.1:47100` from the container (VS Code "Ports" view or `forwardPorts: [47100]` in `devcontainer.json`).
2. Show a document; open the printed URL on the host through the forwarded port; repeat the second-show and kill steps from E.
3. `vui doctor` reports environment `container`.

## Known limits recorded here

- **VD-129:** cold delivery in Orca is over 1 s because `orca tab create` takes 1.4–3.3 s today; warm delivery is 67–78 ms.
- **VD-125:** after `vui viewer stop` or an idle exit the pane id is gone, so the next show opens a new pane beside the dead one (a dead page stops its traffic). The scenario's restart uses `kill -9`, which keeps `viewer.json`.
- **VD-118:** a Windows `EACCES` port ends the port search (step A.3).
- **NAT:** not reachable on this machine (mirrored networking); step B and CI `wsl-nat`.
