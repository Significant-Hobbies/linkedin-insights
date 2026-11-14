import { defineConfig } from "cf/config";

export default defineConfig({
  accountId: "7d048325699a5acddb44d3be31cf6ba9",
  worker: {
    name: "linkedin-insights",
    compatibilityDate: "2026-11-14",
    domains: ["linkedin.significanthobbies.com"],
    workersDev: false,
    assets: { htmlHandling: "auto-trailing-slash", notFoundHandling: "404-page" },
    // Assets-only service: no user code, upload handler, request logs or traces.
    observability: { enabled: false }
  }
});
