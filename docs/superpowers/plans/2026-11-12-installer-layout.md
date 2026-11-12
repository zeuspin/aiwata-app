# Installer progress layout repair

User feedback: expanded runtime dependency progress adds a page scrollbar and breaks the unified installer card. The supplied screenshot remains the visual reference. This is a bounded extension, preserving the logo, colors, two-column card, language controls and native install/cancel behavior.

Reproduced before CSS changes using the real installer component and a dev-only ten-stage snapshot: at 880×620 the page content is 644px high, creating 24px overflow. The previous seven-step fake preview missed the native stage count.

Implementation choices: use a 1000×720 default native window, retain its existing 720×520 minimum, constrain the installer shell to the viewport, and allow only the right step list to scroll when space is insufficient. Keep current-step progress visible on stage/layout changes; preserve manual review during ordinary percentage updates. Scope styles to the installer so the original desktop startup screen is unaffected. Correct the caption specificity that lets generic paragraph styling override the intended smaller progress text.

Verification: compare the same ten-stage download snapshot before/after at 880×620; check the default and minimum dimensions in Simplified Chinese, Traditional Chinese and English, plus failure/success and keyboard scrolling. Run installer typecheck/build and relevant source checks. Record batch 046 and rebuild a separate DMG without touching the currently running installation. Retain only the new DMG and compact evidence; remove unpacked app staging after validation to avoid duplicate search entries. No branch, commit or push.
