# vadd-ui documentation

## Using it

| Page | Read it when |
| --- | --- |
| [Getting started](getting-started.md) | You want `vui` running and an agent using it. |
| [Component gallery](components.md) | You want to see what exists, with a document and a screenshot for each of the 24 components. |
| [Document format](format.md) | You are writing documents: envelope, shorthands, formats, statuses, limits. |
| [Embedding](embedding.md) | You are putting visuals somewhere: the Viewer, Orca chat, an HTML file, React, a web page. |
| [Agent skill](../skills/vadd-ui/README.md) | You are installing or changing what the agent is told. |

## Reference

| Page | What it holds |
| --- | --- |
| [VADD integration](vadd-ui/VADD_INTEGRATION.md) | How the VADD web dashboard embeds `<VuiView>`. |
| [Goals audit](vadd-ui/release/GOALS_AUDIT.md) | Each project goal against the code, with what is met and what is not. |
| [Runtime support](vadd-ui/release/RUNTIME_SUPPORT.md) | Browsers and Node versions. |
| [Host matrix](vadd-ui/release/HOST_MATRIX.md) | Which environments were run for real, and manual steps for the rest. |

## Project history

| Page | What it holds |
| --- | --- |
| [Decisions](vadd-ui/DECISIONS.md) | Every non-obvious choice made while building, including deviations from the original design. |
| [Tasks](vadd-ui/TASKS.md) and [progress](../PROGRESS.md) | The build plan and the report for each completed task. |
| [Release checklist](vadd-ui/release/RELEASE_CHECKLIST.md) | What is left before publishing. |

## Screenshots

The images in these pages are generated, not hand-made. The sources are in [`assets/src`](assets/src) and in the bundled corpus; after `pnpm build`, run:

```sh
node scripts/docs-screenshots.mjs          # everything
node scripts/docs-screenshots.mjs hero     # one by name
```

The Viewer screenshot is the exception: it is a capture of the live feed after `vui show` of three of those documents.
