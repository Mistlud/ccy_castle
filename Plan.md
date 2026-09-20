# Castle LAN Media Browser

## 1. Goal

Build a small LAN-only web application that runs on PC #2 and lets a smartphone on the same Wi-Fi browse and consume media stored under a configured `castle` directory.

The application combines:

- a visual personal media library
- a constrained read-only file explorer
- simple media-serving capabilities

The filesystem is the source of truth.

No database is required for the MVP.

The server must never expose files outside the configured `castle` root.

---

## 2. MVP target

The MVP must allow the user to:

1. Start the server on PC #2.
2. Open the site from an Android phone on the same LAN.
3. See first-level folders under `castle` as menu entries.
4. Open a menu.
5. See each child folder as a mobile-friendly media card.
6. See a thumbnail and useful metadata for each card.
7. Open a card and browse its contents.
8. Open images.
9. Play audio in the browser.
10. Open video files with proper HTTP range support.
11. Navigate directories below `castle`.
12. Reject every attempt to escape the `castle` root.

---

## 3. Directory convention

Canonical shape:

```text
castle/
├─ Menu A/
│  ├─ Item A/
│  │  ├─ thumbnail.jpg
│  │  ├─ meta.json
│  │  └─ media files
│  ├─ Item B/
│  │  └─ ...
│  └─ ...
├─ Menu B/
│  └─ ...
└─ ...
```

Meaning:

```text
castle direct child
= top-level menu

menu direct child directory
= media card / library item

files inside card directory
= actual content
```

Deeper directory browsing below an item must still work.

If the convention is incomplete, degrade gracefully into constrained browsing rather than failing.

---

## 4. Root configuration

The local filesystem path to `castle` must be configurable.

Do not hard-code a Windows drive letter.

Acceptable configuration methods include:

- config file
- environment variable
- command-line option

Canonicalize the configured root at startup.

If the root does not exist, fail with a clear startup error.

---

## 5. Home screen

The home screen represents direct child directories of `castle`.

Example:

```text
Movies
Music
Photos
Clips
```

Each menu entry must be touch-friendly.

Creating or removing a direct child directory should naturally change the menu without editing a database.

---

## 6. Menu screen

Opening a menu shows its child directories as cards.

Primary layout:

- mobile-first
- vertical page scrolling
- horizontal-style card per item
- thumbnail on one side
- title and metadata on the other
- generous touch targets
- clear visual hierarchy

Desktop browsers should remain usable, but desktop-first design is not the goal.

---

## 7. Card model

Each direct child directory under a menu is one card.

Example:

```text
castle/Movies/Interstellar/
```

Possible card information:

- title
- thumbnail
- artist
- inferred media type
- description
- rating
- number of media files
- useful inferred metadata

No field except the folder itself is mandatory.

The card must still render if only the directory name exists.

---

## 8. `meta.json`

`meta.json` is optional.

Suggested shape:

```json
{
  "title": "Interstellar",
  "artist": "Christopher Nolan",
  "description": "Personal library item",
  "rating": "12세 관람가"
}
```

Initial supported fields:

- `title`
- `artist`
- `description`
- `rating`

Rules:

- malformed metadata produces fallback behavior, not a broken item
- missing metadata must not hide the item
- supported metadata values must be strings
- rating is a free-form string label, not a numeric score
- folder name is the default title
- type is inferred from contained files
- `meta.json`, `thumbnail.jpg`, and Windows-generated `Thumbs.db` files are hidden from explorer listings and media counts
- `Thumbs.db` must not change thumbnail versions or generated-thumbnail cache identities

---

## 9. Thumbnail rules

Preferred explicit filename:

```text
thumbnail.jpg
```

Priority:

1. explicit thumbnail
2. cached generated thumbnail
3. first suitable image
4. generic placeholder

Optional video thumbnail generation may use ffmpeg.

If ffmpeg is unavailable:

- do not fail the card
- show a placeholder or existing suitable image

