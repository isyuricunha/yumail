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
- [x] Register and apply migrations 0001-0006 through the desktop runtime.
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

## Milestone 3.5 - Compose Send Hardening

- [x] Return structured send results for JMAP success and failure outcomes.
- [x] Attempt best-effort server cleanup when Email creation succeeds but submission
  creation fails.
- [x] Warn when failed-send cleanup does not confirm removal of the server draft.
- [x] Keep local drafts unless send is confirmed successful or the user discards them.
- [x] Parse display names and quoted display names containing commas.
- [x] Validate To/Cc/Bcc with user-facing recipient errors.
- [x] Test cleanup success, cleanup warning, draft retention, parser edge cases, and
  secret-free send results.
- [x] Add a Windows/Stalwart live smoke-test checklist before AI integration.

## Milestone 3.6 - JMAP Discovery Diagnostics

- [x] Normalize domain, root URL, well-known URL, and direct session URL inputs.
- [x] Try `/.well-known/jmap` first and fall back to `/jmap/session` for root inputs.
- [x] Follow 301, 302, 303, 307, and 308 redirects with relative `Location` support.
- [x] Preserve Authorization only on same-origin redirects.
- [x] Validate required JMAP session fields and Mail capability.
- [x] Store original input, canonical discovered session URL, and JMAP `apiUrl`
  separately.
- [x] Add safe structured connection diagnostics with no credential leakage.
- [x] Route desktop JMAP HTTP through the Tauri platform HTTP adapter.
- [x] Test Stalwart-style well-known redirect behavior generically.

## Milestone 3.7 - JMAP Auth Modes

- [x] Add explicit `basic` and `bearer` JMAP auth modes.
- [x] Default account setup to Password / Basic Auth.
- [x] Generate Basic Auth as `base64(email:password)`.
- [x] Keep Bearer token mode available as a non-default option.
- [x] Persist auth mode and optional non-secret username metadata in SQLite.
- [x] Keep password/token values only in secure storage.
- [x] Show auth mode and Basic username in diagnostics without leaking secrets.
- [x] Test Basic/Bearer headers, redirect auth handling, Stalwart-like Basic success,
  401 diagnostics, and secret-free diagnostics.

## Milestone 3.8 - Compose And Plain-Text Polish

- [x] Give compose a dedicated editor-and-drafts workspace.
- [x] Keep Send and Discard outside the scrolling compose editor.
- [x] Prevent document-level horizontal scrolling in the desktop shell.
- [x] Make the plain-text body editor comfortable and visibly editable.
- [x] Preserve received plain-text line breaks and blank lines.
- [x] Render quoted reply lines as safe React text with distinct styling.
- [x] Keep sanitized HTML and remote-image behavior unchanged.
- [x] Test multiline and nested quoted plain-text rendering metadata.

## Milestone 4 - AI Provider Settings

- [x] Add normalized OpenAI-compatible provider configuration models.
- [x] Add model discovery and a static minimal connection test.
- [x] Support manual model entry when model discovery is unavailable.
- [x] Persist provider metadata and only a credential reference in SQLite.
- [x] Store API keys through the existing OS credential-manager adapter.
- [x] Add migration 0007 and register it in the Tauri SQL startup path.
- [x] Add provider name, base URL, API key, model, temperature, max tokens, enabled,
  test, save, and diagnostic controls in Settings.
- [x] Keep AI HTTP construction and secret lookup outside React.
- [x] Add URL, request, response, persistence, secret-leak, and service-flow tests.
- [x] Keep email AI actions disabled during the provider-settings milestone.

## Milestone 5A - Manual Thread Summary

- [x] Add a versioned `summarize-thread` prompt definition and output normalizer.
- [x] Treat all email content as untrusted in the system prompt.
- [x] Project subject, sender, To/Cc, date, visible text, and safe attachment metadata.
- [x] Exclude raw HTML, remote images, Bcc, attachment contents, provider blob ids, and
  credentials.
- [x] Add structured OpenAI-compatible summary completion support.
- [x] Add `ThreadSummaryService` for privacy review, cache lookup, secure key lookup,
  provider execution, validation, and persistence.
- [x] Add migration 0008 and `SqliteAiSummaryRepository`.
- [x] Load cached summaries when reopening a message without calling the provider.
- [x] Add manual Summarize, privacy review, loading, error, cached result, and regenerate
  states to the reading panel.
- [x] Test prompt metadata/input, prompt injection defense, request construction,
  cache behavior, SQLite persistence, and secret leakage.

## Milestone 5B - Thread Assembly And AI Cache Controls

- [x] Implement JMAP `Thread/get` plus full `Email/get` message assembly.
- [x] Normalize and preserve chronological thread message order.
- [x] Persist thread metadata and link cached message details to internal thread IDs.
- [x] Fall back to the selected message when thread context is unavailable.
- [x] Advance `summarize-thread` to prompt version `2.0.0`.
- [x] Include safe per-message subject, sender, To/Cc, date, body text, and attachment
  metadata.
- [x] Exclude raw HTML, Bcc, remote/tracking URLs, attachment contents, provider IDs,
  and secrets.
- [x] Use thread-scoped cache keys with message-scoped fallback.
- [x] Add delete-current and clear-account AI summary cache controls.
- [x] Test assembly order, fallback, privacy projection, hash changes, deletion, and
  secret/body diagnostic leakage.

## Discovered Follow-ups

- [x] Add automated tests when Milestone 1 introduces executable JMAP/account logic.
- [x] Decide whether Drizzle is needed when repositories are implemented: not currently;
  explicit SQL keeps the schema and provider mapping visible.
- [x] Replace development credential storage with native OS credential storage.
- [x] Replace desktop localStorage metadata persistence with SQLite repositories.
- [ ] Verify `pnpm dev` opens a Tauri window on a Windows or Linux GUI environment.
- [ ] Verify packaged Windows persistence and Credential Manager behavior.
- [ ] Decide whether SQLite database-at-rest encryption is needed.
- [ ] Verify JMAP account setup against a live Stalwart server after the generic
  discovery fix.
- [ ] Verify JMAP body detail fixtures against a live Stalwart server.
- [ ] Verify JMAP submission against a live Stalwart server.
- [ ] Verify local draft autosave and native credential retrieval in a packaged desktop app.
- [ ] Add a real platform external-link opener before richer link actions.
- [x] Keep Milestone 3 replies single-message based and preserve RFC reply references;
  provider-backed multi-message thread assembly remains a later reading enhancement.
- [ ] Add outgoing attachment upload/send support.
- [ ] Add rich-text/HTML composition.
- [ ] Decide whether provider-side draft synchronization is needed.
- [ ] Add an optional JMAP Basic Auth username override if a server requires a username
  different from the email address.
- [ ] Verify AI provider setup against a live OpenAI-compatible endpoint on Windows.
- [ ] Verify manual summary generation against a live OpenAI-compatible endpoint on
  Windows.
- [x] Add provider-backed multi-message thread assembly for AI context.
- [x] Add user-facing AI summary cache deletion controls.
- [ ] Add explicit thread-size/token limits for very large conversations.
- [ ] Add custom provider headers only when required by a verified endpoint.
