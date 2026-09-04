# Multiplatform — platform notes

TL;DR: overflow detail from [multiplatform.md](../architecture/multiplatform.md) — capability-matrix footnotes, the WebKitGTK risk register, and verified Tauri capability state. Reference, not required reading.

## Capability matrix footnotes


1. Reliable background tracking needs a **foreground service** (persistent notification); a bare 60s poll dies to Doze.
2. Accessibility-for-blocking + Device Admin anti-uninstall = Play removal risk; needs the **parental-control category** + a policy declaration.
3. A local DNS-filter VPN occupies the **single** VPN slot — conflicts with the user's real VPN.
4. `DeviceActivity` yields threshold callbacks + opaque `ApplicationToken` only; **can't read per-app usage**.
5. `ManagedSettings` can shield apps / restrict web, but needs the Family Controls entitlement.
6. `sysinfo` + `windows` crate: foreground window + process, polled.
7. Kill/suspend by pid is crude — can't block one browser **tab**.
8. hosts file = trivially bypassed; WFP = robust but a whole subsystem.
9. `SIGSTOP`/`SIGKILL` work same-user; still need to know what's focused (fine on X11).
10. Wayland **deliberately** blocks querying focused/other windows; needs a compositor protocol or portal. Network-layer web-block still works.
11. `NSWorkspace.frontmostApplication` is public API; window/tab detail via Accessibility (`AXUIElement`, TCC grant).
12. App Sandbox forbids controlling other apps → must ship **non-sandboxed** (Developer ID + notarization), which **excludes the Mac App Store**.
13. `NEFilterDataProvider` System Extension: gated entitlement + notarization + user approval. **Defer past v1.**
14. Existing product: web intervals only, no app-level tracking. Runs on every desktop OS.
15. Chromium MV3 = **DNR only**. **Firefox keeps blocking `webRequest`** *and* has DNR. ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Intercept_HTTP_requests))
16. Chrome MV3 = **service worker**; **Firefox = no SW**, uses event pages. Declare **both** `background.service_worker` + `background.scripts`. The current SW-based `src/background/` needs an event-page path. ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background))
17. Firefox for Android supports WebExtensions → the **only mobile surface needing no native app**. **Firefox iOS = no WebExtensions** → dead end.


### WebKitGTK risk (Linux, accepted)

| # | Issue | Severity |
|---|---|---|
| 1 | **Engine version + CVE patching distro-controlled** — no `minimumWebview2Version` equivalent | 🔴 HIGH |
| 2 | NVIDIA/DMABUF: blank window, flicker, crash-on-resize, **silent canvas slow-path** | 🔴 HIGH |
| 3 | Perf ceiling — Tauri's own figure: **40fps vs 240fps** | 🟠 MED-HIGH |
| 4 | WebKit lags Blink; Chromium-isms in shared UI can break | 🟡 MED |
| 5 | Wayland instability (`Gdk Error 71`) | 🟡 MED |
| 6 | DevTools / data-folder disclosure / IME | 🟢 LOW |

Keys live in Rust, **but decrypted history renders in the webview DOM** — so #1's patch
level is a security concern, not just a compat one.

**Mitigations:** ship Linux via **Flatpak** (pinned runtime — the single most important
one) · bake graphics env-vars into `main()` (`WEBKIT_DISABLE_DMABUF_RENDERER`,
`__NV_DISABLE_EXPLICIT_SYNC`) · compat-audit the UI on WebKit · **early Linux spike**
(real charts + timeline × NVIDIA/AMD/Intel × X11/Wayland) before committing UI work.
Sources: [linux-graphics](https://v2.tauri.app/develop/debug/linux-graphics/), [scope](https://v2.tauri.app/security/scope).

### Tauri state (verified 2026-07-29)

| Need | State |
|---|---|
| Mobile permission flow | ✅ `@TauriPlugin(permissions)` + `checkPermissions`/`requestPermissions` |
| Custom native bridges | ✅ templated Kotlin/Swift plugin workflow |
| Desktop autostart / tray | ✅ official plugins |
| **Background tracking (mobile)** | ⚠️ real work — **same in Flutter** |
| Linux engine | ⚠️ WebKitGTK; no Chromium today |

### Engine matrix consequence

The shared web UI must survive **Blink** (Chromium ext) + **Gecko** (Firefox ext) +
**WebKit** (Tauri macOS/Linux) + **WebView2** (Tauri Windows). Firefox both reinforces
the reuse case and widens the test matrix to three engine families.
