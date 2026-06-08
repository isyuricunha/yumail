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

## Milestone 2 - Read And Render

- [x] Extend `MailProvider` with internal/provider message detail lookup.
- [x] Fetch JMAP message metadata, body values, body structure, and attachments.
- [x] Normalize message detail, body-part metadata, flags, and attachment metadata.
- [x] Add cache-first `ThreadReadingService` orchestration in `packages/core`.
- [x] Add account/provider-keyed message detail persistence.
- [x] Add the `message_bodies` SQLite cache migration.
- [x] Render plain text without interpreting HTML.
- [x] Sanitize HTML with DOMPurify before React rendering.
- [x] Block remote images by default and expose a visible blocked state.
- [x] Harden external links and remove unsafe protocols.
- [x] Add desktop loading, error, empty, body, recipient, and attachment states.
- [x] Test JMAP detail normalization, cache behavior, sanitization, and image blocking.

## Milestone 2.5 - Desktop Storage And Credential Hardening

- [x] Add the official Tauri SQL plugin with SQLite support.
- [x] Register and apply migrations 0001-0003 through the desktop runtime.
- [x] Add focused account, mailbox, message, detail, sync, and preference repositories.
- [x] Persist JMAP configuration and credential references without secret values.
- [x] Replace runtime metadata localStorage with SQLite.
- [x] Replace secret localStorage fallback with native OS credential storage.
- [x] Keep React and shared packages independent of SQL and credential plugins.
- [x] Test migration application and SQLite persistence across database reopen.
- [x] Test secure-storage reference use for saved connection checks and refresh.

## Milestone 3 - Compose And Send

- [x] Extend normalized mail models with local drafts and reply context.
- [x] Implement JMAP identity selection and manual Email submission.
- [x] Create outgoing Email and EmailSubmission objects in one JMAP request.
- [x] Move successfully submitted Email objects from Drafts to Sent.
- [x] Normalize Email creation and submission failures.
- [x] Add `ComposeService` for create, update, discard, reply, and manual send.
- [x] Validate and normalize recipients before sending.
- [x] Persist local drafts and RFC reply metadata in SQLite migration 0004.
- [x] Add compose, reply, autosave, discard, send, success, and error UI states.
- [x] Keep provider calls, SQLite, credentials, and JMAP payloads out of React.
- [x] Test JMAP payloads, reply metadata, drafts, failures, and explicit-send behavior.

## Milestone 3.1 - Windows Development Parity

- [x] Replace the quoted workspace-glob package build with explicit package filters.
- [x] Replace shell-expanded test globs with `scripts/run-tests.mjs`.
- [x] Remove the production desktop localStorage cleanup path.
- [x] Keep the boundary checker strict against all desktop React browser-storage usage.
- [x] Add committed Tauri desktop icon assets, including `icons/icon.ico`.
- [x] Explicitly list committed icon assets in `tauri.conf.json`.
- [x] Add a check that referenced Tauri icon assets exist.
- [x] Add an empty Cargo `[package.metadata]` table.
- [x] Document Windows Rust/MSVC/WebView2/keyring prerequisites and next commands.

## Discovered Follow-ups

- [x] Add automated tests when Milestone 1 introduces executable JMAP/account logic.
- [x] Decide whether Drizzle is needed when repositories are implemented: not currently;
  explicit SQL keeps the schema and provider mapping visible.
- [x] Replace development credential storage with native OS credential storage.
- [x] Replace desktop localStorage metadata persistence with SQLite repositories.
- [ ] Verify `pnpm dev` opens a Tauri window on a Windows or Linux GUI environment.
- [ ] Verify packaged Windows persistence and Credential Manager behavior.
- [ ] Decide whether SQLite database-at-rest encryption is needed.
- [ ] Verify JMAP account setup against a live Stalwart server.
- [ ] Verify JMAP body detail fixtures against a live Stalwart server.
- [ ] Verify JMAP submission against a live Stalwart server.
- [ ] Verify local draft autosave and native credential retrieval in a packaged desktop app.
- [ ] Add a real platform external-link opener before richer link actions.
- [x] Keep Milestone 3 replies single-message based and preserve RFC reply references;
  provider-backed multi-message thread assembly remains a later reading enhancement.
- [ ] Add outgoing attachment upload/send support.
- [ ] Add rich-text/HTML composition.
- [ ] Decide whether provider-side draft synchronization is needed.
