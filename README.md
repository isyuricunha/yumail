# YuMail

YuMail is a desktop-first, privacy-first email client based on the repository PRD.
The current implementation supports JMAP account setup, Inbox metadata loading, and a
cache-first safe message reading path, local drafts, replies, and manual JMAP
submission.

This is not a complete mail client yet. Continuous sync, IMAP/SMTP, Gmail, Outlook,
attachments in outgoing mail, provider-synced drafts, and live AI calls are
intentionally deferred.

## Requirements

- Node.js 24+
- pnpm 11+
- Rust and Cargo
- Tauri desktop prerequisites for your OS
- An available operating system credential manager

On Linux, the secure-storage adapter requires a working Secret Service provider such as
GNOME Keyring or a compatible KeePassXC setup.

## Install

```bash
pnpm install
```

## Run The Desktop App

```bash
pnpm dev
```

This runs `tauri dev` for `apps/desktop`. For the frontend-only Vite shell:

```bash
pnpm --filter @yumail/desktop dev
```

The frontend-only shell cannot access SQLite or secure credentials. Use `pnpm dev` for
account setup, persistence, inbox refresh, and message reading.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:boundaries
```

`pnpm check` runs typecheck, lint, and the architecture boundary verifier.

## Project Layout

```text
apps/
  desktop/              Tauri v2 + Vite + React desktop app
packages/
  ai/                   AI provider and user-triggered action contracts
  core/                 Product service boundary
  db/                   SQLite schema and migration draft
  mail/                 Mail provider abstractions and placeholders
  platform-tauri/       Tauri-specific platform adapters
  renderer/             Email rendering safety boundary
  search/               Search service boundary
  shared/               Shared types, constants, and errors
  ui/                   Dark-first React UI primitives
```

## Current Foundation

- Tauri v2 desktop scaffold with a minimal Rust command layer.
- Vite + React + TypeScript desktop shell.
- Pure-black/dark-first UI tokens.
- UI primitives: `Button`, `IconButton`, `Surface`, `Typography`, `Input`, `Textarea`, `Tag`/`Chip`, and `Skeleton`.
- JMAP-backed Inbox, safe message reading, local drafts, reply, and compose screens.
- JMAP read/submission provider and future IMAP/SMTP provider placeholder.
- AI provider/action interfaces for summarize, tags, action items, drafts, draft improvement, send checks, and writing-style analysis.
- SQLite migration drafts for account metadata, message bodies, attachments, AI artifacts,
  sync state, and preferences.
- Runtime SQLite repositories through the official Tauri SQL plugin.
- Native OS credential-manager storage for JMAP secrets.
- Boundary check that blocks Tauri imports in shared core packages and direct `invoke` calls in React source.

## Current JMAP Account Path

Milestone 1 adds a first read-only JMAP path:

- Settings can save a Stalwart/JMAP account.
- Connection testing validates JMAP session discovery and mailbox access.
- Mailboxes and initial Inbox message metadata load through `MailProvider`.
- JMAP message metadata is normalized into YuMail `Message` objects.
- Account, mailbox, message, and sync metadata persist locally through a repository interface.

Secrets are not stored in SQLite rows or ordinary browser storage. Account records keep
only a credential reference. The Tauri secure-storage adapter resolves that reference
through Windows Credential Manager, macOS Keychain, or Linux Secret Service.

## Current Message Reading Path

Milestone 2 adds safe Inbox message reading:

- Clicking an Inbox row calls `ThreadReadingService`, not JMAP code from React.
- The service checks the account/provider-keyed local detail cache before fetching.
- JMAP `Email/get` body values and body structure normalize into YuMail message models.
- Plain text renders as text.
- HTML is sanitized with DOMPurify before it reaches the reading panel.
- Non-embedded image sources are removed by default and reported in the UI.
- Attachment filename, content type, and available size are displayed.

Raw HTML is cached so it can be re-sanitized under current renderer policy. It is never
rendered directly.

## Desktop Persistence

Milestone 2.5 makes SQLite the desktop runtime source of truth:

- `@tauri-apps/plugin-sql` opens `sqlite:yumail.sqlite3`.
- Rust registers migrations 0001 through 0004.
- Pending migrations run when the database is first opened during app startup.
- Account metadata, JMAP configuration references, mailboxes, messages, recipients,
  tags, body cache, attachments, local drafts, sync states, and preferences persist in
  SQLite.

The database lives in Tauri's app configuration directory. With the current
`com.yumail.desktop` identifier, the expected locations are:

- Windows: `%APPDATA%\com.yumail.desktop\yumail.sqlite3`
- Linux: `$XDG_CONFIG_HOME/com.yumail.desktop/yumail.sqlite3`
- macOS: `~/Library/Application Support/com.yumail.desktop/yumail.sqlite3`

Stronghold was not added because it requires a vault-password lifecycle. Using a
hardcoded password or storing it beside the vault would not improve security. YuMail
instead uses the operating system credential manager and fails closed if it is
unavailable.

The app performs deletion-only cleanup of the legacy
`yumail.development-secrets.v1` and `yumail.mail-metadata.v1` browser-storage keys.
There is no browser-storage persistence fallback.

## Compose And Send

Milestone 3 adds a plain-text compose workflow:

- New and reply drafts are created through `ComposeService`.
- Draft changes autosave to SQLite and survive restart.
- Reply drafts use Reply-To when available, preserve the subject, and retain RFC
  Message-ID reference context.
- Recipient validation runs before submission.
- The secure credential reference is resolved only when the user clicks Send.
- Successful submission removes the local draft; failed submission leaves it available
  for correction or retry.

The JMAP provider first loads sending identities and Drafts/Sent mailbox roles. It then
sends one JMAP request containing `Email/set` followed by `EmailSubmission/set`. The
submission references the newly created Email by its creation id.
`onSuccessUpdateEmail` removes the draft keyword and transitions the Email to Sent.

Drafts are local-only. Provider-side draft synchronization, outgoing attachments, rich
text/HTML composition, scheduled send, and send queues are deferred.

## Important Guardrails

- Secrets are referenced by secure-storage keys, not stored in ordinary SQLite rows.
- AI is manual by default.
- Remote images are blocked by default in the renderer contract.
- Generic IMAP/SMTP is a placeholder only.
- Tauri-specific code stays in `apps/desktop` and `packages/platform-tauri`.
