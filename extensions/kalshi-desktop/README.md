# PC Kalshi extension prototype

No Cloudflare or GitHub account is needed by the person installing this extension. This is an exploratory unpacked Chrome/Edge extension, not a published store listing or verified account connection.

## Build (maintainers only)
Run `node scripts/build-kalshi-extension.mjs <absolute-output-folder>`. The generated folder contains the existing private reader, encryption and strings alongside this extension shell. No keys or account data are included.

## Install and try (Kalshi account holder)
1. Extract the supplied ZIP to a folder you will keep on your PC.
2. Chrome: open `chrome://extensions`. Edge: open `edge://extensions`.
3. Enable Developer mode, select **Load unpacked**, and choose the extracted folder containing manifest.json.
4. Open the browser's Extensions menu and choose **Private Kalshi Tracker**. Pin it if desired. Click its toolbar icon to open the private tracker tab.
5. Inside that extension tab, connect using your own read-only Kalshi Key ID and private key, plus a new local password of at least 12 characters. Never send these to Reed or an agent.
6. Check that verified permission checks succeed and positions match Kalshi. If requests are rejected, stop and report only the displayed error, never keys or signed request headers.

Updates run only while the tracker tab is visible and unlocked. Closing it stops requests. Reload locks it. Use Disconnect inside the panel to erase its encrypted vault. If several tracker tabs are opened, each unlocked visible tab can make requests; keep one open.

## Privacy boundary
- Exact Kalshi API host permission only; no all-sites, main-site, cookies, history, downloads, storage.sync or tabs permission.
- Extension-local AES-GCM/PBKDF2 vault; unlocked credentials stay in tab memory. Signed GET requests go directly to Kalshi. Key ID/signatures go to Kalshi; private key does not.
- No content scripts, website messaging, web-accessible pages, telemetry, shared servers, account exports, startup jobs or alarms.
- Site JavaScript cannot read this extension tab's DOM or vault. Results are deliberately not copied into My Bets. A future extension-owned side panel could sit beside My Bets without sending private results into the page.
- The installed extension code and its future updates must still be trusted. This is not protection against a compromised browser/device or malicious extension update. Local encryption is not an OS keychain.
- API path gate accepts only fixed account-read/market GET routes; writes and redirects are rejected. Existing reader verifies read-only key scopes before fetching account data.

## Verification and limits
Unit tests cover manifest permissions, website isolation, endpoint validation and read-only request forwarding. The reused reader/encryption tests pass. An actual Chrome/Edge extension installation and real authenticated Kalshi request are still required; host permission alone does not prove Kalshi's server accepts extension-origin traffic. No real account has been tested. No store submission or browser installation was performed by the agent.

Initial release targets desktop Chrome/Edge. Mobile needs separate browser-specific support and testing; no phone compatibility promised. Production site and existing personal Cloudflare setup are unchanged.

References: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests and https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading
