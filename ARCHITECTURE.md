# YuMail Architecture

YuMail follows the PRD architecture: desktop now, shared TypeScript core, JMAP-first mail provider design, and platform APIs behind adapters.

## Package Boundaries

### `apps/desktop`

Owns the desktop application shell:

- Tauri v2 configuration and Rust commands.
- Vite + React bootstrap.
- Desktop layout and routing.
- Imports reusable packages.

Desktop React code must not call Tauri `invoke` directly for business logic. It should call product services or platform adapters.

### `packages/ui`

Owns reusable React UI primitives and dark design tokens. It has no product business logic and no Tauri dependency.

Current primitives:

- `Button`
- `IconButton`
- `Surface`
- `Typography`
- `Input`
- `Textarea`
- `Tag` / `Chip`
- `Skeleton`

### `packages/core`

Owns product orchestration contracts and service composition. It coordinates mail, AI, db, search, renderer, and platform adapters as the app grows.

It must not import Tauri, React DOM, or React Native.

Milestone 1 adds `MailAccountService`, which coordinates:

- JMAP account setup.
- connection testing.
- mailbox listing.
- initial Inbox metadata loading.
- local metadata repository writes.
- secret-storage references.

Milestone 2 adds `ThreadReadingService`, which coordinates:

- cache-first message detail loading.
- account and secret lookup through existing adapters.
- provider detail fetches through `MailProvider`.
- local message detail cache updates.

### `packages/mail`

Owns normalized mail provider contracts.

Current provider surfaces:

- `MailProvider`
- `JmapProvider` for read-only JMAP session discovery, mailbox listing, message metadata
  listing, and full message detail reads.
- `ImapSmtpProvider` placeholder for future generic IMAP/SMTP.

The UI must consume normalized YuMail models, not protocol-specific JMAP or IMAP data.
JMAP `Email/get` body structures and values are normalized into `MessageDetail`,
`MessageBodyPart`, and `Attachment` models before they leave this package.

### `packages/ai`

Owns AI provider and action contracts. AI actions are user-triggered and never send, delete, archive, move, or tag mail automatically.

Current action contracts:

- `summarizeThread`
- `suggestTags`
- `extractActionItems`
- `draftReply`
- `improveDraft`
- `checkBeforeSend`
- `analyzeWritingStyle`

### `packages/db`

Owns SQLite schema and repository contracts. The schema stores provider metadata,
message cache data, AI artifacts, sync state, and preferences.

Milestone 2 adds a one-to-one `message_bodies` cache keyed by `message_id` with a unique
`account_id` and `provider_message_id` pair. Plain and raw HTML bodies are stored once.
Body-part structure is stored as metadata JSON without duplicating body payloads.

Secrets are not stored directly. Tables use references such as `provider_config_reference` and `api_key_reference`.

The first desktop repository implementation is local metadata persistence in `apps/desktop` behind the `MailMetadataRepository` contract. Replacing it with SQLite repositories should not affect React feature components.

### `packages/renderer`

Owns email rendering safety contracts:

- safe HTML mode
- plain text mode
- remote image blocking
- tracking pixel detection
- external link hardening

Milestone 2 uses DOMPurify before HTML reaches React. Active and embedded content,
event handlers, inline styles, remote CSS vectors, and unsafe URL protocols are removed.
A second detached-DOM pass removes non-embedded image sources by default and hardens
HTTP(S) and mail links with a new browsing context, `noopener`, `noreferrer`, and no
referrer.

Raw cached email HTML must never be rendered directly in the app DOM.

### `packages/search`

Owns the search service boundary. SQLite FTS and future semantic search belong here, not in React components.

### `packages/shared`

Owns small shared types, constants, and errors that are safe across desktop and future mobile.

### `packages/platform-tauri`

Owns Tauri-specific TypeScript adapters:

- secure storage
- filesystem
- notifications
- opener
- app storage

This is the only package allowed to import `@tauri-apps/*`.

Desktop credential storage currently tries the platform secure-storage adapter and falls back to a warning-heavy development localStorage adapter until an OS keychain or Stronghold adapter is configured.

## Enforced Rules

Run:

```bash
pnpm check:boundaries
```

The boundary script fails if:

- `packages/core`, `packages/mail`, `packages/ai`, `packages/db`, `packages/renderer`, `packages/search`, or `packages/shared` import Tauri-specific APIs.
- React source in `apps/desktop/src` or `packages/ui/src` calls Tauri `invoke` directly.

## Dependency Direction

```text
apps/desktop
  -> packages/ui
  -> packages/core
  -> packages/renderer

packages/core
  -> packages/mail
  -> packages/ai
  -> packages/db
  -> packages/shared

packages/mail, packages/ai, packages/db, packages/search
  -> packages/shared

packages/renderer
  -> DOMPurify

packages/platform-tauri
  -> @tauri-apps/api
```

Provider implementations must remain behind `MailProvider`. AI request implementations must remain behind `AiProvider` and `AiActions`.
