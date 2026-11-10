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
When the left list is collapsed, hovering Projects, Bots, Library, or Tasks opens that module's list in a temporary floating panel beside the rail. Clicking the icon holds the panel open for selection. Floating panels leave the current workspace layout in place.
Separate the platform-provided Skills, Connectors, and Memory modules from the first four rail items with a short horizontal rule. Keep archived conversations in the Recycle Bin at the bottom of the rail and out of the project list.
New conversations start with tools collapsed. Restore the last saved tool view at any window width. In a narrow window, open tools take the conversation's place if the left list is open. With the left list collapsed, the tools and conversation share the available width.
Open a separate account-scoped draft page for New Chat. Default to the last valid project for the global entry and to the named project for its own add button. Let users click the composer project name to change projects, create a project, or choose no project in the draft and in older empty conversations. Promote the draft to a conversation only when its first prompt is admitted.
Double-click a conversation tab to temporarily collapse the left list and right tools, and double-click again to restore them from the saved layout. Double-click a tool tab to enter or leave the workbench's complete tool view.
Keep the clicked tab under the same pointer position during either double-click layout toggle when the available title bar space allows it.
Save panel widths per account after a completed divider drag and restore them on login. Fit widths to the current window without saving those temporary adjustments.
Use short vertical rules in the title bar at the boundaries between visible workbench panes. Separate the pane bodies by background color and keep their resize hit areas visually unobtrusive.
Keep equal space between the title bar dividers and the adjacent tab strips, including when the tabs are scrolled.
Show whole conversation tabs at the edges of the strip and reserve space for their bottom corner curves.

Conversation and tool tabs each have their own close menu. Closing conversation tabs preserves their messages and drafts. Users can delete ordinary conversations from the sidebar or a conversation tab after confirming the deletion.
Use Hermes Desktop's session actions menu as the reference for conversation actions, and distinguish sidebar operations from tab operations. The project prototype excludes fork, copy, and pin actions.

Show each project's persisted color or Emoji marker in place of its folder icon in the sidebar. Conversations inherit the marker from their project and show it only in their tabs. Show conversation status separately in both the sidebar and the tab. The close button on a conversation tab appears on hover or keyboard focus.
Click the project marker in either sidebar to choose and save a replacement directly. The project name remains a separate control for expanding the group or selecting its settings.
Create projects from the conversation sidebar. In project settings, list existing projects and let users rename a selected project, manage its working directories, or remove its grouping while retaining conversations and disk files. Directory access authorization belongs to the host.
Use the operating system folder picker when creating a project on desktop and the browser directory picker in the preview. Allow multiple source folders, show the chosen folders as removable rows, and use the first remaining folder as the primary one. Keep file upload controls out of this flow. The browser preview records folder names as demo data and offers a name entry fallback when it cannot select a directory. Creating a project by itself does not create a conversation.
Place a labeled marker button beside the project name in the create dialog. Save the chosen marker with the new project, using the default color when no marker was chosen.
Conversation tabs use flat fills and show a marker in place of a leading icon. Compact tabs preserve the marker, the first visible part of the title, and the status.
Selected conversation and tool tabs use their respective pane's background and join its top edge with outward curves at both bottom corners.
The gap between tabs matches the gap below unselected tabs in both tab strips.
The title bar and left navigation rail show the same app background. Workbench pane corners are rounded only on the edge next to the left navigation rail or the right edge of the app. Adjacent panes meet at square corners. Keep a narrow inset along the bottom and right.
Use `public/aiwata-app-icon.svg` as the source for the app icon. Keep the black Bézier outline, white mark, orange square, and transparent padding from the approved reference.
Use the AIWATA app icon for the Projects navigation entry, sized to match the visible footprint of the other rail icons.
Use the horizontal vector logo in `public/aiwata-banner.svg` above the heading in empty conversations. Display the mark, orange divider, and wordmark on a transparent background.
Use the same banner when no conversation is open and on startup screens. Keep installer completion, desktop window handoff, and desktop runtime readiness separate.
The conversation list and tabs share Hermes Desktop's seven display states and precedence. Working, background, and stalled states use a rotating arc around the status dot; needs-input uses a static amber dot. Keep the indicator readable with reduced motion, and keep single-turn outcomes separate from the list state.

Open Bot editing on basic information, with separate sections for avatar and model capabilities. Keep drafts across sections and save them together. In avatar editing, keep a live preview alongside the controls, lead geometric editing with the silhouette, and separate portrait presets from custom fields. Generate ten portrait candidates with distinct hairstyles and strong hair-to-background contrast. Apply a candidate only when selected, then let the user refine it in the custom editor.
Use the rounded square Bot silhouette in black outline for Bot and group navigation. Its eyes blink or glance right at irregular intervals, with a static face when reduced motion is enabled. Stack up to four actual group member avatars tightly to the right on borderless tinted circles.

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
Persist manual disclosure states for task run histories and connector logs per account, module, and group. Scope each connector log group to its Profile and platform.
Persist each transcript's reading position per account and conversation. Follow incoming messages while the reader is at the bottom and keep the reading position while they are viewing history.

Bot private chats show their Profile identity, role and model. Keep Profile ID and capability settings under advanced settings. Link to the existing Skills, Connectors, Memory and Tasks views scoped to that Profile.
Default Bot avatars use recognizable character shapes and expressions. Derive motion from the actual private conversation or room member state. Preserve uploaded portraits and keep states recognizable with reduced motion.
Use AIWATA Desktop's New Bot silhouettes as the reference for the avatar picker. Allow independent silhouette, body color, eye color and eye shape choices with a live preview. Keep an uploaded picture available when the user switches back to a character.
Keep the geometric Bot avatar series alongside the human portraits. Human presets depict adults aged 20–40 in flat SVG layers with solid bean-shaped eyes that can animate independently.
The human avatar generator composes hair, accessories, face shape, skin tone, hair color, eye color, clothing color and background color. Allow random generation followed by individual adjustments. Persist the selected parts with the Bot.
Group conversations show their roster, routing and member activity in the conversation. Support keyboard member mentions and quoted replies within the same discussion. Keep approvals, retry, stop and continue in the conversation. Gateway-hosted group membership is set at creation; allow editing room name, purpose, notes and routing afterwards.
