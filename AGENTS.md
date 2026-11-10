# Prototype Instructions

Continue frontend development in `zeuspin/aiwata-app`. Keep this repository independent of the AIWATA agent and installer source trees.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

The production app will call Hermes services. For each feature that requires backend behavior, verify the required capabilities against the interfaces and behavior of the Hermes version the project will use. Tell the user when a feature requires a capability Hermes does not provide, which part is missing, and where it would need to be implemented. Identify mock behavior and unverified service support explicitly. Features handled entirely by the frontend do not require Hermes API support.

The reference desktop layout keeps the tool tab strip entirely within the tool pane's header. Tabs shrink to a readable minimum width, then scroll horizontally when the pointer is over the strip and the wheel moves. Hovering a tool tab displays a thumbnail rendered from the same session-scoped tool data as the main panel.

The workbench title bar has a sidebar toggle on the left and tool controls on the right. Back and forward controls belong inside the browser tool. In the desktop host, native window controls share the workbench's top row and follow the operating system's conventions on macOS and Windows.
The left list defaults to collapsed in narrow windows until the account has a saved preference. Opening it uses the normal split layout and slides the conversation area aside.
New conversations start with tools collapsed. Restore the last saved tool view at any window width. In a narrow window, open tools take the conversation's place if the left list is open. With the left list collapsed, the tools and conversation share the available width.
Save panel widths per account after a completed divider drag and restore them on login. Fit widths to the current window without saving those temporary adjustments.

Conversation and tool tabs each have their own close menu. Closing conversation tabs preserves their messages and drafts. Users can delete ordinary conversations from the sidebar or a conversation tab after confirming the deletion.
Use Hermes Desktop's session actions menu as the reference for conversation actions, and distinguish sidebar operations from tab operations. The project prototype excludes fork, copy, and pin actions.

Project conversations share one persisted color or Emoji marker across the sidebar and their tab. Conversation status occupies a separate slot in both places. The close button on a conversation tab appears on hover or keyboard focus.
Conversation tabs use flat fills and show a marker in place of a leading icon. Compact tabs preserve the marker, the first visible part of the title, and the status.
Selected conversation and tool tabs use their respective pane's background and join its top edge with outward curves at both bottom corners.
The gap between tabs matches the gap below unselected tabs in both tab strips.
The title bar and left navigation rail show the same app background. Workbench pane corners are rounded only on the edge next to the left navigation rail or the right edge of the app. Adjacent panes meet at square corners. Keep a narrow inset along the bottom and right.
Use `public/aiwata-app-icon.svg` as the source for the app icon. Keep the black Bézier outline, white mark, orange square, and transparent padding from the approved reference.
Use the horizontal vector logo in `public/aiwata-banner.svg` above the heading in empty conversations. Display the mark, orange divider, and wordmark on a transparent background.
Use the same banner when no conversation is open and on startup screens. Keep installer completion, desktop window handoff, and desktop runtime readiness separate.
The conversation list and tabs share Hermes Desktop's seven display states and precedence. Working, background, and stalled states use a rotating arc around the status dot; needs-input uses a static amber dot. Keep the indicator readable with reduced motion, and keep single-turn outcomes separate from the list state.

Keep the workbench runnable in pure mock mode. Use the checked-out AIWATA interface as the integration target for Hermes-backed features. Keep application identity and credits in the AIWATA product layer. Account data and panel widths are local and account-scoped. Lock the workspace while signed out or offline and pause admission on logout. Document which interactions require a native host or additional API work.

Keep the mock Agent transport scoped to the signed-in workspace. Settle abandoned runs as interrupted and preserve partial output, drafts and queued messages. Fill a demo prompt only into an empty draft. Keep Agent requests and their action buttons visible above the message queue without depending on transcript scroll position.
Store local attachment contents in IndexedDB by account and conversation. Drafts, queued prompts, and sent messages reference the same file. Read the contents before admitting a mock prompt, and keep the draft or queue entry if reading fails.

Persist the mock browser's last page, back and forward history, saved annotations, and Agent replay state per account and conversation. Carrying an annotation into the Agent draft keeps the saved annotation on its page.
Autosave each webpage's unsent annotation text and target per account and conversation. Submitting an annotation clears only that page's draft.

Autosave canvas notes, image retouch settings, and clip trim bounds and playhead per account and conversation. Restore the clip preview paused after sign-in.
Autosave the AI video editor's provider, source URL, and description per account and conversation.

Autosave image generation drafts and the latest result, mock terminal command history and output, and mock Git worktrees and their separate staging states per account and conversation.

Autosave the Files & Artifacts filter and selected file per account and conversation. If the saved selection is unavailable, preview the first file in the current filter or show the empty state.
Restore file and Git diff reading positions by file, with a separate Git position per worktree. Keep a separate reading position for the conversation's terminal output and follow new output while at the bottom.

Persist open tool tabs, their order, the active tab, and the collapsed, split, or full tool view per account and conversation. Responsive layout changes only how the saved view is displayed.

Persist the selected navigation module, sidebar visibility, and collapsed project groups per account.
Persist the selected sidebar item or conversation, sidebar search, and list scroll offset separately per account and module.
Persist main-page search, scroll offset, and selected Profile separately per account and module. Use the default Profile if the saved Profile is unavailable.
Persist manual disclosure states for archived conversations, task run histories, and connector logs per account, module, and group. Scope each connector log group to its Profile and platform.
Persist each transcript's reading position per account and conversation. Follow incoming messages while the reader is at the bottom and keep the reading position while they are viewing history.
