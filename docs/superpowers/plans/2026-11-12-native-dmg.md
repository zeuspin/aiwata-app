# Native renderer DMG

User request: package the current aiwata-app frontend in the existing AIWATA Mac installer. No branch, commit, push, installed-app replacement, runtime-provider change or user-data migration.

Use the existing private bootstrap DMG, original native host and backend. Compile the external renderer at packaging time, embed its static files in the integrity-checked source archive, and consume those files during installed desktop compilation. Never ship a dependency on a developer checkout path. Keep the development renderer selection unchanged.

1. Add a failing archive test proving missing renderer failure, portable descriptor and artifact inclusion, source descriptor preservation and private-file rejection.
2. Add the compiled renderer snapshot and native build consumer; make the bootstrap command compile it automatically. Check archive and consumer behavior.
3. Build a private arm64 ad-hoc signed DMG with existing Rust/PM tools; verify image, mounted signature, archive contents and installed build consuming only the embedded renderer.
4. Record exact evidence and remaining first-install/Gatekeeper/notarization limits in AIWATA maintenance batch 045; refresh source inventory. Deliver local DMG without installing over the active instance.
