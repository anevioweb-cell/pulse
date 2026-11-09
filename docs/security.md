# Security

Security notes collected while building Pulse. Phase 7 (threat model, CSP, XSS hardening) builds on them.

## Runtime-injected styles and scripts

What ends up in the page at runtime besides our own bundled JS and CSS, and whether a strict Content Security Policy would allow it. "Strict CSP" here means:

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
connect-src 'self' wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

No `'unsafe-inline'`, and no nonces yet (Pulse is a static SPA; a nonce needs a server per response).

| Source                                                                                                     | What is injected                                                                                                                                                           | Mechanism                                                                                         | Allowed by strict CSP?                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` (Vite build)                                                                                  | `<script src="/theme-init.js">` and `<script type="module" src="/assets/index-*.js">`. No inline scripts or styles (Vite bundles its module-preload polyfill into the JS). | External files, same origin                                                                       | **Yes**                                                                                                                                                                                                                                                                                                                             |
| `public/theme-init.js` (ours)                                                                              | Sets `data-theme` on `<html>` before first paint                                                                                                                           | External classic script, deliberately not inline (ADR 0005)                                       | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Fonts (`@fontsource-variable/*`)                                                                           | `@font-face` rules inside our bundled CSS; `.woff2` files from `/assets`                                                                                                   | Build time                                                                                        | **Yes** (`font-src 'self'`)                                                                                                                                                                                                                                                                                                         |
| Tailwind CSS                                                                                               | Nothing at runtime (classes compiled at build time)                                                                                                                        | Build time                                                                                        | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Radix Popper (Select, Tooltip), via `@floating-ui`                                                         | `style` on the positioned wrapper: `transform`, `min-width`, CSS variables such as `--radix-select-trigger-width`, `--radix-popper-available-height`                       | React `style` prop, applied through the CSSOM (`element.style`)                                   | **Yes.** CSP restricts `style` _attributes in markup_ and `setAttribute('style')`, not CSSOM writes. React sets styles through the CSSOM on the client.                                                                                                                                                                             |
| Radix VisuallyHidden (Select's native `<select>`, Tooltip's announcement), Switch's hidden input, Presence | Inline `style` props for visually hidden or positioned elements                                                                                                            | React `style` prop (CSSOM)                                                                        | **Yes** (same reason)                                                                                                                                                                                                                                                                                                               |
| Radix Select `Viewport`                                                                                    | A `<style>` element with fixed CSS that hides the listbox scrollbar: `[data-radix-select-viewport]{scrollbar-width:none;…}`                                                | Inline `<style>` element rendered by React (`dangerouslySetInnerHTML` inside Radix, not our code) | **No.** Fix options: (a) add the content's `'sha256-…'` hash to `style-src` (the content is constant, so a hash is stable per Radix version), or (b) pass `nonce` to `SelectPrimitive.Viewport`. If blocked, only a scrollbar shows in long listboxes (cosmetic).                                                                   |
| `react-remove-scroll` → `react-style-singleton` (Dialog, Select)                                           | A `<style>` element in `<head>` while a modal is open: `body { overflow: hidden !important; padding-right/margin-right: <scrollbar width>px }`                             | `document.createElement('style')`, content computed at runtime                                    | **No.** The content is dynamic (scrollbar width), so a hash does not work. Options: a nonce through `get-nonce`'s `setNonce()` (needs a server-generated nonce), or accept degradation: if blocked, the page behind an open dialog can still scroll a little and may shift. Wheel and touch blocking (event listeners) still works. |
| `aria-hidden` (Dialog)                                                                                     | `aria-hidden="true"` on sibling elements while the dialog is open                                                                                                          | DOM attributes                                                                                    | **Yes** (not style or script)                                                                                                                                                                                                                                                                                                       |
| lucide-react                                                                                               | Inline `<svg>` elements with presentation attributes (`stroke`, `stroke-width`), no `style`                                                                                | React elements                                                                                    | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Our components (`src/shared/ui`)                                                                           | No `style` props, no `dangerouslySetInnerHTML`, no injected `<style>` or `<script>` (enforced by ESLint)                                                                   | n/a                                                                                               | **Yes**                                                                                                                                                                                                                                                                                                                             |
| Storybook                                                                                                  | Many inline styles and scripts                                                                                                                                             | Dev and docs tool only                                                                            | Not shipped: `storybook-static/` is a separate build, and nothing from Storybook is in `dist/` (verified: no `storybook` string in the app bundle). Host it under its own, looser CSP if published.                                                                                                                                 |

### Implications for Phase 7

- The app shell is compatible with `script-src 'self'` today.
- `style-src 'self'` alone breaks two library behaviors (Select's scrollbar hiding, the Dialog and Select scroll lock). The realistic choices are:
  1. `style-src 'self' 'sha256-<select viewport css>'` and accept the scroll-lock degradation;
  2. serve `index.html` with a per-request nonce (needs an edge function or server) and call `setNonce()` before rendering;
  3. `style-src 'self' 'unsafe-inline'`. Style injection is a much smaller risk than script injection, but it still allows CSS-based data exfiltration if an attacker can inject markup.
- Decide in a Phase 7 ADR. Add a CSP test (Playwright, Phase 9) that opens a Dialog and a Select under the chosen policy and checks for violation reports.

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
