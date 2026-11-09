# Roadmap

- [x] Phase 0: Project rules and workflow
- [x] Phase 1: Foundation and tooling
- [x] Phase 2: Design system
  - [x] 2A: Tokens, theming, typography
  - [x] 2B: Components and Storybook
- [ ] Phase 3: Architecture and data flow (WebSocket transport, simulator Web Worker, mock server, Zustand ring buffers)
- [ ] Phase 4: Caching and offline (TanStack Query, IndexedDB persistence, service worker)
- [ ] Phase 5: Dashboard features (charts, devices table, alerts, settings)
- [ ] Phase 6: Performance
- [ ] Phase 7: Security (threat model, CSP, XSS hardening)
  - Note: CI must run `npm audit --omit=dev` (production dependencies only). The current 11 moderate findings are all dev-only: a `minimatch` advisory inside `typescript-eslint` (see [ADR 0002](adr/0002-tooling-versions-and-import-boundaries.md)) and a `glob` advisory inside Storybook's docgen plugin. Runtime-injected styles that affect the CSP are listed in [security.md](security.md).
- [ ] Phase 8: Accessibility and i18n (EN/FR/AR with RTL)
- [ ] Phase 9: Testing
- [ ] Phase 10: CI/CD and deployment
- [ ] Phase 11: Documentation
- [ ] Phase 12: Final polish
