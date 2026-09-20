# Castle progress

## 2026-09-20 — LAN MVP implementation on PC #1

Status: implementation, PC #1 automated verification, and PC #1-to-Android LAN playback verification complete. PC #2 deployment and final-host validation remain for the user.

### Implemented

- One Node.js process serving the mobile frontend, JSON API, thumbnails, and original media
- Configurable local Castle root, listen address, port, and thumbnail cache
- Canonical path containment with traversal, absolute path, mixed slash, symlink, and junction escape protection
- Filesystem-derived home menus, item cards, metadata fallback, media type inference, breadcrumbs, and deeper read-only browsing
- Original image and file access, in-page audio player, video player, and byte-range streaming
- Explicit, cached generated, first-image, and placeholder thumbnail fallback order
- Optional `ffmpeg` thumbnail generation without modifying source media
- Mobile-first dark UI and desktop fallback layout
- `start-server.ps1` with Node version, local-directory, and UNC-root validation
- PC #2 Node.js LTS, deployment, Windows Firewall, and Android acceptance instructions in `README.md`

### Verified on PC #1

- `npm run check`: passed
- `npm test`: 17 tests passed, 0 failed, 0 skipped
- Path tests covered traversal, absolute paths, encoded and mixed separators, and junction escape
- API/media tests covered menu and card mapping, metadata fallback, full media, closed/open-ended Range, invalid Range (`416`), HEAD, and host-path non-disclosure
- Optional `ffmpeg` thumbnail generation and cache reuse passed with ffmpeg 8.1.2
- `start-server.ps1` started the server successfully with a local root and rejected an SMB UNC root
- HTTP smoke checks returned `200` for HTML, JavaScript, CSS, and menu API
- Chrome headless at 390×844 rendered the home, menu-card, and explorer views successfully
- Test-only browser profiles, screenshots, and fixtures were removed after verification

### Manually verified with PC #1 and Android

- Started Castle on PC #1 with `Z:\castle` and port `8080`.
- Opened the site on PC #1 through both loopback and the LAN address.
- Opened `http://192.168.219.101:8080` from an Android phone on the same Wi-Fi.
- Confirmed normal media playback on the phone.
- Confirmed that the earlier `ERR_SSL_PROTOCOL_ERROR` came from attempting HTTPS against the HTTP-only LAN server; explicitly using `http://` resolved it.

### Assumptions

- PC #2 will use Node.js LTS 20 or newer.
- The actual local Windows path corresponding to `domination\castle` will be supplied on PC #2; no drive letter is assumed.
- Port `8080` is the default and can be changed.
- Browser codec support determines whether a particular original video plays; the MVP does not transcode.
- PC #2 does not need `ffmpeg`; missing video thumbnails degrade to image or placeholder fallback.

### Still requiring real-device validation

- Install Node.js LTS and copy the project to PC #2.
- Start against PC #2's confirmed local Castle path.
- Add the Private-profile, `LocalSubnet` Windows Firewall rule for the chosen port.
- Open PC #2's LAN URL from the Android phone on the same Wi-Fi.
- Validate the actual PC #2 library's image, audio, and video files, including video seeking and device codec behavior.
- Validate touch usability, long-running playback responsiveness, and the real library's metadata and thumbnail conventions.

### Git state

- Local repository initialized on branch `main`.
- `origin` points to `https://github.com/Mistlud/ccy_castle.git`.
