# LinkedIn Archive

Explore a LinkedIn data export without uploading it. Open an extracted export folder or choose CSV files to see network, conversation, application, activity and targeting insights.

Public app: https://linkedin.significanthobbies.com

## Run locally

Requires Node 22.18+ and pnpm 10.33.2.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

The development server serves the public build at http://127.0.0.1:8793.

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

Browser tests generate synthetic CSV fixtures. No private export is required.

## Privacy boundary

The site ships with no archive. File selection reads CSVs using browser File APIs, and the parser returns only supported fields. Imports remain in memory. Clearing the archive or refreshing removes that tab's analysis. No upload endpoint, analytics, replay, remote script, or browser storage is used.

The initial page downloads same-origin application assets. After import, analysis does not need any network request. External profile and job links open only when the user clicks them. The public start screen's shared Ask AI links describe the product, never the imported archive.

## Deployment

`pnpm deploy` verifies clean, synchronized main and successful CI before publishing static `dist/` assets to the `linkedin-insights` Cloudflare Pages project. The custom domain is `linkedin.significanthobbies.com`. There are no Pages Functions or storage bindings.

The private local prototype and its export are not part of this repository or release.
