# LinkedIn Archive

Follow ../AGENTS.md. This is a browser-only static application.

- Keep the dark workbench direction and Instrument Sans; use @saas-maker/ui.
- Never embed real exports, personal records, screenshots, or private local paths in source or release assets.
- Folder and CSV imports stay in browser memory. No upload endpoint, analytics/replay, remote content loader, or account is permitted in the analysis surface.
- Public builds start with no archive. Tests use synthetic fixtures only.
- Run pnpm check and pnpm test:browser before release. Preserve CSP and network-boundary checks.
- Production release requires clean current main, successful exact-source CI, independent CodeVetter review for privacy/import changes, and live folder-import verification.
