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
- Rust-registered migrations 0001-0003.
- SQL-backed account, mailbox, message, detail, attachment, sync, and preference repositories.
- JMAP configuration and credential-reference table.
- Native OS credential manager integration through the secure-storage adapter.
- Removal of runtime browser-backed metadata and secret persistence.
- One-time deletion of legacy development browser-storage keys.
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

- Compose editor.
- Reply flow.
- JMAP send/submission path.
- Local drafts where needed.
- Send confirmation/guardrails.

Acceptance:

- A user can send a reply manually.

## Milestone 4 - AI Provider Layer

- AI settings.
- OpenAI-compatible provider adapter.
- Test connection.
- Secure API key storage.
- Prompt version registry.

Acceptance:

- A configured AI endpoint can be called manually without exposing secrets in ordinary DB rows.

## Milestone 5 - AI Actions

- Summarize thread.
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
