# Preview console and DevTools

Restore AIWATA native toolbar controls. Remove Agent replay from the toolbar. User wants to understand/use a compact preview console and a button opening DevTools. Keep work uncommitted, use current branch, no containers.

- Follow AIWATA 6631a6af2c preview-browser-bar / preview-console: terminal glyph for collapsed console, bug glyph for DevTools, no replay robot.
- Console shows real current guest logs/warnings/errors and main-frame load failures, source and line. Keep at most 200 bounded entries / 512KiB, per login/account/conversation/browser, memory-only. Reset page logs on navigation. Preserve logs during same-tab remount; discard on closed instances/login replacement. Show selectable rows, copy, clear, and add selected logs to the exact owner's draft without submitting. Do not evaluate arbitrary code in this compact panel.
- Use a bottom overlay (240px default) with height drag and double-click-to-minimize matching native behavior. Preserve reading position while away from the bottom.
- DevTools opens/detaches only the current account's owned webview through a narrow, validated native command. Actual guest opened/closed events drive active state. Never attach application renderer or another account's guest.
- Test log normalization/limits/isolation, stale draft targets, and native ownership/command guards. Verify real console toggle / empty state, DevTools open-close and selected log insertion in desktop where available; run tests/build/Sites checks. Document the console captures webpage runtime output, not backend terminal logs or a full Network inspector.
