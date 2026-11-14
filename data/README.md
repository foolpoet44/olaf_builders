# Versioned content data

`legacy-content.json` is the reviewed, reproducible content snapshot imported from the approved legacy CSV exports.

- Includes: 26 builder profiles, 44 question cards, 24 legacy audit entries.
- Excludes: credentials, password hashes, sessions, rate-limit records, server secrets, and login history.
- Import: `node tools/import-legacy.js all <qcards.csv> <audit.csv> --actor OP-01 --dry-run`
- Apply: rerun without `--dry-run`; the import is idempotent by legacy card UID and audit fields.

The runtime SQLite file remains under `.local/` and is intentionally not committed because it contains authentication state.
