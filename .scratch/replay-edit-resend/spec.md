# Replay and edit-and-resend — spec

Terms: `GLOSSARY.md` (Replayed Request). Decisions: `docs/adr/0007`, `docs/adr/0006`. Third feature, `docs/ideas.md` #1.

## Scope
- A panel `replay` command carries the edited request. The hook sends it through the saved native `fetch` and records a new Captured Request with `replayOf` set to the original id.
- Drawer: "Replay" (unchanged) and "Edit & resend" (editable method, URL, headers, body). Masked headers show masked but send raw unless edited. Non-GET/HEAD asks for confirmation (per-session "don't ask again").
- Disabled with a reason for binary or truncated bodies unless a replacement body is supplied.
- Diff tab: status, headers, JSON structural diff, text line diff.

## Out of scope
- Replaying through Angular, bulk replay, saved replays.
