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

Milestone 2.5 replaces browser-backed persistence without changing these service
contracts. Core still receives repository and secret-storage ports through dependency
injection.

Milestone 3 adds `ComposeService`, which owns:

- new and reply draft creation.
- recipient parsing and send-time validation.
- local draft updates and deletion.
- secure credential lookup.
- explicit, user-triggered provider submission.

React edits draft models and calls this service. It does not construct JMAP requests or
access SQLite directly. Draft creation and autosave never invoke the provider; only
`sendDraft` can submit mail.

### `packages/mail`

Owns normalized mail provider contracts.

Current provider surfaces:

- `MailProvider`
- `JmapProvider` for JMAP session discovery, mailbox listing, message reads, and manual
  submission.
- `ImapSmtpProvider` placeholder for future generic IMAP/SMTP.

The UI must consume normalized YuMail models, not protocol-specific JMAP or IMAP data.
JMAP `Email/get` body structures and values are normalized into `MessageDetail`,
`MessageBodyPart`, and `Attachment` models before they leave this package.

JMAP submission remains fully inside `JmapProvider`:

1. The account is checked for `urn:ietf:params:jmap:submission`, and submission
   requests advertise that capability.
2. `Identity/get` selects an exact or permitted wildcard sending identity.
3. `Mailbox/get` locates Drafts and Sent roles.
4. `Email/set` creates an outgoing plain-text Email with `$draft` and `$seen`.
5. `EmailSubmission/set` references that Email creation in the same JMAP request.
6. `onSuccessUpdateEmail` removes `$draft`, moves the Email to Sent, and removes the
   temporary Drafts membership.

Replies include JMAP `inReplyTo` and `references` values derived from normalized RFC
message identifiers. Provider message/thread IDs remain internal context and never leak
into React protocol logic.

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

Owns SQLite schema, repository contracts, and the Tauri-independent SQL repository
implementation. The schema stores provider metadata, message cache data, AI artifacts,
sync state, and preferences.

Repository ports are split by responsibility:

- `AccountRepository`
- `MailboxRepository`
- `MessageRepository`
- `MessageDetailRepository`
- `SyncStateRepository`
- `DraftRepository`
- `UserPreferenceRepository`

`MailMetadataRepository` composes the mail-related ports used by core services.
`SqliteMailMetadataRepository` depends only on the small `SqlDatabase` port, so its
mapping logic is testable with Node SQLite and does not import Tauri.

Milestone 2 adds a one-to-one `message_bodies` cache keyed by `message_id` with a unique
`account_id` and `provider_message_id` pair. Plain and raw HTML bodies are stored once.
Body-part structure is stored as metadata JSON without duplicating body payloads.

Milestone 2.5 adds `jmap_account_configs` for JMAP URLs, discovered provider IDs, and
credential references. Secret values are never stored in this table or any other SQLite
table.

Milestone 3 adds `local_drafts`. Local drafts contain account and reply references,
recipient JSON, subject, plain-text body, and timestamps. They are local-only and are
deleted after confirmed provider submission or explicit discard. Migration 0004 also
adds cached `inReplyTo` and `references` metadata to messages.

Desktop runtime persistence uses `SqliteMailMetadataRepository` through the platform
database adapter. React components do not open SQLite directly.

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
- SQLite database
- filesystem
- notifications
- opener
- app storage

This is the only package allowed to import `@tauri-apps/*`.

The database adapter wraps `@tauri-apps/plugin-sql` and opens
`sqlite:yumail.sqlite3`. The SQL plugin stores the file below Tauri's app configuration
directory.

Desktop secure-storage commands use the Rust `keyring` crate:

- Windows Credential Manager
- macOS Keychain
- Linux Secret Service with persistent keyring support

There is no localStorage or plaintext-file fallback. If the operating system credential
store is unavailable, account save/refresh fails with a clear error. Stronghold is not
used because YuMail does not yet have a safe user-managed vault-password lifecycle;
hardcoding or storing that password beside the vault would weaken the design.

### Desktop Database Initialization

Rust registers migrations 0001 through 0004 with the SQL plugin for
`sqlite:yumail.sqlite3`. The plugin applies pending migrations when the desktop database
is first loaded during service startup.

### Desktop Runtime Assets

Tauri desktop icons live under `apps/desktop/src-tauri/icons` and are explicitly listed
in `tauri.conf.json`. The boundary checker verifies those paths exist so Windows
development cannot regress to the missing `icons/icon.ico` build failure.

## Enforced Rules

Run:

```bash
pnpm check:boundaries
```

The boundary script fails if:

- `packages/core`, `packages/mail`, `packages/ai`, `packages/db`, `packages/renderer`, `packages/search`, or `packages/shared` import Tauri-specific APIs.
- React source in `apps/desktop/src` or `packages/ui/src` calls Tauri `invoke` directly.
- React source imports the SQL or Stronghold plugins directly.
- production desktop code references localStorage/sessionStorage.
- Tauri icon assets referenced by `tauri.conf.json` are missing.

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
  -> @tauri-apps/plugin-sql

apps/desktop/src-tauri
  -> tauri-plugin-sql
  -> OS credential manager through keyring
```

Provider implementations must remain behind `MailProvider`. AI request implementations must remain behind `AiProvider` and `AiActions`.
