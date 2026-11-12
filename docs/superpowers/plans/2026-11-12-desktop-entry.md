# Unified Desktop Entry Implementation Plan

> Execute inline using superpowers:executing-plans. User has authorized continuous implementation; no new branch, commit, push or Docker.

**Goal:** publish the original native desktop as the sole daily application entry.
**Architecture:** bounded native installation transaction and ownership receipt; reuse embedded stamp, original launch readiness and repair flow.
**Tech Stack:** existing Rust/Tauri, Electron/TypeScript, original packaging shell/Python, no dependencies.
**Spec:** ../specs/2026-11-12-desktop-entry-design.md

## Global Constraints
Preserve existing data and original runtime. Default public target /Applications/AIWATA.app; tests inject a temporary target at a native helper boundary. Keep both existing bundle IDs. Only exact owned paths can be replaced. Distinguish publication, native window readiness and Agent readiness. Do not change Windows/Linux package identities.

## Review Focus
Wrong-home or foreign target; active desktop; copy/rename/receipt failure; repair cache preservation; repeated/legacy launches and failed upgrades.

### Task 1: native publication and resolution
- [x] Write filesystem contract tests for publication, receipt/home resolution, rollback and foreign target refusal; observe failure.
- [x] Add scoped desktop_entry module: copy and codesign/stamp validation, atomic bundle/receipt transaction, cached full installer, public resolver. Keep original generated executable fallback.
- [x] Wire installer launch/readiness and previous-version detection to owned published desktop. Keep snapshot activation policy.
- [x] Run Rust library suite and real signed-bundle controlled publication.

### Task 2: repair and distribution
- [x] Test owned repair-cache discovery; wire existing native repair/menu without adding renderer-owned filesystem access.
- [x] Distinctly name Mac installer and change DMG instructions/layout to open it directly; preserve other platform packaging.
- [x] Run relevant host, packaging and full affected checks. Fresh review before delivery.

### Task 3: delivery
- [x] Record batch048 and responsibility decision, refresh source inventory.
- [x] Build private candidate DMG; verify signature, archive and static renderer. Controlled native install/launch acceptance before claiming integration.
- [x] Remove temporary applications/staging. Do not change current installation or data without a reviewable verified result.

Execution notes: initial transaction/stamp tests RED→GREEN; review exposed crash gap, repair-cache replacement ordering, torn old signature and reopen race. Fix pass uses macOS atomic directory exchange + durable recovery journal, snapshot-keyed installer caches, ownership without requiring old payload health, and pre/post mutation process gates. New native tests reproduced recovery, torn repair and live legacy source deletion before fixes. Existing CLI suite's three branding/mock failures were reproduced unchanged with this addition removed; they remain separate baseline failures. No user app/data mutation.

Final verification: Rust136 passed2ignored, host34, new CLI2, script13, Electron types; static14 plus corrected footguns rerun; archive/renderer/signature checked in final048DMG. Actual native source preparation and accessory welcome/quit verified in disposable home only. Full install/public entry migration and upgrade remain explicit acceptance limits. No installed app mutation; no commit/push.