Generated thumbnails should be cached separately from original media.

Do not modify original files.

Each card thumbnail URL must include a version derived from the relevant direct folder entries. A change to `meta.json`, `thumbnail.jpg`, or media folder contents must produce a new URL on the next library scan. Ignored operating-system artifacts such as `Thumbs.db` must not change the version. Generated thumbnail cache keys must also change with the relevant folder state so stale generated images are not reused.

The UI should provide a manual library refresh action that advances all thumbnail versions, rereads filesystem metadata, removes only generated thumbnail cache files, and reloads the current view.

---

## 10. Item detail / explorer view

Opening a card should provide a useful view of that directory.

This view also acts as the constrained file explorer.

Show:

- explorer label, current-folder thumbnail, and compact current title in that order
- centered 4:3 current-folder thumbnail, larger than the earlier 16:9 presentation
- optional metadata description below the folder title
- compact artist, inferred type, media-count, and rating summary
- breadcrumb from `castle`
- child directories
- files
- media type
- file size where useful

Each folder or file row should be one keyboard-accessible click target. Do not require a separate trailing open, play, or view button.

Allow deeper navigation.

Never allow navigation above `castle`.

The explorer is read-only.

Do not implement:

- upload
- delete
- rename
- move
- edit

---

## 11. Video behavior

For video:

- serve the original file
- set appropriate MIME type
- support HTTP range requests
- support seeking
- avoid loading the entire file into memory
- stream efficiently from disk

Do not transcode in the MVP.

Do not add player-specific integrations unless normal URL/browser behavior proves unusable.

---

## 12. Image behavior

For images:

- expose the original file safely
- allow opening in a new tab or equivalent full view
- preserve original resolution

A complex gallery is not required.

---

## 13. Audio behavior

Audio should play inside the web page.

Use native browser audio capabilities.

The player should show at least:

- track name
- play/pause
- current time
- duration
- seek control

A fixed bottom player is preferred if simple.

If multiple audio files exist in one folder, a basic track list and previous/next behavior are useful.

Do not build a full music service.

---

## 14. Other file types

Unsupported or miscellaneous files should:

- remain visible in explorer mode
- offer a safe open/download action where reasonable

Do not build custom previewers for every format.

---

## 15. API shape

Exact route names may be refined.

Reasonable starting shape:

```text
GET /api/menus
GET /api/browse?path=<relative-path>
GET /api/item?path=<relative-path>
POST /api/refresh
GET /media?path=<relative-file-path>
GET /thumbnail?path=<relative-item-path>&v=<content-version>
```

Requirements matter more than exact naming.

All paths visible to clients should be relative to `castle`.

Do not expose raw absolute host filesystem paths.

---

## 16. Path safety

This is a hard requirement.

Every client path must:

1. be decoded safely
2. be treated as relative to the root
3. be normalized/canonicalized
4. resolve inside the root
5. be rejected if it escapes the root

Test cases must include:

```text
..
../
../../
encoded traversal
mixed slash styles
absolute Windows paths
```

Where applicable, account for symlinks or junctions that could escape the root.

Rejected requests should not leak sensitive host paths.

---

## 17. LAN binding

The server must be reachable from other devices on the LAN.

Support binding to the LAN interface, normally:

```text
0.0.0.0
```

The port must be configurable.

Choose a sensible non-privileged default.

Startup output should clearly show a usable LAN URL, for example:

```text
http://192.168.219.104:<port>
```

Do not implement Internet exposure.

---

## 18. Frontend direction

Mobile-first dark UI.

Desired character:

- simple
- visual
- touch-friendly
- restrained
- streaming-site-like
- not a raw directory listing
- not an enterprise admin dashboard

Prefer:

- large thumbnails
- readable titles
- compact metadata
- strong spacing
- clear folder/media icons where useful

Avoid:

- excessive cards inside cards
- tiny desktop controls
- dense technical information
- heavy animation
- decorative complexity
- heavily rounded panels and controls

