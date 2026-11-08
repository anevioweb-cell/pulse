# Roadmap

- [ ] **Phase 1: Project scaffolding.** Vite + React 18 + TypeScript strict, Tailwind, folder structure, path aliases, baseline ADRs.
- [ ] **Phase 2: Tooling and quality gates.** ESLint (including import-boundary rules), Prettier, Vitest + Testing Library, Husky/lint-staged, commitlint, CI.
- [ ] **Phase 3: Design system and tokens.** Tailwind theme tokens, constants, shared UI primitives, light/dark theming, accessibility baseline.
- [ ] **Phase 4: Telemetry domain and schemas.** Zod schemas for sensor readings, devices, and WebSocket messages; inferred types; fixtures.
- [ ] **Phase 5: WebSocket client.** Connection lifecycle, validation, reconnect with backoff, heartbeat, and error handling.
- [ ] **Phase 6: Live state (Zustand).** Telemetry store, ring buffers, throttled updates, selectors, and persistence with validated `localStorage`.
- [ ] **Phase 7: Server state (TanStack Query).** REST client with Zod validation, device list and history queries, caching and invalidation.
- [ ] **Phase 8: Dashboard UI.** Device overview, live charts, status indicators, and responsive layout.
- [ ] **Phase 9: Alerts and thresholds.** Configurable thresholds, alert evaluation, notifications, and URL-synced filters.
- [ ] **Phase 10: Performance.** Render profiling, memoization strategy, list/chart virtualization, bundle analysis and code splitting.
- [ ] **Phase 11: Testing.** Unit and component coverage, WebSocket mocking, and Playwright end-to-end flows.
- [ ] **Phase 12: Polish and release.** Accessibility audit, error boundaries, docs and README, demo deployment, and ESP32 firmware notes.
