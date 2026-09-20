# Castle Project Context

## 1. Purpose

This document gives a fresh Codex session the environmental and project context it would otherwise not know.

Read this before `Plan.md`.

This is a new project, separate from the completed MyOnOff project.

---

## 2. Existing environment

Relevant machines:

- PC #1
  - Primary development machine
  - Used for Codex and development tools
  - Usually connected by Wi-Fi

- PC #2
  - Target host / media machine
  - Connected by wired Ethernet
  - Hostname: `DESKTOP-VHU9KUS`
  - Reserved LAN IP: `192.168.219.104`
  - Contains the external HDD used for media storage
  - Exposes an SMB share named `domination`

- Android phone
  - Connected to the same Wi-Fi
  - Primary client for this project
  - Initial target is browser access while on the same LAN

Network:

```text
Subnet: 192.168.219.0/24
Router: 192.168.219.1
PC #2: 192.168.219.104
```

PC #2 uses a DHCP reservation, so the address above should be stable in the current environment.

---

## 3. Storage layout

PC #2 already has an SMB share named:

```text
domination
```

A new directory for this project will exist beneath it:

```text
domination/
└─ castle/
```

`castle` is the root of the new web application.

The exact local Windows filesystem path corresponding to this directory must be configurable. Do not invent or hard-code a drive letter.

The application must never expose anything outside the configured `castle` root.

---

## 4. Relationship to MyOnOff

MyOnOff is a separate completed project.

It already provides:

- Wake-on-LAN for PC #2
- Host status detection
- Sleep
- Shutdown
- Windows controller
- Android controller

For this project:

- Do not modify MyOnOff.
- Do not integrate with MyOnOff in the MVP.
- Assume PC #2 is already powered on when this site is used.
- Any integration will be a later explicit task.

---

## 5. Product idea

PC #2 should run a small LAN-only web server.

A phone on the same Wi-Fi should open an address similar to:

```text
http://192.168.219.104:<port>
```

and visually browse media under `castle`.

The experience should feel like a small personal streaming site rather than a raw directory listing.

At the same time, it should act as a read-only constrained file explorer below `castle`.

---

## 6. Filesystem philosophy

The filesystem is the source of truth.

Do not introduce a database for the MVP.

Expected convention:

```text
castle/
├─ Movies/
│  ├─ Interstellar/
│  │  ├─ thumbnail.jpg
│  │  ├─ meta.json
│  │  └─ movie.mkv
│  └─ Another Movie/
│     └─ ...
├─ Music/
│  ├─ Album A/
│  │  ├─ thumbnail.jpg
│  │  ├─ meta.json
│  │  ├─ 01.mp3
│  │  └─ 02.mp3
│  └─ ...
└─ Photos/
   ├─ Trip A/
   │  ├─ thumbnail.jpg
   │  ├─ meta.json
   │  ├─ 001.jpg
   │  └─ 002.jpg
   └─ ...
```

Interpretation:

```text
castle root
→ menu folder
→ item/card folder
→ media files
```

The site may support deeper browsing below an item, but the structure above is the main library convention.

---

## 7. Primary UX

The main client is a smartphone browser.

Expected flow:

```text
Home
→ menu folders
→ tap a menu
→ child folders shown as media cards
→ tap a card
→ inspect/browse that folder
→ open or play media
```

Cards should be mobile-first and easy to scan with one hand.

Inside a folder, the Explorer heading should show the Explorer label, current-folder thumbnail, and a compact folder title in that order. Each folder or file row should open or play from the whole row instead of a separate trailing action button.

Preferred card content:

- thumbnail
- title
- media type or useful summary
- selected metadata

---

## 8. Media behavior

### Video

- Serve the original file.
- Support HTTP range requests.
- Seeking must work.
- Do not add transcoding in the MVP.
- Let the browser/device handle supported playback or handoff behavior.

### Image

- Open the original image.
- Prefer a new browser tab or equivalent full view.

### Audio

- Play inside the web application.
- Use a dedicated browser audio player.
- A fixed bottom player is desirable if simple.

### Other files

- Show in explorer mode.
- Allow safe open/download behavior when reasonable.

---

## 9. Metadata and thumbnails

Each card folder may optionally contain:

```text
thumbnail.jpg
meta.json
```

Suggested metadata:

```json
{
  "title": "Interstellar",
  "artist": "Christopher Nolan",
  "description": "Personal library item",
  "rating": "12세 관람가"
}
```

Rules:

- `meta.json` is optional.
- Supported metadata fields are the strings `title`, `artist`, `description`, and `rating`.
- `rating` is a free-form label rather than a numeric score.
- Missing or malformed metadata must not break the item.
- Folder name is the fallback title.
- Type is inferred from contained files.
- `meta.json` and `thumbnail.jpg` are internal card support files and are hidden from explorer listings and media counts.
- Windows-generated `Thumbs.db` files are hidden from explorer listings, excluded from media counts, and ignored by thumbnail cache fingerprints.

Thumbnail priority:

1. explicit `thumbnail.jpg`
2. cached generated thumbnail
3. first suitable image
4. generic placeholder

ffmpeg may be used for optional video thumbnail generation if available.

Do not make ffmpeg mandatory for the application to function.

Generated thumbnails should be cached and original media files must not be modified.

Card thumbnail URLs should carry a version derived from the card folder's relevant direct contents. Changes to metadata, an explicit thumbnail, or media contents must produce a new thumbnail URL on the next scan, while `Thumbs.db` must be ignored. A top-bar **라이브러리 새로고침** action should force a rescan, reread metadata, advance all thumbnail versions, remove only generated thumbnails, and reload the current view.

The Explorer thumbnail should be centered, use a 4:3 ratio, and be larger than the original presentation. Its folder title should be compact, and custom corner radii throughout the UI should be reduced to half or less of their original values.

---

## 10. Security boundary

This is a hard requirement.

The server must never expose anything outside the configured `castle` root.

All user-controlled paths must be normalized, canonicalized, and checked against the root.

Prevent:

```text
..
../
absolute paths
encoded traversal
mixed slash traversal
symlink/junction escape where applicable
```

A manipulated URL must never provide access to:

- other directories in `domination`
- arbitrary PC #2 files
- Windows system files
- user profile directories
- configuration or credentials outside `castle`

The MVP may have no authentication because it is LAN-only.

Authentication belongs to a later external-access phase.

---

## 11. External access is out of scope

Do not implement:

- Vercel deployment
- Cloudflare Tunnel
- Tailscale
- router port forwarding
- public Internet access
- remote authentication
- cloud media storage

First make the LAN version work well.

---

## 12. Preferred technical direction

Prefer a small, understandable codebase.

A reasonable implementation is:

```text
Node.js
+
lightweight HTTP server
+
mobile-first frontend
```

Express or an equivalent lightweight server is acceptable.

Prefer one process serving:

- frontend assets
- API
- media endpoints

Avoid multiple services unless there is a strong reason.

A heavy frontend framework is not required.

---

## 13. Development preferences

Codex should:

- follow the explicit plan
- preserve scope boundaries
- implement rather than repeatedly ask minor questions
- state assumptions clearly
- avoid unrelated refactors
- avoid unnecessary environment provisioning
- validate builds/tests where possible
- leave real-device validation to the user where needed

If an optional dependency such as ffmpeg is missing, do not derail the project trying to install it.

---

## 14. Core principles

```text
The filesystem is the source of truth.
```

```text
The server must never expose anything outside the configured castle root.
```
