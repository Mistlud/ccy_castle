# Castle progress

## 2026-09-20 — Explorer metadata and current UI assets

Status: implementation and automated verification complete; browser UI confirmation remains user-controlled.

### Implemented

- Added Explorer-folder metadata fields for artist, description, inferred type, media count, and rating using the same directory-summary path as cards.
- Added the optional description and compact metadata line below the Explorer folder title.
- Changed HTML, JavaScript, CSS, and placeholder responses from one-hour caching to `no-cache` while retaining immutable caching for content-versioned library thumbnails.

### Verified on PC #1

- `npm run check`: passed.
- `npm test`: 21 tests passed, 0 failed, 0 skipped.
- Library tests confirm Explorer metadata mapping, and server tests confirm `no-cache` on every static UI asset.
- `git diff --check`: passed.

### Remaining manual checks

- Confirm a normal, non-incognito browser session receives current CSS and JavaScript after the PC #2 server restarts.
- Confirm folders with complete and partial `meta.json` data render the Explorer description and compact metadata line without empty separators.

## 2026-09-20 — System-file filtering and sharper Explorer styling

Status: implementation and automated verification complete; browser UI confirmation remains user-controlled.

### Implemented

- Added case-insensitive `Thumbs.db` filtering for Explorer listings and media counts.
- Excluded `Thumbs.db` from card thumbnail URL versions and generated-thumbnail cache fingerprints so Windows Explorer activity does not churn Castle caches.
- Centered the Explorer thumbnail, changed it from 16:9 to 4:3, and increased its maximum width from `32rem` to `42rem`.
- Reduced the Explorer folder-title range from `1.35rem–2.2rem` to `1.15rem–1.75rem`.
- Reduced every custom UI corner radius to `0.3rem–0.45rem`, including the LAN badge, cards, controls, rows, thumbnails, media panels, and state boxes.

### Verified on PC #1

- `npm run check`: passed.
- `npm test`: 20 tests passed, 0 failed, 0 skipped.
- Tests confirm `Thumbs.db` is excluded from media counts and listings and does not change browser or generated-thumbnail cache identities.
- `git diff --check`: passed.

### Remaining manual checks

- Confirm the centered 4:3 Explorer thumbnail and smaller folder title at the intended mobile width.
- Confirm the sharper corners are visually consistent across cards, rows, status boxes, media panels, badges, and controls.

## 2026-09-20 — Explorer row interaction and folder thumbnail

Status: implementation and automated verification complete; browser UI confirmation remains user-controlled.

### Implemented

- Replaced trailing `열기`, `재생`, and `보기` controls with whole-row folder and file actions.
- Kept native keyboard behavior by using buttons for folders, audio, and video, and links for images and other files.
- Added the current folder's versioned thumbnail URL to Explorer API responses.
- Reordered the Explorer heading to label, thumbnail, compact folder title, and description.
- Reduced only the Explorer folder-title size; home and menu heading sizes are unchanged.

### Verified on PC #1

- `npm run check`: passed.
- `npm test`: 20 tests passed, 0 failed, 0 skipped.
- Explorer API tests confirm a versioned current-folder thumbnail URL.
- `git diff --check`: passed.

### Remaining manual checks

- Confirm the Explorer label, thumbnail, folder title, and description order at the intended mobile width.
- Confirm tapping anywhere on folder, audio, video, image, and other-file rows performs the expected action.

## 2026-09-20 — Cache invalidation and manual refresh

Status: implementation and automated verification complete; browser UI confirmation remains user-controlled.

### Implemented

- Added per-card thumbnail URL versions derived from direct folder entry names, kinds, sizes, and modification times.
- Metadata, explicit thumbnail, and folder-content changes now produce a new thumbnail URL on the next library load.
- Generated video thumbnail identities include the current folder signature, and replaced cache files are removed when detected during the running process.
- Versioned thumbnail responses use immutable browser caching; unversioned requests use `no-store`.
- Added `POST /api/refresh` to advance all card versions and remove only Castle-generated thumbnail cache files.
- Added the top-bar **라이브러리 새로고침** button with working, success, and failure states; successful refresh reloads the current route.

### Verified on PC #1

- `npm run check`: passed.
- `npm test`: 20 tests passed, 0 failed, 0 skipped.
- Tests cover automatic URL changes for metadata, explicit-thumbnail, and folder-content changes; manual revision changes; generated-thumbnail replacement and cleanup; refresh API behavior; cache headers; and refresh-button presence.
- `git diff --check`: passed.

### Remaining manual checks

- Confirm the refresh button layout and status text at the intended mobile width.
- Change `meta.json` and `thumbnail.jpg` while the server is running, press **라이브러리 새로고침**, and confirm the card text and image update without a browser hard refresh.

## 2026-09-20 — Metadata schema update

Status: implementation and automated verification complete; browser UI confirmation remains user-controlled.

### Implemented

- Replaced editable metadata fields `type` and `date` with string fields `artist` and `rating`.
- Kept media type as a filesystem-derived card property rather than user-authored metadata.
- Added artist and free-form rating labels to the card metadata line.
- Hid `meta.json` and `thumbnail.jpg` card support files from explorer listings and media counts, case-insensitively.
- Updated metadata examples and rules in `README.md`, `Plan.md`, and `Context.md`.

### Verified on PC #1

- `npm run check`: passed.
- `npm test`: 20 tests passed, 0 failed, 0 skipped.
- Library tests confirm `artist` and `rating` mapping, legacy `type` and `date` exclusion, inferred media type fallback, and support-file hiding.

### Remaining manual check

- Open a card with `artist` and `rating` values in `meta.json` and confirm the metadata line looks correct at the intended mobile width.

## 2026-09-20 — LAN MVP implementation and validation

Status: LAN MVP implementation, automated verification, PC #2 deployment, and Android LAN validation complete.

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

### Final-host validation with PC #2 and Android

- Started the server successfully on PC #2, the intended final host.
- Connected from an Android phone over the same LAN and opened the Castle site successfully.
- The user confirmed the remaining LAN MVP acceptance work complete.

### Runtime notes

- PC #2 uses its actual local Castle path rather than the SMB UNC path as the configured root.
- Port `8080` is the default and can be changed.
- Browser codec support determines whether a particular original video plays; the MVP does not transcode.
- PC #2 does not need `ffmpeg`; missing video thumbnails degrade to image or placeholder fallback.

### Completion

- The LAN MVP definition of done is satisfied.
- No required implementation or validation work remains within the agreed MVP scope.
- Internet exposure, authentication, executable packaging, and MyOnOff integration remain intentionally out of scope.

### Git state

- Local repository initialized on branch `main`.
- `origin` points to `https://github.com/Mistlud/ccy_castle.git`.
