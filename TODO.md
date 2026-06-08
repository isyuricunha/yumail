# YuMail TODO

## Milestone 0 - Foundation

- [x] Locate and read the PRD.
- [x] Create the monorepo workspace structure.
- [x] Add shared TypeScript and lint configuration.
- [x] Add the Tauri v2 + Vite + React desktop app.
- [x] Add dark-first UI primitives and theme tokens.
- [x] Add placeholder package boundaries and provider interfaces.
- [x] Add the initial SQLite schema draft.
- [x] Add setup, architecture, and roadmap documentation.
- [x] Run install, build, typecheck, lint, and architecture boundary checks.

## Milestone 1 - JMAP Account

- [x] Add JMAP session discovery.
- [x] Add read-only mailbox listing through `MailProvider`.
- [x] Add read-only Inbox message metadata listing through `MailProvider`.
- [x] Normalize JMAP messages into YuMail message models.
- [x] Add account setup and connection testing UI in Settings.
- [x] Persist account, mailbox, message, and sync metadata locally.
- [x] Keep secrets out of metadata storage and SQLite rows.
- [x] Add focused tests for JMAP normalization and secret-free metadata persistence.

## Discovered Follow-ups

- [x] Add automated tests when Milestone 1 introduces executable JMAP/account logic.
- [ ] Decide whether Drizzle is needed when repositories are implemented.
- [ ] Replace development credential storage with OS keychain or Tauri Stronghold.
- [ ] Replace desktop localStorage metadata persistence with SQLite repositories.
- [ ] Verify `pnpm dev` opens a Tauri window on a Windows or Linux GUI environment.
- [ ] Verify JMAP account setup against a live Stalwart server.