---

## 19. Backend direction

Preferred:

```text
Node.js
+
lightweight HTTP server
+
one-process frontend/API/media serving
```

Express is acceptable.

Use built-in Node functionality where clearer than adding dependencies.

Keep dependencies small.

Idle CPU and RAM use should remain modest on PC #2.

---

## 20. Cache behavior

The filesystem remains authoritative.

The server may cache:

- scanned directory information
- parsed metadata
- generated thumbnails

but cache must never become a second source of truth.

Card folder state must be checked when card data is rebuilt. Cache-relevant file changes invalidate the related thumbnail identity automatically. Versioned thumbnail URLs prevent stale browser cache reuse, and the manual refresh action must invalidate all server-generated thumbnails without touching library source files.

Static HTML, JavaScript, CSS, and placeholder assets should use `no-cache` so deployed UI changes are revalidated in normal browser sessions. Content-versioned library thumbnails may remain immutable.

A server restart must be able to reconstruct state from `castle`.

Prefer correctness over aggressive optimization.

---

## 21. Logging

Log at least:

- startup root
- bind address and port
- major scan errors
- malformed metadata warnings
- thumbnail generation failures
- forbidden path attempts
- unrecoverable server errors

Do not log secrets.

Do not spam logs for every harmless media chunk request unless debugging is enabled.

---

## 22. Error handling

The UI should handle:

- missing files
- deleted folders
- malformed `meta.json`
- unsupported media
- inaccessible file
- thumbnail failure
- server error

One broken item must not break the whole library.

---

## 23. Automated testing

Add tests for logic that is easy to regress.

At minimum:

- path normalization
- root containment
- traversal rejection
- metadata fallback
- media type inference
- menu/card filesystem mapping

If range handling is implemented manually, test:

- full request
- valid range
- open-ended range
- invalid range

UI appearance can remain manual validation.

---

## 24. Manual acceptance test

The user will validate on an Android phone connected to the same Wi-Fi.

The MVP is accepted when:

- server starts on PC #2
- phone can open the site over LAN
- direct child folders of `castle` appear as menus
- opening a menu shows child folders as cards
- cards use correct title/thumbnail fallback behavior
- item directory can be browsed
- image opens successfully
- audio plays in browser
- video is accessible and seeking works
- deeper navigation works
- malformed or missing metadata does not break the library
- path escape outside `castle` is rejected
- server remains responsive during normal browsing and playback

---

## 25. MVP non-goals

Do not implement unless explicitly requested later:

- Internet access
- Vercel deployment
- Cloudflare Tunnel
- Tailscale
- router port forwarding
- login/accounts
- remote authentication
- database
- media upload
- file deletion
- file rename
- file move
- file editing
- SMB replacement
- Android native app
- Windows native client
- live transcoding
- automatic subtitle processing
- TMDB or external metadata services
- cloud metadata lookup
- recommendation engine
- watch history
- resume position
- favorites
- complex playlists
- multi-user state
- MyOnOff integration

---

## 26. Recommended implementation order

1. Create minimal repository structure.
2. Add configurable `castle` root and server port.
3. Implement safe path resolution and tests first.
4. Implement filesystem scanner.
5. Implement menus and card model.
6. Implement browse/item API.
7. Implement media serving with range support.
8. Implement basic mobile frontend.
9. Implement image behavior.
10. Implement audio player.
11. Add metadata parsing/fallback.
12. Add thumbnail selection.
13. Add optional generated thumbnails if ffmpeg is available.
14. Add explorer/breadcrumb behavior.
15. Run automated tests.
16. Run desktop browser smoke test.
17. Hand off to the user for Android/LAN real-device validation.

Stop after the LAN MVP.

Do not automatically continue into external-access work.

---

## 27. Definition of done

The MVP is done when:

```text
A phone on the same Wi-Fi can browse the configured castle library visually,
open supported media,
use the site as a read-only explorer below castle,
and cannot escape the castle root.
```
