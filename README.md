# Castle LAN Media Browser

Castle is a small, read-only media browser for a trusted home LAN. One Node.js process serves the mobile frontend, filesystem API, thumbnails, and original media files below one configured local `castle` directory.

The configured filesystem root is the source of truth. Castle has no database and never intentionally exposes a host absolute path to clients.

## Requirements

- Windows 10 or 11
- Node.js 20 or newer (use the current Node.js LTS on PC #2)
- A local `castle` directory on the server
- Optional: `ffmpeg` on `PATH` for cached video thumbnails

`ffmpeg` is not required. Without it, folders use an existing image or the built-in placeholder. Castle does not transcode media.

## Library convention

```text
castle/
├─ Movies/                    # home menu
│  └─ Interstellar/           # card
│     ├─ thumbnail.jpg        # optional
│     ├─ meta.json            # optional
│     └─ movie.mkv
├─ Music/
└─ Photos/
```

`meta.json` may contain the string fields `title`, `artist`, `description`, and `rating`. `rating` is a free-form label such as `"12세 관람가"`. Missing or malformed metadata falls back to the folder name; media type is always inferred from the contained files.

`meta.json` and `thumbnail.jpg` are card support files. They are used by Castle but omitted from explorer listings and media counts, case-insensitively.

## Refresh and thumbnail caching

Castle fingerprints each card folder from its direct entries. Changes to `meta.json`, `thumbnail.jpg`, or the folder contents produce a new `v` value in that card's thumbnail URL the next time the library is loaded, so the browser does not reuse an older thumbnail for changed content. Versioned thumbnail responses are immutable; unversioned thumbnail requests are not cached.

Use the **라이브러리 새로고침** button in the top bar for manual recovery. It rescans the current view, rereads metadata, advances every thumbnail URL version, and removes only Castle-generated thumbnail cache files. It never removes original media, `meta.json`, or user-provided `thumbnail.jpg` files.

## Explorer interaction

The Explorer header shows its label, the current folder thumbnail, and then a compact folder title. Folder and file rows are single large click targets: folders navigate, audio starts playback, video opens the inline player, and images or other files open in a new tab. Separate `열기`, `재생`, and `보기` buttons are not used.

## Development and automated checks on PC #1

No runtime packages need to be installed.

```powershell
Set-Location C:\ccy\ccy_castle
npm run check
npm test
```

Run against a local test library:

```powershell
.\start-server.ps1 -CastleRoot 'C:\path\to\local\castle' -Port 8080
```

Then open `http://127.0.0.1:8080` on PC #1. The default bind address is `0.0.0.0`, so only use it on a trusted private LAN.

Equivalent direct invocation:

```powershell
node .\server.js --root 'C:\path\to\local\castle' --host 0.0.0.0 --port 8080
```

Supported environment variables are `CASTLE_ROOT`, `CASTLE_HOST`, `CASTLE_PORT`, and `CASTLE_CACHE`.

## Deploy to PC #2

PC #2 is the final host, not the development machine. No executable packaging is required for the LAN MVP.

1. Download and manually install the Windows Node.js LTS release from <https://nodejs.org/en/download>. Keep the option that adds Node.js to `PATH` enabled.
2. Close and reopen PowerShell, then verify:

   ```powershell
   node --version
   ```

3. Copy this project folder to PC #2. After the repository has been pushed, cloning it with Git is also acceptable. The application has no third-party runtime dependencies, so `npm install` is not required.
4. Find the actual local Windows path of the `castle` directory on PC #2. For example, it might look like `D:\domination\castle`, but the real path must be confirmed on that PC.
5. Do **not** pass an SMB UNC path such as `\\DESKTOP-VHU9KUS\domination\castle`. `start-server.ps1` rejects UNC roots.
6. Start the server from the copied project folder:

   ```powershell
   .\start-server.ps1 -CastleRoot 'D:\replace-with-actual-local-path\castle' -Port 8080
   ```

7. Keep that PowerShell window open. Press `Ctrl+C` to stop the server.

At startup, Castle prints the canonical root, bind address, detected LAN URLs, and whether optional `ffmpeg` thumbnails are available.

## Windows Firewall on PC #2

First confirm that PC #2 is using the trusted **Private** Windows network profile:

```powershell
Get-NetConnectionProfile
```

Before Android testing, open PowerShell **as Administrator** on PC #2 and allow only the selected TCP port from the local subnet:

```powershell
New-NetFirewallRule `
  -DisplayName 'Castle LAN Media Browser' `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8080 `
  -Profile Private `
  -RemoteAddress LocalSubnet
```

Inspect the rule:

```powershell
Get-NetFirewallRule -DisplayName 'Castle LAN Media Browser' | Format-List DisplayName,Enabled,Profile,Direction,Action
```

Remove it if Castle is no longer used:

```powershell
Remove-NetFirewallRule -DisplayName 'Castle LAN Media Browser'
```

If a different port is selected, use that same port in the start command and firewall rule.

## Android LAN acceptance check

With the server running on PC #2 and the phone connected to the same Wi-Fi:

1. Confirm the startup output includes `http://192.168.219.104:8080` (or use PC #2's currently assigned LAN address and configured port).
2. Open that URL in the Android browser.
3. Confirm direct child folders appear as home menus.
4. Open a menu and confirm child folders appear as cards.
5. Verify title, metadata, thumbnail, and placeholder fallbacks.
6. Change `meta.json` or `thumbnail.jpg`, press **라이브러리 새로고침**, and confirm the card updates without a browser hard refresh.
7. Browse into nested directories and confirm breadcrumbs never navigate above Castle.
8. Open an original image.
9. Play and seek audio; test previous/next when a folder contains multiple tracks.
10. Play a browser-supported video and seek to a later position.
11. Confirm malformed or missing `meta.json` does not break the page.
12. Confirm the server stays responsive during normal playback.

Some codecs, including some MKV codec combinations, may not play directly in a mobile browser. The MVP serves the original file and does not transcode it.

## Security boundary

All client paths are decoded by the URL parser, normalized as relative paths, resolved against the canonical Castle root, and checked again after filesystem realpath resolution. Absolute paths, traversal segments, and symlink or junction escapes are rejected. Unsafe entries are omitted from directory listings.

Castle is intentionally LAN-only and has no authentication. Do not port-forward it, expose it through a public tunnel, or run it on an untrusted network.

## MVP boundaries

Castle is read-only. It does not implement upload, delete, rename, move, editing, accounts, Internet access, cloud metadata, watch history, transcoding, or MyOnOff integration.
