# YuMail Roadmap

This roadmap maps the PRD milestones to implementation order. Milestone 0 is intentionally foundation-only.

## Milestone 0 - Foundation

Status: implemented.

- Monorepo and pnpm workspace.
- Shared TypeScript config.
- Tauri v2 + Vite + React desktop scaffold.
- Dark app shell.
- UI primitives and theme tokens.
- Package boundaries and interfaces.
- SQLite schema draft.
- Architecture docs and boundary checks.

Acceptance:

- The app shell renders.
- Packages build or typecheck.
- Core packages do not import Tauri.

## Milestone 1 - JMAP Account

Status: implemented for initial read-only metadata listing.

- Stalwart/JMAP account settings.
- Secure credential storage selection and implementation.
- JMAP session discovery.
- Account discovery.
- Mailbox list.
- Initial inbox query.
- Store metadata locally.

Acceptance:

- A user can connect one Stalwart/JMAP account.
- Inbox metadata loads through `MailProvider`, not React components.

Remaining hardening:

- verify against a live Stalwart server and GUI Tauri runtime.

## Milestone 2 - Read And Render

Status: implemented for single-message Inbox reading.

- Fetch message detail through `MailProvider` and `ThreadReadingService`.
- Cache normalized message detail by account and provider message ID.
- Normalize JMAP body values, body structure, flags, recipients, and attachments.
- Render plain text without HTML interpretation.
- Sanitize HTML with DOMPurify before display.
- Block and report remote images by default.
- Harden external links.
- Display attachment metadata without download or open actions.

Acceptance:

- A user can safely read cached or fetched email.

Remaining hardening:

- verify message detail reads against a live Stalwart server.
- add a real platform external-link opener before enabling richer link actions.
- add provider-backed multi-message thread assembly when needed by reply workflows.

## Milestone 2.5 - Desktop Storage And Credential Hardening

Status: implemented.

- Official Tauri SQL plugin with SQLite support.
- Rust-registered migrations 0001-0006.
- SQL-backed account, mailbox, message, detail, attachment, sync, and preference repositories.
- JMAP configuration and credential-reference table.
- Native OS credential manager integration through the secure-storage adapter.
- Removal of runtime browser-backed metadata and secret persistence.
- Persistence and migration tests against a real SQLite file.

Acceptance:

- Desktop mail state survives restart in SQLite.
- SQLite contains credential references, never credential values.
- Missing OS credential storage fails closed without a plaintext fallback.

Remaining hardening:

- verify SQL plugin migrations and Windows Credential Manager behavior in a packaged
  Windows build.
- decide whether database-at-rest encryption is required beyond OS profile protection.

## Milestone 3 - Compose And Send

Status: implemented for manual plain-text JMAP submission.

- Plain-text compose editor.
- New and reply draft creation through `ComposeService`.
- SQLite-backed local draft autosave, reload, and discard.
- Reply-To, subject, Message-ID, References, and provider thread context.
- Exact JMAP sending identity selection.
- JMAP `Email/set` plus `EmailSubmission/set` using creation references.
- Drafts-to-Sent transition after successful submission.
- Explicit user-triggered Send with loading, success, and error states.

Acceptance:

- A user can compose and send a new message manually.
- A user can create and send a reply manually.
- Failed submissions retain the local draft.

Remaining hardening:

- verify submission against a live Stalwart server and packaged desktop runtime.
- add outgoing attachment upload and submission.
- add rich-text/HTML composition.
- decide whether provider-side draft synchronization is needed.
- add offline send queue only as an explicit future feature.

## Milestone 3.1 - Windows Development Parity

Status: implemented.

- Cross-platform `build:packages` script with explicit package filters instead of a
  quoted workspace glob.
- Cross-platform test runner script that discovers package test files without shell
  glob expansion.
- Strict production browser-storage boundary: no desktop React localStorage or
  sessionStorage references remain.
- Tauri desktop icon assets committed and explicitly referenced in `tauri.conf.json`.
- Empty Cargo `[package.metadata]` table added to avoid noisy missing-metadata output.
- README documents Windows Rust/MSVC/WebView2/Credential Manager prerequisites and the
  next Windows verification commands.

Acceptance:

- Windows `pnpm test`, `pnpm check`, and `pnpm build` can run after `pnpm install`.
- Windows `pnpm --filter @yumail/desktop tauri:dev` can progress past the missing
  `icons/icon.ico` failure.
- Linux package build, checks, and Rust gates remain working.

## Milestone 3.5 - Compose Send Hardening

Status: implemented.

- JMAP submission failures after Email creation return structured failed send results.
- Best-effort cleanup destroys only the temporary outgoing Email created for the failed
  send.
- UI keeps the local draft on failed send and warns if a server draft may remain.
- Recipient parsing supports display names, quoted display names with commas, multiple
  delimiters, and consistent To/Cc/Bcc validation.
- Send results include sent/failed state, cleanup state, provider ids where available,
  and user-facing error details.
- Windows/Stalwart live smoke-test checklist is documented before AI work starts.

Acceptance:

- A failed JMAP submission cannot incorrectly clear the local draft.
- Cleanup attempts and warnings are visible to the UI and tests.
- Manual live validation steps are ready for Windows + Stalwart.

## Milestone 3.6 - JMAP Discovery Diagnostics

Status: implemented.

- Domain/base/session URL input normalization for generic JMAP servers.
- Well-known discovery with pragmatic `/jmap/session` fallback.
- Manual redirect handling for 301, 302, 303, 307, and 308.
- Same-origin-only Authorization forwarding across redirects.
- Session validation for required JMAP fields and Mail capability.
- Separate storage for original input, canonical discovered session URL, and session
  `apiUrl`.
