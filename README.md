# YuMail

YuMail is a desktop-first, privacy-first email client based on the repository PRD.
The current implementation supports JMAP account setup, Inbox metadata loading, and a
cache-first safe message reading path.

This is not a complete mail client yet. Continuous sync, IMAP/SMTP, Gmail, Outlook,
sending, and live AI calls are intentionally deferred.

## Requirements

- Node.js 24+
- pnpm 11+
- Rust and Cargo
- Tauri desktop prerequisites for your OS

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
- JMAP-backed Inbox and safe message reading screens, plus deferred Compose controls.
- JMAP read provider and future IMAP/SMTP provider placeholder.
- AI provider/action interfaces for summarize, tags, action items, drafts, draft improvement, send checks, and writing-style analysis.
- SQLite migration drafts for account metadata, message bodies, attachments, AI artifacts,
  sync state, and preferences.
- Boundary check that blocks Tauri imports in shared core packages and direct `invoke` calls in React source.

## Current JMAP Account Path

Milestone 1 adds a first read-only JMAP path:

- Settings can save a Stalwart/JMAP account.
- Connection testing validates JMAP session discovery and mailbox access.
- Mailboxes and initial Inbox message metadata load through `MailProvider`.
- JMAP message metadata is normalized into YuMail `Message` objects.
- Account, mailbox, message, and sync metadata persist locally through a repository interface.

Secrets are not stored in ordinary SQLite rows. Full OS keychain/Stronghold storage is still pending; until then the desktop app uses the platform secure-storage abstraction first and falls back to an explicit development-only localStorage adapter with an in-app warning.

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
rendered directly. The current desktop repository remains localStorage-backed; the
SQLite `message_bodies` migration defines the intended persistent body cache shape.

## Important Guardrails

- Secrets are referenced by secure-storage keys, not stored in ordinary SQLite rows.
- AI is manual by default.
- Remote images are blocked by default in the renderer contract.
- Generic IMAP/SMTP is a placeholder only.
- Tauri-specific code stays in `apps/desktop` and `packages/platform-tauri`.
