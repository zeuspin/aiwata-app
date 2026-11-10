# Hermes session status implementation plan

**Goal:** Give the conversation list and tabs the same seven display states and precedence as the local Hermes Desktop source.

**Design:** Derive one state per conversation from the mock turn, unread flag, and optional Hermes activity signals. Keep the marker independent. Use a static dot for each state and a rotating arc for working, background, and stalled; respect reduced motion.

**Scope:** The existing isolated React prototype. Hermes remains read-only. The mock send/finish path exercises the common transitions; approval, background activity, and stall signals are covered using controlled data until the service is wired in.

- [x] Update the workspace behavior tests for draft, working, idle, unread, and the priority of overlapping activity signals. Confirm the old implementation fails.
- [x] Implement the shared status resolver and mock turn transitions. Replace the old status icons in both surfaces via their shared component.
- [x] Verify state parity, animation, reduced motion, and the mock reply flow in Chromium. Run the prototype tests and build.
