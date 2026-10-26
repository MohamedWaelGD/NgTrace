# 6. Quick-copy Headers copy the raw value

Status: accepted (2026-10-26)

## Context
Header masking (Settings → Masked headers) hides sensitive headers such as `Authorization` on screen, in copies and in exports. The most common reason to copy that header is to reuse the token in another tool, and a masked copy is useless for that.

## Decision
Copying a header, whether through a header row's copy icon or a Quick-copy button, always copies the raw value and says so ("Copied Authorization (unmasked)"). Copy as cURL, Copy as fetch and HAR export keep following the masking setting.

## Consequences
- Masking now protects against shoulder-surfing and accidentally sharing pasted or exported files, not against someone who deliberately copies the value. The options page wording says so.
- Copying one header is always a deliberate single click, so it never ends up in a bulk export by accident.