- Desktop JMAP HTTP requests use the Tauri platform HTTP adapter instead of WebView
  `fetch`.
- Settings connection tests display safe structured diagnostics without secrets.

Acceptance:

- A plain domain, root URL, direct `/.well-known/jmap`, or direct `/jmap/session` can
  discover a valid JMAP-compatible server.
- The Stalwart-style `/.well-known/jmap` to `/jmap/session` redirect works generically.
- Discovery failures show actionable diagnostics instead of a single generic message.

## Milestone 3.7 - JMAP Auth Modes

Status: implemented.

- Password / Basic Auth is the default account setup mode.
- Bearer token mode remains available for token-based JMAP servers.
- Basic Auth uses the account email address as username and sends
  `Authorization: Basic <base64(email:password)>`.
- JMAP account metadata persists auth mode and optional non-secret username metadata in
  SQLite; password/token values remain only in secure storage.
- Connection diagnostics show auth mode and Basic username without showing secrets.

Acceptance:

- Stalwart-style password authentication can use a plain password/app-password without
  `password:` or `user:` prefixes.
- Bearer-token servers can still be configured explicitly.

## Milestone 3.8 - Compose And Plain-Text Polish

Status: implemented.

- Compose uses a dedicated editor-and-drafts workspace instead of sharing space with
  the Inbox list.
- Send and Discard remain outside the scrolling editor region and visible at the bottom
  of the compose panel.
- The message body editor has a bounded, comfortable writing area without introducing
  document-level horizontal scrolling.
- Plain-text messages preserve original line breaks and blank lines.
- Quoted reply lines remain text-only and receive distinct visual treatment based on
  renderer-provided quote metadata.
- Sanitized HTML rendering and remote-image blocking are unchanged.

Acceptance:

- Compose actions remain accessible while recipient fields and body content scroll.
- Plain-text messages and quoted replies remain readable without HTML interpretation.

## Milestone 4 - AI Provider Layer

Status: implemented for provider settings and connection testing.

- OpenAI-compatible provider configuration and normalized base URLs.
- Optional model discovery through `/models` with manual model entry fallback.
- Static one-token `/chat/completions` connection test for the selected model.
- SQLite-backed provider metadata and generation defaults.
- Native OS credential-manager storage for API keys.
- Secret-free authentication, HTTP, network, JSON, and response-shape diagnostics.
- Desktop Settings UI for provider name, base URL, authentication, API key, model,
  temperature, max tokens, enabled state, test, and save.

Acceptance:

- A configured AI endpoint can be called manually without exposing secrets in ordinary DB rows.
- No email content is sent during provider setup or connection testing.

Remaining before AI actions:

- Add custom non-secret header metadata only if a real compatible endpoint requires it.
- Verify a live custom endpoint and Windows Credential Manager flow in the Tauri runtime.

## Milestone 5A - Manual Thread Summary

Status: implemented for the currently opened message.

- Versioned `summarize-thread` prompt with structured output normalization.
- Explicit prompt-injection defense for untrusted email content.
- Privacy-safe projection of visible message text and attachment metadata.
- First-use and regenerate privacy review before each provider request.
- Default-provider and secure API-key resolution through `ThreadSummaryService`.
- SQLite summary cache with provider/model/prompt/input-hash metadata.
- Reading-panel loading, error, cached result, and regenerate states.

Acceptance:

- Opening a message can load a cached summary without contacting the provider.
- A summary request runs only after explicit privacy confirmation.
- Raw HTML, remote images, attachment contents, and secrets are excluded.

Remaining hardening:

- Verify summary generation against a live custom endpoint on Windows.

## Milestone 5B - Thread Assembly And AI Cache Controls

Status: implemented.

- JMAP `Thread/get` membership lookup plus full `Email/get` detail assembly.
- Chronological normalized thread messages with persisted local thread metadata.
- Selected-message fallback when provider or cached thread context is unavailable.
- `summarize-thread` prompt `2.0.0` with ordered multi-message payloads.
- Thread-scoped deterministic summary cache with message-scoped fallback.
- Privacy review with message count and explicit included/excluded fields.
- Delete-current and clear-account summary cache controls.

Acceptance:

- Any selected message in an assembled thread resolves the same thread cache scope.
- Thread content changes produce a different input hash.
- Cache deletion never deletes mail, provider settings, or credentials.

Remaining hardening:

- Verify multi-message assembly and summary generation against live Stalwart and AI
  endpoints on Windows.
- Add explicit thread-size/token limits before supporting very large conversations.

## Milestone 5 - AI Actions

- Suggest tags.
- Extract action items.
- Draft reply.
- Improve draft.
- Check before send.
- Persist AI artifacts.

Acceptance:

- Each AI action runs only after user action and stores output.

## Milestone 6 - Writing Style

- Fetch recent sent samples.
- Generate writing-style profile.
- Allow user edits.
- Use profile in draft reply.

Acceptance:

- Draft replies can use a saved writing-style profile.

## Milestone 7 - MVP Polish

- Loading states.
- Error states.
- Settings polish.
- Packaging.
- Security review.
- Performance cleanup.

Acceptance:

- Usable Windows desktop MVP.

## Milestone 8 - Generic IMAP/SMTP Provider

- Introduce sidecar if selected.
- Implement IMAP provider.
- Implement SMTP sending.
- Normalize into the same mail models.
- Special folder detection.
- Recent sent samples.
- Safe MIME parsing.

Acceptance:

- A user can add a generic IMAP/SMTP account without UI rewrite.
