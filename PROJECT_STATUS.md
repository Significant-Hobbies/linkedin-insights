# LinkedIn Archive — project status

Last updated: 2026-11-14

## Why / What

LinkedIn Archive helps people explore patterns in their own LinkedIn data export, using a browser-local workbench.

**Users:** People with an extracted LinkedIn export folder.

**In scope:** Folder/CSV import, network growth and company/role breakdowns, conversations, applications, activity, targeting labels and source diagnostics.

**Out of scope:** LinkedIn login or scraping, uploads, account sync, server storage, inferred hiring outcomes, and third-party session replay.

## Dependencies

- React and the pinned Fleet UI library, built with esbuild and Tailwind.
- Cloudflare Workers Static Assets serves static assets. Personal CSV parsing runs only in the browser.
- No database, paid API, AI provider, secret, or user account is needed by the app.

## Timeline

- 2026-11-13 — private local prototype built; owner selected dark workbench C and Instrument Sans.
- 2026-11-14 — owner authorized public release at linkedin.significanthobbies.com with visitor folder import.

## Products

- Web application: https://linkedin.significanthobbies.com
- Source: https://github.com/Significant-Hobbies/linkedin-insights

## Features

- Eleven supported source types, with inventory and diagnostics for other CSVs.
- In-memory imports, date filters, searchable and paginated tables, conversation details.
- Public build starts empty and contains no personal export or demonstration archive.

## Todo / Planned / Deferred / Blocked

- Release preparation: exact-source CI artifact publishing, independent privacy/release review, domain binding and live import verification.
- Imported data intentionally lasts only in the current tab. Refreshing starts empty.
- Missing export data is not treated as complete historical inactivity.
