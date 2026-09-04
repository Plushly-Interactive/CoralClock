# Cloud sync

TL;DR: cross-device sync of the interval log, end-to-end encrypted, no personal information collected. The server, the shared Rust core and every design document are developed outside this repo.

## What the extension will do

- Create an account from a recovery phrase — no email, no phone, no name — and see the same interval data on every device.
- Apply a limit such as "twitch.tv 1h/day" to total usage across all devices.
- Name and sign out devices, export everything, delete the account.

## What lives here

- The extension is one client of that server. It will vendor the built WASM core under `src/vendor/` and add the account UI. Neither exists yet.
- The interval log is the synced store; legacy scalar buckets stay local and frozen.
