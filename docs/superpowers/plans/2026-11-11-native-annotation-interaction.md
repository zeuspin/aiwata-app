# Restore AIWATA annotation interaction

User requests a faithful restoration of AIWATA's annotation interaction. Keep account-scoped screenshot storage and exact conversation/Bot/group draft routing. No commits, branches or pushes.

Source of truth: AIWATA 6631a6af2c `preview-annotate-card.tsx`, `preview-browser-bar.tsx`, `preview-pane.tsx`, and the already pinned annotation tokens/overlay.

- Replace the bottom editing form/list and large review dialog in the live browser with the original 280x44 dark pill beside the selected marker, original placement algorithm, autofocus, Enter/save-arrow and Escape/cancel behavior.
- Keep marking active after saving. Empty notes on a captured selection are supported, as in the source.
- Put blue commenting state and Add comments(count) in the toolbar. Preserve the explicit recipient requirement in a small anchored confirmation; it adds only to the pinned draft.
- Follow native reposition events and pane resize without shrinking the webpage for annotation editing.
- After successful addition, clear the active marker stack and pill; retain the saved evidence records in the account/browser store to honor persistence requirements.
- Test placement, floating editor semantics, continuing mode, empty-note captures, reposition/cancellation, and consuming a batch while retaining evidence. Verify actual Electron interaction and screenshots. Run full tests/build/Sites checks.
