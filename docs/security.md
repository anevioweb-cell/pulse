# Security

Security notes collected while building Pulse. Phase 7 (threat model, CSP, XSS hardening) builds on them.

## Runtime-injected styles and scripts

What ends up in the page at runtime besides our own bundled JS and CSS, and whether a strict Content Security Policy would allow it. "Strict CSP" here means:

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
connect-src 'self' wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

No `'unsafe-inline'`, and no nonces yet (Pulse is a static SPA; a nonce needs a server per response).

| Source                                                                                                     | What is injected                                                                                                                                                                                                                                                                                                                                                            | Mechanism                                                                                                                                                                                                                                                                                                                                                                      | Allowed by strict CSP?                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` (Vite build)                                                                                  | `<script src="/theme-init.js">` and `<script type="module" src="/assets/index-*.js">`. No inline scripts or styles (Vite bundles its module-preload polyfill into the JS).                                                                                                                                                                                                  | External files, same origin                                                                                                                                                                                                                                                                                                                                                    | **Yes**                                                                                                                                                                                                                                                                                                                             |
| `public/theme-init.js` (ours)                                                                              | Sets `data-theme` on `<html>` before first paint                                                                                                                                                                                                                                                                                                                            | External classic script, deliberately not inline (ADR 0005)                                                                                                                                                                                                                                                                                                                    | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Fonts (`@fontsource-variable/*`)                                                                           | `@font-face` rules inside our bundled CSS; `.woff2` files from `/assets`                                                                                                                                                                                                                                                                                                    | Build time                                                                                                                                                                                                                                                                                                                                                                     | **Yes** (`font-src 'self'`)                                                                                                                                                                                                                                                                                                         |
| Tailwind CSS                                                                                               | Nothing at runtime (classes compiled at build time)                                                                                                                                                                                                                                                                                                                         | Build time                                                                                                                                                                                                                                                                                                                                                                     | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Radix Popper (Select, Tooltip), via `@floating-ui`                                                         | `style` on the positioned wrapper: `transform`, `min-width`, CSS variables such as `--radix-select-trigger-width`, `--radix-popper-available-height`                                                                                                                                                                                                                        | React `style` prop, applied through the CSSOM (`element.style`)                                                                                                                                                                                                                                                                                                                | **Yes.** CSP restricts `style` _attributes in markup_ and `setAttribute('style')`, not CSSOM writes. React sets styles through the CSSOM on the client.                                                                                                                                                                             |
| Radix VisuallyHidden (Select's native `<select>`, Tooltip's announcement), Switch's hidden input, Presence | Inline `style` props for visually hidden or positioned elements                                                                                                                                                                                                                                                                                                             | React `style` prop (CSSOM)                                                                                                                                                                                                                                                                                                                                                     | **Yes** (same reason)                                                                                                                                                                                                                                                                                                               |
| Radix Select `Viewport`                                                                                    | A `<style>` element with fixed CSS that hides the listbox scrollbar: `[data-radix-select-viewport]{scrollbar-width:none;…}`                                                                                                                                                                                                                                                 | Inline `<style>` element rendered by React (`dangerouslySetInnerHTML` inside Radix, not our code)                                                                                                                                                                                                                                                                              | **No.** Fix options: (a) add the content's `'sha256-…'` hash to `style-src` (the content is constant, so a hash is stable per Radix version), or (b) pass `nonce` to `SelectPrimitive.Viewport`. If blocked, only a scrollbar shows in long listboxes (cosmetic).                                                                   |
| `react-remove-scroll` → `react-style-singleton` (Dialog, Select)                                           | A `<style>` element in `<head>` while a modal is open: `body { overflow: hidden !important; padding-right/margin-right: <scrollbar width>px }`                                                                                                                                                                                                                              | `document.createElement('style')`, content computed at runtime                                                                                                                                                                                                                                                                                                                 | **No.** The content is dynamic (scrollbar width), so a hash does not work. Options: a nonce through `get-nonce`'s `setNonce()` (needs a server-generated nonce), or accept degradation: if blocked, the page behind an open dialog can still scroll a little and may shift. Wheel and touch blocking (event listeners) still works. |
| `aria-hidden` (Dialog)                                                                                     | `aria-hidden="true"` on sibling elements while the dialog is open                                                                                                                                                                                                                                                                                                           | DOM attributes                                                                                                                                                                                                                                                                                                                                                                 | **Yes** (not style or script)                                                                                                                                                                                                                                                                                                       |
| lucide-react                                                                                               | Inline `<svg>` elements with presentation attributes (`stroke`, `stroke-width`), no `style`                                                                                                                                                                                                                                                                                 | React elements                                                                                                                                                                                                                                                                                                                                                                 | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Radix DropdownMenu (devices column menu), via `@floating-ui`                                               | Same positioned-wrapper `style` and CSS variables as Select and Tooltip                                                                                                                                                                                                                                                                                                     | React `style` prop (CSSOM)                                                                                                                                                                                                                                                                                                                                                     | **Yes** (same reason)                                                                                                                                                                                                                                                                                                               |
| Devices table spacer rows (ours)                                                                           | `element.style.height` on two `aria-hidden` spacer rows around the virtualized window                                                                                                                                                                                                                                                                                       | CSSOM write in a layout effect (no `style` prop; ADR 0022)                                                                                                                                                                                                                                                                                                                     | **Yes** (CSSOM)                                                                                                                                                                                                                                                                                                                     |
| uPlot (`TimeSeriesChart`, device page charts, Phase 5B)                                                    | Inline `style` on its own elements: `transform` on the cursor lines and point, `width`, `height` and `margin` on the cursor point, `background` and `border` on legend markers (the legend is off), canvas and layer sizes. Its stylesheet `uplot/dist/uPlot.min.css` and our token overrides (`time-series-chart.css`) are bundled CSS files in the lazy device-page chunk | `element.style.*` assignments in uPlot (13 sites, read in `uplot@1.6.32` `dist/uPlot.esm.js`), so CSSOM. uPlot creates only `div`, `canvas` and (legend only) `table` elements, never `<style>` or `<script>`, and contains no `innerHTML`, `insertAdjacentHTML`, `eval` or `new Function` (searched in the same file). Our tooltip writes `textContent` and `style.transform` | **Yes** (CSSOM, and the stylesheets are `'self'`). It listens to window `resize` and `scroll`, a `matchMedia` pixel-ratio query and pointer events on its plot; `destroy()` removes them, and `TimeSeriesChart` calls it on unmount                                                                                                 |
| Our components (`src/shared/ui`)                                                                           | No `style` props, no `dangerouslySetInnerHTML`, no injected `<style>` or `<script>` (enforced by ESLint)                                                                                                                                                                                                                                                                    | n/a                                                                                                                                                                                                                                                                                                                                                                            | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Storybook                                                                                                  | Many inline styles and scripts                                                                                                                                                                                                                                                                                                                                              | Dev and docs tool only                                                                                                                                                                                                                                                                                                                                                         | Not shipped: `storybook-static/` is a separate build, and nothing from Storybook is in `dist/` (verified: no `storybook` string in the app bundle). Host it under its own, looser CSP if published.                                                                                                                                 |

### Implications for Phase 7

- The app shell is compatible with `script-src 'self'` today.
- `style-src 'self'` alone breaks two library behaviors (Select's scrollbar hiding, the Dialog and Select scroll lock). The realistic choices are:
  1. `style-src 'self' 'sha256-<select viewport css>'` and accept the scroll-lock degradation;
  2. serve `index.html` with a per-request nonce (needs an edge function or server) and call `setNonce()` before rendering;
  3. `style-src 'self' 'unsafe-inline'`. Style injection is a much smaller risk than script injection, but it still allows CSS-based data exfiltration if an attacker can inject markup.
- Decide in a Phase 7 ADR. Add a CSP test (Playwright, Phase 9) that opens a Dialog and a Select under the chosen policy and checks for violation reports.

## URL and preference input (Phase 5A)

The query string, route parameters and the stored app preference come from outside the app (a pasted link, another tab, an extension, a tampered profile) and are parsed like network input.

- **Route parameters.** `/devices/:id` is checked by a loader with the REST contract's `deviceIdSchema` (letters, digits, `._:-`, at most 64 characters, never `__proto__`, `constructor` or `prototype`). Anything else is a 404 before a component, query key or request sees it. Tested with prototype keys, encoded paths, markup and over-long ids, in jsdom and in Chromium against the production build.
- **Table view state** (`features/devices/model/table-url-state.ts`):
  - only the four known keys (`sort`, `q`, `status`, `hide`) are read, with `URLSearchParams.getAll`, and nothing from the URL is ever used as an object key;
  - a key that is repeated, or longer than 256 characters, is ignored;
  - each field is checked with zod/mini (enums for columns and statuses, a regex for the sort, a 64-character cap for the search, unique hideable columns), and an invalid field falls back to its own default;
  - control and bidi characters are stripped from the search, which is only ever rendered as text;
  - writes rebuild the query string from the parsed state, so unknown keys are dropped.

  `table-url-state.test.ts` covers a table of 26 hostile inputs (including `__proto__` as key and value, duplicates and malformed percent-encoding) plus a 1 MB query string.

- **Device page view state** (Phase 5B, `features/devices/model/detail-url-state.ts`): the same approach with the shared single-value helper. Only `range` and `metric` are read; a repeated value, or one longer than 32 characters, is ignored; `range` must be one of `live`, `5m`, `1h`, `24h` and `metric` one of the five metric names (zod/mini enums), otherwise each falls back to its default. Neither is ever used as an object key: the range reaches the messages and config through `switch` functions. `detail-url-state.test.ts` covers 19 hostile inputs (prototype keys, markup, control and bidi characters, duplicates, malformed percent-encoding) and a 1 MB query string; in Chromium, `?range=forever&metric=__proto__` and `?range=%3Cscript%3E` on the production build gave the defaults.
- **Chart text.** Device names, rule thresholds and values reach the canvas only through `fillText` and the tooltip only through `textContent`, so they are never parsed as markup.
- **Live URL input.** The data-source dialog trims the URL and caps it at 2048 characters, then applies the transport's `validateWebSocketUrl` (only `ws:` and `wss:`, no user name or password). A rejection is shown on the field (`aria-invalid`, `aria-describedby`, focus moved to it) and changes nothing. The REST base is derived from the accepted URL's origin only (path and query dropped). The WebSocket transport validates again, as before.
- **Stored preference** (`pulse.preferences` in localStorage): every access is in try/catch; the record is capped at 4096 characters before parsing, parsed without prototype keys, checked against a strict versioned schema, and its URL against the transport's rule. Anything invalid gives Demo Mode with the default URL (tested with 10 malformed records, a throwing storage and no storage).

## WebSocket input

Everything received over a WebSocket (and from the simulator worker, which goes through the same path) is untrusted: a device can be buggy, compromised or impersonated, and anyone on the network can connect to the server. Defenses, in the order a frame meets them:

1. **URL validation before connecting:** only `ws:` and `wss:` URLs, and no credentials embedded in the URL. Anything else fails before a socket is constructed (`validateWebSocketUrl`).
2. **Transport limits** (`WebSocketTransport`, values in `src/features/telemetry/config.ts`):
   - binary frames are dropped;
   - frames over 4096 UTF-8 bytes are dropped before any parsing;
   - frames beyond 200 per second are dropped (fixed one-second window).

   Every drop is counted (`getStats()`), so floods are visible rather than silent. The outgoing queue is bounded (32 frames, oldest dropped).

3. **Parser** (`parseTelemetryMessage`, ADR 0011): it never throws and returns a typed failure reason. JSON syntax errors (including `NaN`/`Infinity`) are rejected, then forbidden keys, wrong version or type, extra keys, wrong types and out-of-range numbers.
4. **Prototype pollution:**
   - The `JSON.parse` reviver rejects `__proto__`, `constructor` and `prototype` keys at any depth.
   - Device ids must match `[A-Za-z0-9._:-]{1,64}` and may not be one of those three names.
   - Device-keyed state (Phase 3B) uses `Map`, never plain objects as dictionaries. Validated objects are never merged into existing objects with `Object.assign` or spread from untrusted keys.
5. **Strings shown in the UI:**
   - Names and locations are length-capped, then stripped of control characters, bidi overrides ("Trojan Source"-style spoofing) and line separators.
   - React escapes text by default, and `dangerouslySetInnerHTML` is banned by ESLint. A device name like `<img onerror=…>` renders as text.
   - Failure details never echo attacker-provided strings (for example, only numeric versions are echoed).
6. **Mock server** (`server/`, dev only):
   - **Exposure:** binds to `127.0.0.1` by default and warns when bound elsewhere.
   - **Frame and rate limits:** `maxPayload` of 4096 bytes (close 1009); 20 inbound frames per second per client (close 1008).
   - **Compression:** off (no decompression bombs).
   - **Slow consumers:** frames are dropped once more than 1 MiB is buffered for a client, so the server cannot run out of memory.
   - **Dead clients:** protocol pings every 30 s, and clients that don't answer are removed.
   - **Relay mode:** inbound frames go through the same parser. When relaying is on, the server forwards the re-encoded, sanitized message, never the raw bytes.
   - **CLI options:** validated with zod/mini.
7. **Firmware** (`firmware/esp32-telemetry`): `config.h` with Wi-Fi credentials is git-ignored and only `config.h.example` with placeholders is committed. The sample uses plain `ws://` for the local mock server. Production needs `wss://` and device authentication (Phase 10).

**Not covered yet:**

- **Device authentication:** any client that can reach the server can claim any device id.
- **Replay protection** (old `ts`/`seq` values are accepted).
- **Per-device rate limits** on the dashboard side. These are threat-model items for Phase 7, and server-side work for Phase 10.

## REST input

The mock server's REST API (`server/rest/`) treats every request as hostile, and both API clients validate what comes back. Limits are in `MOCK_SERVER` and `API` (`src/features/telemetry/config.ts`) and `HTTP` (`src/shared/api/config.ts`). The checks below run in this order on every request (`server/rest/router.ts`):

1. **URL length:** URLs over 2048 characters get `414 uri_too_long` before anything is parsed.
2. **CORS allowlist:** a request whose `Origin` is not on the allowlist gets `403 forbidden_origin` before routing, so it cannot even probe which paths exist (no 404s). Details:
   - Origins are matched exactly: no wildcards, no patterns, no suffix matching. The default list is `http://localhost:5173` and `http://127.0.0.1:5173`. `--origin` adds more, and the CLI accepts only bare `http(s)://host[:port]` origins.
   - An allowed origin is echoed in `Access-Control-Allow-Origin`, with `Vary: Origin`. Credentials are never allowed (no `Access-Control-Allow-Credentials`).
   - Preflights allow `GET, POST, PUT, DELETE` and only the `Content-Type` header, cached for 600 s.
   - Requests without `Origin` (curl, devices, Node tools, same-origin GETs) are allowed: browsers always send `Origin` on cross-origin requests, so a missing `Origin` cannot be a cross-site browser request.
3. **Rate limit:** 50 requests per second per client address, in a fixed one-second window. Excess requests get `429 rate_limited` with `Retry-After`. At most 1024 client windows are tracked, and the oldest are evicted, so spoofing many addresses cannot grow memory. Note that the limiter keys on the socket address: behind a proxy, every client would share one window.
4. **Path:** segments are percent-decoded, and malformed encoding is a `400`. An unknown path is `404 not_found`, and a known path with the wrong method is `405` with an `Allow` header. Ids are validated with the contract schemas (`[A-Za-z0-9._:-]{1,64}`, no `__proto__`, `constructor` or `prototype`), so `..%2F..%2Fetc%2Fpasswd` is a 400, not a lookup.
5. **Query string:** parsed into a null-prototype record. A repeated parameter (parameter pollution) is a 400. Endpoints without parameters reject any query string, and the others use strict schemas (unknown parameters are errors):
   - readings: `from` and `to` are integer timestamps with `to > from` and a range of at most 7 days; `metric` is one of the five metrics; `maxPoints` is 2 to 2000 (default 500);
   - alerts: a range of at most 24 h, and `limit` is 1 to 500 (default 100).
6. **Body** (POST and PUT on alert rules):
   - `Content-Type` must be `application/json`, otherwise `415`.
   - A declared `Content-Length` over 2048 bytes gets `413` without reading the body. A streamed body is counted and cut off at the same limit (`413`, `Connection: close`).
   - JSON is parsed with the prototype-safe parser, so `__proto__`, `constructor` and `prototype` keys are rejected at any depth.
   - The rule schema is strict: an `id` in the body is an error, because ids are server-generated UUIDs. Names are capped at 64 characters and stripped of control and bidi characters. The threshold must be inside the metric's sensor range. At most 50 rules exist (`409 limit_reached`).
7. **Fault injection:** a test-only switch, **off by default**. It is enabled only by `--faults` or `PULSE_FAULTS` (for example `latency=300,failure=0.25,status=503`). The spec is parsed strictly: unknown or repeated keys, latency over 30 s, a failure rate outside 0 to 1, or a status outside 500 to 503 stop the server from starting. When it is on, the server logs `REST fault injection ENABLED` at startup, and injected failures carry the code `injected_fault`, so they can never pass for real errors. A test checks that it is off by default.

**Error envelope.** Every failure is `{"error": {"code", "message", "issues"?}}`, with a code from a closed list (`errorCodeSchema` in `contract.ts`) and a fixed message.

- **Issues:** at most 10 `{path, code}` pairs, built from schema paths and Zod issue codes. Rejected values are never echoed.
- **Exception:** the name of a repeated query parameter is echoed as the issue's `path`. It is length-capped by the URL limit, JSON-encoded, and served as `application/json` with `nosniff`, so it cannot become markup. The UI must still render it as text.
- **Internal errors:** a `500` with a generic message. The detail is logged on the server only.

**Security headers.** Every response carries:

- `Content-Type: application/json; charset=utf-8`
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- `Referrer-Policy: no-referrer`

**WebSocket Origin check.** Browsers do not apply CORS to WebSocket upgrades, so the server checks `Origin` itself, against the same allowlist (cross-site WebSocket hijacking). An upgrade with a disallowed `Origin` is refused by `ws` with `401 Unauthorized`. Upgrades without `Origin` are allowed, because those clients (devices, the probe CLI) are not browsers. An allowed and a disallowed `Origin` are tested in `rest-api.test.ts`, and the other server tests connect without one. The curl smoke test in [performance.md](performance.md#smoke-test-against-the-running-server) shows them.

**Client side.** `HttpTelemetryApi` validates the following before a request leaves (`validation`/`invalid_request`, no request sent):

- ids, query parameters and bodies, with the same contract schemas the server uses;
- path segments, which are also percent-encoded.

The fetch wrapper (`createHttpClient`) then treats the response as untrusted:

- it has a 10 s timeout;
- it refuses bodies over 512 KiB, whether declared or streamed;
- it requires `application/json`;
- it parses JSON without prototype keys and validates the result against the contract schema;
- it cuts error messages to 200 characters and keeps at most 10 issues.

`DemoTelemetryApi` runs the same input checks and validates its own output against the same schemas. The shared contract suite (`server/telemetry-api-contract.test.ts`) proves that both implementations fail the same way.

**Not covered yet:**

- **Authentication and authorization:** the mock server is a loopback dev tool. Phase 10 decides authentication for a real backend.
- **CSRF:** requests without `Origin` are allowed, and the API uses no cookies, so there is no ambient credential to abuse. This must be revisited if a real backend adds cookie sessions.

## Persisted data is untrusted

The IndexedDB query cache (`src/shared/api/persistence.ts`, ADR 0017) is read back as untrusted input, like a network response. Anything with access to the origin can write it: another tab running an older build, a browser extension, devtools, a corrupted profile. Restore, in order:

1. **Type and size:** the stored value must be a string. Anything over 1 MiB (checked as characters, then as UTF-8 bytes) is discarded before parsing.
2. **Parsing:** the prototype-safe JSON parser rejects `__proto__`, `constructor` and `prototype` keys at any depth.
3. **Migration:** only versions with a known migration path are upgraded (v1 to v2 today). Each migration validates its own input, and unknown versions are discarded.
4. **Record schema:** a strict v2 record schema. The record's buster must match the build's (`API.PERSISTED_CACHE_BUSTER`), so data written for another response shape is never validated against the wrong schema.
5. **Per entry:**
   - the key must be JSON-safe (strings, numbers, null, flat records);
   - the persist policy accepts only three resources (device list, readings, alert rules), and only for the current mode;
   - each entry's data is validated with the same strict, length-capped contract schemas used for network responses;
   - entries older than 24 h or dated in the future are skipped, and at most 50 entries are read.
6. **Failures:** an invalid record is deleted, and an invalid entry is skipped while the rest are restored. Restore never throws. A read or write that takes more than 2 s, or fails (quota, blocked database), switches the session to memory-only, silently.

The same rules protect the second persisted record, Demo Mode's alert rules (`pulse-demo` database, ADR 0018):

- the value must be a string of at most 32 KiB, checked before parsing;
- it is parsed without prototype keys and checked against a strict schema: version 1, at most 50 rules each validated by the REST `alertRuleSchema`, and unique ids;
- an invalid record is deleted and the default rules are used;
- read or write failures fall back to memory-only, silently.

What is stored:

- **Never stored:** live readings, device detail and alert history.
- **Nothing secret:** these resources contain no secrets, and none may be added to the persist policy.
- **Per-mode records:** demo and live data are kept in separate records (`telemetry.demo` and `telemetry.live`). The mode is also checked per key, so demo data can never be restored into Live Mode.

**Limitation:** validation proves the data is well-formed, not that it is genuine. There is no signature, because a key in the same origin would not stop anyone who can already write its IndexedDB. Well-formed forged data would be shown until it is refetched:

- the device list and alert rules are refetched as soon as they are stale (60 s and 5 min after the forged `updatedAt`);
- a past readings range is fresh forever, so a forged one would be shown until it is garbage-collected or the 24 h restore window passes.

An attacker who can write the origin's storage can usually run script in it as well, which is the bigger problem (Phase 7, CSP).

## Service worker

The service worker (`sw.js`, generated by vite-plugin-pwa, ADR 0020) runs with the power to answer any request in its scope, so it is kept as small and as inert as possible:

- **Scope and origin:** scope `/`, served from the app's own origin. Workbox is inlined, so the worker never calls `importScripts`, from any origin (tested on the generated file).
- **What it caches:** only the precached app shell (same-origin build output, listed at build time). It has no runtime caching:
  - REST responses, WebSocket traffic and every cross-origin request (including user-provided Live Mode servers) are never cached or answered by it;
  - navigations fall back to the cached `index.html`, except paths under `/api`;
  - a test asserts that the precache contains no `/api`, `ws:`, cross-origin or source-map entries.
- **Updates:** a new worker waits until the user chooses "Reload now" (`SKIP_WAITING` message only, no `clients.claim()`). A compromised or buggy new build therefore never takes over open tabs silently. It activates once no tab uses the old version, like any waiting worker.
- **Registration:** production builds only. Development, tests and Storybook never register a worker. A registration failure leaves the app working online.
- **Kill switch:** if a bad worker ships, build with `PULSE_SW_KILL=1`. vite-plugin-pwa's `selfDestroying` emits a `sw.js` that unregisters itself and deletes its caches. Browsers check `sw.js` on navigation, bypassing the HTTP cache for at most 24 h, so clients drop the bad worker on their next visit. The script URL must keep resolving, never a 404, because a missing script leaves the old worker in place.

### CSP implications for Phase 7

- `worker-src 'self'`: `sw.js` and the simulator Web Worker are same-origin files. No `blob:` and no CDN.
- `manifest-src 'self'`: `/manifest.webmanifest` is same-origin.
- `img-src 'self'`: the icons are same-origin PNGs.
- `script-src 'self'`: the registration code and workbox-window are lazily loaded same-origin chunks, and the worker loads no scripts.
- `connect-src`: the worker adds no requests of its own beyond fetching precache entries from the origin.
