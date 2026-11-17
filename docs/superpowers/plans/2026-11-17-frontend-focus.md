# Frontend focus repair implementation plan

> For agentic workers: execute inline using the approved three-fix scope; no new branches, commits or pushes.

**Goal:** Repair dialog focus restoration, menu activation focus, and composer focus visibility while preserving the existing UI and interaction contracts.
**Architecture:** Keep native dialogs and the existing React menu. Close native dialogs in layout cleanup before React removes their DOM; restore menu trigger focus before the selected command takes over; strengthen the current composer border and provide a system-color outline in forced colors.
**Tech Stack:** React 19, CSS, Electron 44.9.3, Node test runner, existing esbuild and Playwright.
**Spec:** The user's approved three findings from this chat; source locations management-ui.jsx, tab-controls.jsx and styles.css.

## Constraints and review focus

- Keep layout, labels, confirmation behavior, saved data and existing navigation unchanged.
- Preserve saving guards, menu-created dialog focus, navigation destination focus and outside-click focus.
- Apply the native dialog cleanup to sibling modal paths with the same unmount behavior; preserve the Bot drawer's existing explicit return-focus policy.
- Use an isolated hidden Electron fixture, block network, create no Agent runtime, and close it on success/failure.
- Keep native focus tests separate as `npm run test:focus`; the normal Node suite does not require an extra GUI process.

## Tasks

- [x] 1. Run the new real-component native regression tests against the unchanged implementation; record the intended failing assertions.
- [x] 2. Repair dialog lifecycle and its sibling paths. Verify Esc, close, cancel, save and saving protection.
- [x] 3. Restore focus before menu command activation. Verify ordinary commands, dialog handoff, navigation, arrows, Esc and outside clicks.
- [x] 4. Strengthen the composer focus border using the existing accent; provide a forced-colors outline without layout shifts. Verify contrast, geometry, composition events and Enter behavior.
- [x] 5. Run the full frontend suite, Sites tests, frontend build and native focus tests. Review the diff and update maintenance records/fingerprints. Do not install the app.

## Execution evidence

Initial native assertions: 10/13 failed as expected, and all 3 added sibling-modal checks failed. Final native run: 18/18; existing suite: 595/595; Sites: 4/4; browser and native renderer builds: passed. The existing jsdom helper needed its missing close method. Independent review found no important regression; nested Bot dialog and Promise rejection checks were subsequently added and passed. Production RAF close callbacks, installed-app end-to-end, real IME and assistive technologies remain outside these component checks.
