# YuMail Roadmap

This roadmap maps the PRD milestones to implementation order. Milestone 0 is intentionally foundation-only.

## Milestone 0 - Foundation

Status: in progress.

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

## Milestone 2 - Read And Render

- Fetch message and thread details.
- Plain text rendering.
- Safe HTML rendering.
- Remote image blocking.
- Attachment metadata display.

Acceptance:

- A user can safely read cached or fetched email.

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
