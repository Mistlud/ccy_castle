# Codex Session Message

Read `Context.md` first, then `Plan.md`.

Treat those files as the source of truth for this new repository.

Implement the LAN-only MVP described in `Plan.md`.

Important constraints:

- This is separate from MyOnOff. Do not modify or integrate with MyOnOff.
- The filesystem under the configured `castle` root is the source of truth.
- Nothing outside `castle` may ever be exposed.
- Keep the codebase small and understandable.
- Prefer one lightweight Node.js process serving frontend, API, and media.
- Mobile browser use on the same Wi-Fi is the primary target.
- Implement path-safety logic and tests early.
- Do not add Internet access, authentication, databases, transcoding, cloud metadata, write operations, or unrelated features.
- Do not spend time provisioning optional tools such as ffmpeg if they are unavailable; optional functionality should degrade gracefully.
- Run all automated checks available in the current environment.
- Stop after the LAN MVP is implemented.

When finished, report:

- what was implemented
- what was automatically tested
- any assumptions made
- anything still requiring real-device validation
- any optional dependency that was unavailable

Use reasonable implementation judgment where the plan leaves details open, but do not broaden the scope.
