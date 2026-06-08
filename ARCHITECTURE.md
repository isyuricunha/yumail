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

### `packages/mail`

Owns normalized mail provider contracts.

Current provider surfaces:

- `MailProvider`
- `JmapProvider` placeholder for the MVP provider.
- `ImapSmtpProvider` placeholder for future generic IMAP/SMTP.

The UI must consume normalized YuMail models, not protocol-specific JMAP or IMAP data.

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

Owns SQLite schema and future repositories. The initial migration stores provider metadata, message cache data, AI artifacts, sync state, and preferences.

Secrets are not stored directly. Tables use references such as `provider_config_reference` and `api_key_reference`.

### `packages/renderer`

Owns email rendering safety contracts:

- safe HTML mode
- plain text mode
- remote image blocking
- tracking pixel detection

No raw email HTML should be rendered directly in the main app DOM.

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

packages/core
  -> packages/mail
  -> packages/ai
  -> packages/db
  -> packages/shared

packages/mail, packages/ai, packages/db, packages/renderer, packages/search
  -> packages/shared

packages/platform-tauri
  -> @tauri-apps/api
```

Provider implementations must remain behind `MailProvider`. AI request implementations must remain behind `AiProvider` and `AiActions`.
