import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  FilePenLine,
  FileText,
  ImageOff,
  Inbox,
  MailPlus,
  Paperclip,
  PanelLeft,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sparkles,
  Tags,
  Trash2,
  Reply as ReplyIcon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  JmapAccountSetupInput,
  JmapConnectionTestResult,
  MailAccountState,
  UpdateDraftInput
} from "@yumail/core";
import {
  createFoundationBootstrapState,
  parseRecipientInput
} from "@yumail/core";
import type {
  LocalDraft,
  Message,
  MessageDetail,
  Recipient,
  SendMessageResult
} from "@yumail/mail";
import { createEmailRenderer, type RenderedEmail } from "@yumail/renderer";
import {
  Button,
  Chip,
  IconButton,
  Input,
  Skeleton,
  Surface,
  Tag,
  Textarea,
  Typography
} from "@yumail/ui";
import {
  DESKTOP_SECURE_STORAGE_STATUS,
  createDesktopMailServices
} from "./services/mail-services";

type ActiveView = "inbox" | "thread" | "compose" | "settings";
type MessageDetailStatus = "idle" | "loading" | "ready" | "error";
type DraftSaveStatus = "idle" | "saving" | "saved" | "sending" | "error";

interface DraftEditorState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
}

interface NavigationItem {
  id: ActiveView;
  label: string;
  icon: LucideIcon;
}

const navigationItems: NavigationItem[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "thread", label: "Thread", icon: Archive },
  { id: "compose", label: "Compose", icon: MailPlus },
  { id: "settings", label: "Settings", icon: Settings }
];

const emptyMailState: MailAccountState = {
  mailboxes: [],
  inboxMessages: []
};

const emptyDraftEditor: DraftEditorState = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  bodyText: ""
};

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("inbox");
  const [mailState, setMailState] = useState<MailAccountState>(emptyMailState);
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [messageDetail, setMessageDetail] = useState<MessageDetail>();
  const [renderedEmail, setRenderedEmail] = useState<RenderedEmail>();
  const [messageDetailStatus, setMessageDetailStatus] = useState<MessageDetailStatus>("idle");
  const [messageDetailError, setMessageDetailError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [connectionTest, setConnectionTest] = useState<JmapConnectionTestResult>();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [activeDraft, setActiveDraft] = useState<LocalDraft>();
  const [draftEditor, setDraftEditor] = useState<DraftEditorState>(emptyDraftEditor);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [draftStatusMessage, setDraftStatusMessage] = useState<string>();
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const messageDetailRequestId = useRef(0);
  const draftSaveRequestId = useRef(0);
  const bootstrapState = useMemo(() => createFoundationBootstrapState(), []);
  const mailServices = useMemo(() => createDesktopMailServices(), []);
  const emailRenderer = useMemo(() => createEmailRenderer(window), []);
  const selectedMessage = mailState.inboxMessages.find((message) => message.id === selectedMessageId);

  useEffect(() => {
    let isMounted = true;

    void mailServices.accountService.loadState()
      .then((loadedState) => {
        if (!isMounted) {
          return;
        }

        setMailState(loadedState);
        setSelectedMessageId(loadedState.inboxMessages[0]?.id);
        if (loadedState.accountConfig) {
          return mailServices.composeService.listDrafts(
            loadedState.accountConfig.account.id
          );
        }

        return [];
      })
      .then((loadedDrafts) => {
        if (isMounted) {
          setDrafts(loadedDrafts ?? []);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setStatusMessage(getErrorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mailServices]);

  useEffect(() => {
    if (!activeDraft || !isDraftDirty) {
      return;
    }

    const requestId = draftSaveRequestId.current + 1;
    draftSaveRequestId.current = requestId;
    setDraftSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void saveDraftEditor(activeDraft.id, draftEditor)
        .then((savedDraft) => {
          if (draftSaveRequestId.current !== requestId) {
            return;
          }

          replaceDraft(savedDraft);
          setActiveDraft(savedDraft);
          setIsDraftDirty(false);
          setDraftSaveStatus("saved");
          setDraftStatusMessage("Draft saved locally.");
        })
        .catch((error: unknown) => {
          if (draftSaveRequestId.current === requestId) {
            setDraftSaveStatus("error");
            setDraftStatusMessage(getErrorMessage(error));
          }
        });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeDraft, draftEditor, isDraftDirty, mailServices]);

  async function runMailAction(action: () => Promise<void>) {
    setIsBusy(true);
    setStatusMessage(undefined);

    try {
      await action();
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleTestConnection(input: JmapAccountSetupInput) {
    await runMailAction(async () => {
      const result = await mailServices.accountService.testJmapConnection(input);
      setConnectionTest(result);
      setStatusMessage(result.message);
    });
  }

  async function handleSaveAccount(input: JmapAccountSetupInput) {
    await runMailAction(async () => {
      const savedState = await mailServices.accountService.saveJmapAccount(input);
      const savedDrafts = savedState.accountConfig
        ? await mailServices.composeService.listDrafts(
          savedState.accountConfig.account.id
        )
        : [];
      setMailState(savedState);
      setSelectedMessageId(savedState.inboxMessages[0]?.id);
      resetMessageDetail();
      setConnectionTest(undefined);
      setDrafts(savedDrafts);
      setActiveDraft(undefined);
      setDraftEditor(emptyDraftEditor);
      setActiveView("inbox");
      setStatusMessage("JMAP account saved and inbox metadata loaded.");
    });
  }

  async function handleRefreshInbox() {
    await runMailAction(async () => {
      const refreshedState = await mailServices.accountService.refreshInbox(
        mailState.accountConfig?.account.id
      );
      setMailState(refreshedState);
      setSelectedMessageId(refreshedState.inboxMessages[0]?.id);
      resetMessageDetail();
      setStatusMessage("Inbox metadata refreshed.");
    });
  }

  function resetMessageDetail() {
    messageDetailRequestId.current += 1;
    setMessageDetail(undefined);
    setRenderedEmail(undefined);
    setMessageDetailError(undefined);
    setMessageDetailStatus("idle");
  }

  async function handleOpenThread(message: Message) {
    const requestId = messageDetailRequestId.current + 1;
    messageDetailRequestId.current = requestId;
    setSelectedMessageId(message.id);
    setActiveView("thread");
    setMessageDetail(undefined);
    setRenderedEmail(undefined);
    setMessageDetailError(undefined);
    setMessageDetailStatus("loading");

    try {
      const result = await mailServices.threadReadingService.loadMessageDetail({
        accountId: message.accountId,
        messageId: message.id,
        providerMessageId: message.providerMessageId,
        mailboxId: message.mailboxId
      });
      const detail = result.messageDetail;
      const rendered = await emailRenderer.render({
        mode: detail.bodyHtml ? "safe-html" : "plain-text",
        bodyText: detail.bodyText,
        bodyHtml: detail.bodyHtml,
        allowRemoteImages: false
      });

      if (messageDetailRequestId.current !== requestId) {
        return;
      }

      setMessageDetail(detail);
      setRenderedEmail(rendered);
      setMessageDetailStatus("ready");
    } catch (error) {
      if (messageDetailRequestId.current !== requestId) {
        return;
      }

      setMessageDetailError(getErrorMessage(error));
      setMessageDetailStatus("error");
    }
  }

  async function handleCreateDraft() {
    const accountId = mailState.accountConfig?.account.id;

    if (!accountId) {
      setStatusMessage("Connect a JMAP account before composing.");
      setActiveView("settings");
      return;
    }

    try {
      await persistActiveDraftIfNeeded();
      const draft = await mailServices.composeService.createDraft({ accountId });
      replaceDraft(draft);
      openDraft(draft);
      setDraftStatusMessage("New local draft.");
    } catch (error) {
      setDraftSaveStatus("error");
      setDraftStatusMessage(getErrorMessage(error));
      setActiveView("compose");
    }
  }

  async function handleShowCompose() {
    if (activeDraft) {
      setActiveView("compose");
      return;
    }

    if (drafts[0]) {
      await handleOpenDraft(drafts[0]);
      return;
    }

    await handleCreateDraft();
  }

  async function handleReply() {
    if (!messageDetail) {
      return;
    }

    try {
      await persistActiveDraftIfNeeded();
      const draft = await mailServices.composeService.createReplyDraft({
        accountId: messageDetail.accountId,
        providerMessageId: messageDetail.providerMessageId
      });
      replaceDraft(draft);
      openDraft(draft);
      setDraftStatusMessage("Reply draft saved locally.");
    } catch (error) {
      setMessageDetailError(getErrorMessage(error));
      setMessageDetailStatus("error");
    }
  }

  function openDraft(draft: LocalDraft) {
    draftSaveRequestId.current += 1;
    setActiveDraft(draft);
    setDraftEditor(createDraftEditorState(draft));
    setIsDraftDirty(false);
    setDraftSaveStatus("saved");
    setActiveView("compose");
  }

  async function handleOpenDraft(draft: LocalDraft) {
    if (draft.id === activeDraft?.id) {
      setActiveView("compose");
      return;
    }

    try {
      await persistActiveDraftIfNeeded();
      openDraft(draft);
    } catch (error) {
      setDraftSaveStatus("error");
      setDraftStatusMessage(getErrorMessage(error));
    }
  }

  function replaceDraft(draft: LocalDraft) {
    setDrafts((currentDrafts) => [
      draft,
      ...currentDrafts.filter((candidate) => candidate.id !== draft.id)
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  function updateDraftEditor(field: keyof DraftEditorState, value: string) {
    setDraftEditor((currentEditor) => ({
      ...currentEditor,
      [field]: value
    }));
    setIsDraftDirty(true);
    setDraftStatusMessage(undefined);
  }

  function saveDraftEditor(draftId: string, editor: DraftEditorState) {
    const input: UpdateDraftInput = {
      draftId,
      to: parseRecipientInput(editor.to),
      cc: parseRecipientInput(editor.cc),
      bcc: parseRecipientInput(editor.bcc),
      subject: editor.subject,
      bodyText: editor.bodyText
    };

    return mailServices.composeService.updateDraft(input);
  }

  async function persistActiveDraftIfNeeded() {
    if (!activeDraft || !isDraftDirty) {
      return;
    }

    draftSaveRequestId.current += 1;
    setDraftSaveStatus("saving");
    const savedDraft = await saveDraftEditor(activeDraft.id, draftEditor);
    replaceDraft(savedDraft);
    setActiveDraft(savedDraft);
    setIsDraftDirty(false);
    setDraftSaveStatus("saved");
  }

  async function handleSendDraft() {
    if (!activeDraft || draftSaveStatus === "sending") {
      return;
    }

    draftSaveRequestId.current += 1;
    setIsDraftDirty(false);
    setDraftSaveStatus("sending");
    setDraftStatusMessage("Sending...");

    try {
      const savedDraft = await saveDraftEditor(activeDraft.id, draftEditor);
      replaceDraft(savedDraft);
      setActiveDraft(savedDraft);
      setIsDraftDirty(false);
      const result = await mailServices.composeService.sendDraft(savedDraft.id);

      if (result.failed) {
        setDraftSaveStatus("error");
        setDraftStatusMessage(formatSendFailureStatus(result));
        return;
      }

      setDrafts((currentDrafts) => (
        currentDrafts.filter((draft) => draft.id !== savedDraft.id)
      ));
      setActiveDraft(undefined);
      setDraftEditor(emptyDraftEditor);
      setDraftSaveStatus("saved");
      setDraftStatusMessage(
        `Message submitted at ${formatFullMessageDate(result.sentAt ?? new Date().toISOString())}.`
      );
    } catch (error) {
      setDraftSaveStatus("error");
      setDraftStatusMessage(getErrorMessage(error));
    }
  }

  async function handleDiscardDraft() {
    if (!activeDraft) {
      return;
    }

    const shouldDiscard = window.confirm("Discard this local draft?");

    if (!shouldDiscard) {
      return;
    }

    try {
      draftSaveRequestId.current += 1;
      await mailServices.composeService.discardDraft(activeDraft.id);
      const remainingDrafts = drafts.filter((draft) => draft.id !== activeDraft.id);
      setDrafts(remainingDrafts);
      setActiveDraft(undefined);
      setDraftEditor(emptyDraftEditor);
      setIsDraftDirty(false);
      setDraftSaveStatus("idle");
      setDraftStatusMessage("Draft discarded.");
    } catch (error) {
      setDraftSaveStatus("error");
      setDraftStatusMessage(getErrorMessage(error));
    }
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">Y</div>
          <div>
            <Typography as="h1" variant="heading">YuMail</Typography>
            <Typography variant="caption" muted>JMAP account</Typography>
          </div>
        </div>

        <Button
          className="compose-button"
          variant="primary"
          onClick={() => void handleCreateDraft()}
        >
          <MailPlus size={16} aria-hidden="true" />
          Compose
        </Button>

        <nav className="nav-list">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                className={isActive ? "nav-item nav-item--active" : "nav-item"}
                type="button"
                onClick={() => {
                  if (item.id === "compose") {
                    void handleShowCompose();
                    return;
                  }

                  setActiveView(item.id);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Chip tone={mailState.accountConfig ? "success" : "warning"}>
            {mailState.accountConfig ? "JMAP connected" : "No account"}
          </Chip>
          <Chip>AI manual</Chip>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="header-left">
            <IconButton label="Toggle sidebar" variant="ghost">
              <PanelLeft size={17} aria-hidden="true" />
            </IconButton>
            <div className="search-box">
              <Search size={16} aria-hidden="true" />
              <input aria-label="Search mail" placeholder="Search mail" />
            </div>
          </div>
          <div className="header-right">
            <Tag tone="accent">{bootstrapState.productName}</Tag>
            <Tag>{mailState.accountConfig?.account.emailAddress ?? "JMAP"}</Tag>
          </div>
        </header>

        <div className="workspace-grid">
          <InboxScreen
            activeView={activeView}
            isBusy={isBusy}
            mailState={mailState}
            selectedMessageId={selectedMessageId}
            onOpenThread={(message) => void handleOpenThread(message)}
            onRefresh={handleRefreshInbox}
          />
          {activeView === "compose" ? (
            <ComposeScreen
              accountEmailAddress={mailState.accountConfig?.account.emailAddress}
              draft={activeDraft}
              editor={draftEditor}
              saveStatus={draftSaveStatus}
              statusMessage={draftStatusMessage}
              onChange={updateDraftEditor}
              onCreate={() => void handleCreateDraft()}
              onDiscard={() => void handleDiscardDraft()}
              onSend={() => void handleSendDraft()}
            />
          ) : (
            <ThreadScreen
              activeView={activeView}
              selectedMessage={selectedMessage}
              messageDetail={messageDetail}
              renderedEmail={renderedEmail}
              status={messageDetailStatus}
              errorMessage={messageDetailError}
              onReply={() => void handleReply()}
            />
          )}
          <aside className="detail-rail">
            {activeView === "compose" ? (
              <DraftsPanel
                drafts={drafts}
                activeDraftId={activeDraft?.id}
                statusMessage={draftStatusMessage}
                status={draftSaveStatus}
                onCreate={() => void handleCreateDraft()}
                onOpen={(draft) => void handleOpenDraft(draft)}
              />
            ) : (
              <SettingsScreen
                isBusy={isBusy}
                mailState={mailState}
                statusMessage={statusMessage}
                connectionTest={connectionTest}
                onTestConnection={handleTestConnection}
                onSaveAccount={handleSaveAccount}
              />
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function InboxScreen({
  activeView,
  isBusy,
  mailState,
  selectedMessageId,
  onOpenThread,
  onRefresh
}: {
  activeView: ActiveView;
  isBusy: boolean;
  mailState: MailAccountState;
  selectedMessageId?: string;
  onOpenThread: (message: Message) => void;
  onRefresh: () => void;
}) {
  return (
    <Surface className="mail-list" tone="sunken">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">Inbox</Typography>
          <Typography variant="caption" muted>
            {mailState.accountConfig
              ? `${mailState.inboxMessages.length} cached message${mailState.inboxMessages.length === 1 ? "" : "s"}`
              : "Connect a JMAP account in Settings."}
          </Typography>
        </div>
        <IconButton
          label="Refresh inbox"
          variant="ghost"
          size="sm"
          disabled={!mailState.accountConfig || isBusy}
          onClick={onRefresh}
        >
          <Inbox size={15} aria-hidden="true" />
        </IconButton>
      </div>

      {isBusy && mailState.inboxMessages.length === 0 ? (
        <div className="skeleton-stack" aria-label="Loading inbox">
          <Skeleton height="58px" />
          <Skeleton height="58px" />
          <Skeleton height="58px" />
        </div>
      ) : null}

      {!mailState.accountConfig ? (
        <div className="empty-panel">
          <Server size={24} aria-hidden="true" />
          <Typography variant="heading">No JMAP account</Typography>
          <Typography variant="small" muted>Settings can test and save a Stalwart/JMAP account.</Typography>
        </div>
      ) : null}

      {mailState.accountConfig && mailState.inboxMessages.length === 0 && !isBusy ? (
        <div className="empty-panel">
          <Inbox size={24} aria-hidden="true" />
          <Typography variant="heading">Inbox empty</Typography>
          <Typography variant="small" muted>Mailbox metadata loaded, but no inbox messages were returned.</Typography>
        </div>
      ) : null}

      {mailState.inboxMessages.map((message) => (
        <button
          key={message.id}
          className={
            activeView === "thread" && selectedMessageId === message.id
              ? "message-row message-row--active"
              : "message-row"
          }
          type="button"
          onClick={() => onOpenThread(message)}
        >
          <div className="message-row-top">
            <Typography variant="small">{message.from.name ?? message.from.address}</Typography>
            <Typography variant="caption" muted>{formatMessageDate(message.date)}</Typography>
          </div>
          <Typography variant="small">{message.subject}</Typography>
          <Typography variant="caption" muted>{message.snippet || "No preview available."}</Typography>
        </button>
      ))}
    </Surface>
  );
}

function ThreadScreen({
  activeView,
  selectedMessage,
  messageDetail,
  renderedEmail,
  status,
  errorMessage,
  onReply
}: {
  activeView: ActiveView;
  selectedMessage?: Message;
  messageDetail?: MessageDetail;
  renderedEmail?: RenderedEmail;
  status: MessageDetailStatus;
  errorMessage?: string;
  onReply: () => void;
}) {
  const visibleMessage = messageDetail ?? selectedMessage;

  return (
    <Surface className="thread-panel">
      <div className="thread-toolbar">
        <div>
          <Typography as="h2" variant="title">
            {visibleMessage?.subject ?? (activeView === "thread" ? "Thread" : "YuMail JMAP")}
          </Typography>
          <Typography variant="small" muted>
            {visibleMessage
              ? `${formatRecipient(visibleMessage.from)} · ${formatMessageDate(visibleMessage.date)}`
              : "Select an inbox message to inspect metadata."}
          </Typography>
        </div>
        <div className="toolbar-actions">
          <IconButton
            label="Reply"
            variant="ghost"
            disabled={status !== "ready" || !messageDetail}
            onClick={onReply}
          >
            <ReplyIcon size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Summarize" variant="ghost" disabled>
            <Sparkles size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Tag suggestions" variant="ghost" disabled>
            <Tags size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {status === "loading" ? <MessageLoadingState /> : null}
      {status === "error" ? <MessageErrorState message={errorMessage} /> : null}
      {status === "ready" && messageDetail && renderedEmail ? (
        <MessageReadingView message={messageDetail} renderedEmail={renderedEmail} />
      ) : null}
      {status === "idle" ? (
        <div className="thread-empty">
          <Shield size={28} aria-hidden="true" />
          <Typography variant="heading">Privacy-first reading</Typography>
          <Typography variant="body" muted>
            Select an inbox message to load its cached or provider-backed detail. Remote images
            remain blocked by default.
          </Typography>
        </div>
      ) : null}
    </Surface>
  );
}

function MessageLoadingState() {
  return (
    <div className="message-loading" aria-label="Loading message detail">
      <Skeleton height="22px" width="52%" />
      <Skeleton height="14px" width="72%" />
      <Skeleton height="14px" width="44%" />
      <Skeleton className="message-body-skeleton" height="220px" />
    </div>
  );
}

function MessageErrorState({ message }: { message?: string }) {
  return (
    <div className="thread-empty" role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <Typography variant="heading">Message could not be loaded</Typography>
      <Typography variant="body" muted>{message ?? "The provider returned an error."}</Typography>
    </div>
  );
}

function MessageReadingView({
  message,
  renderedEmail
}: {
  message: MessageDetail;
  renderedEmail: RenderedEmail;
}) {
  return (
    <article className="message-reading-view">
      <section className="message-envelope" aria-label="Message envelope">
        <dl className="message-metadata">
          <MetadataRow label="From" value={formatRecipient(message.from)} />
          <MetadataRow label="To" value={formatRecipients(message.to)} />
          {message.cc.length > 0 ? (
            <MetadataRow label="Cc" value={formatRecipients(message.cc)} />
          ) : null}
          <MetadataRow label="Date" value={formatFullMessageDate(message.date)} />
        </dl>
        <div className="message-flags" aria-label="Message flags">
          <Tag>{message.isRead ? "Read" : "Unread"}</Tag>
          {message.isFlagged ? <Tag tone="warning">Flagged</Tag> : null}
          {message.isAnswered ? <Tag tone="success">Replied</Tag> : null}
        </div>
      </section>

      {renderedEmail.remoteImagesBlocked ? (
        <div className="remote-images-notice" role="status">
          <ImageOff size={17} aria-hidden="true" />
          <div>
            <Typography variant="small">Remote images blocked</Typography>
            <Typography variant="caption" muted>
              {renderedEmail.remoteImageUrls.length} remote image source
              {renderedEmail.remoteImageUrls.length === 1 ? "" : "s"} removed
              {renderedEmail.trackingPixelsDetected > 0
                ? `, including ${renderedEmail.trackingPixelsDetected} possible tracking pixel${renderedEmail.trackingPixelsDetected === 1 ? "" : "s"}`
                : ""}.
            </Typography>
          </div>
        </div>
      ) : null}

      <section className="message-body" aria-label="Message body">
        {renderedEmail.content ? (
          renderedEmail.mode === "plain-text" ? (
            <pre className="plain-text-body">{renderedEmail.content}</pre>
          ) : (
            <div
              className="safe-html-body"
              dangerouslySetInnerHTML={{ __html: renderedEmail.content }}
            />
          )
        ) : (
          <div className="message-body-empty">
            <FileText size={22} aria-hidden="true" />
            <Typography variant="small" muted>
              {message.snippet || "This message has no displayable body."}
            </Typography>
          </div>
        )}
      </section>

      {message.attachments.length > 0 ? (
        <section className="attachment-section" aria-label="Attachments">
          <div className="attachment-heading">
            <Paperclip size={16} aria-hidden="true" />
            <Typography as="h3" variant="heading">
              {message.attachments.length} attachment
              {message.attachments.length === 1 ? "" : "s"}
            </Typography>
          </div>
          <ul className="attachment-list">
            {message.attachments.map((attachment) => (
              <li key={attachment.id} className="attachment-item">
                <FileText size={17} aria-hidden="true" />
                <div>
                  <Typography variant="small">{attachment.filename}</Typography>
                  <Typography variant="caption" muted>
                    {attachment.mimeType}
                    {attachment.sizeBytes > 0 ? ` · ${formatFileSize(attachment.sizeBytes)}` : ""}
                  </Typography>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metadata-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ComposeScreen({
  accountEmailAddress,
  draft,
  editor,
  saveStatus,
  statusMessage,
  onChange,
  onCreate,
  onDiscard,
  onSend
}: {
  accountEmailAddress?: string;
  draft?: LocalDraft;
  editor: DraftEditorState;
  saveStatus: DraftSaveStatus;
  statusMessage?: string;
  onChange: (field: keyof DraftEditorState, value: string) => void;
  onCreate: () => void;
  onDiscard: () => void;
  onSend: () => void;
}) {
  if (!draft) {
    return (
      <Surface className="compose-panel">
        <div className="thread-empty">
          <FilePenLine size={28} aria-hidden="true" />
          <Typography variant="heading">
            {statusMessage ?? "No local draft selected"}
          </Typography>
          <Typography variant="body" muted>
            {accountEmailAddress
              ? "Create a message or open a saved local draft."
              : "Connect a JMAP account before composing."}
          </Typography>
          <Button
            variant="primary"
            disabled={!accountEmailAddress}
            onClick={onCreate}
          >
            <MailPlus size={16} aria-hidden="true" />
            New message
          </Button>
        </div>
      </Surface>
    );
  }

  const isSending = saveStatus === "sending";

  return (
    <Surface className="compose-panel">
      <div className="compose-heading">
        <div>
          <Typography as="h2" variant="title">
            {draft.mode === "reply" ? "Reply" : "New message"}
          </Typography>
          <Typography variant="caption" muted>
            From {accountEmailAddress}
          </Typography>
        </div>
        <Tag tone={saveStatus === "error" ? "warning" : "neutral"}>
          {formatDraftSaveStatus(saveStatus)}
        </Tag>
      </div>

      <form className="compose-editor" onSubmit={(event) => event.preventDefault()}>
        <label className="compose-field">
          <span>To</span>
          <Input
            value={editor.to}
            onChange={(event) => onChange("to", event.target.value)}
            placeholder="recipient@example.com"
            disabled={isSending}
          />
        </label>
        <div className="compose-recipient-row">
          <label className="compose-field">
            <span>Cc</span>
            <Input
              value={editor.cc}
              onChange={(event) => onChange("cc", event.target.value)}
              placeholder="Optional"
              disabled={isSending}
            />
          </label>
          <label className="compose-field">
            <span>Bcc</span>
            <Input
              value={editor.bcc}
              onChange={(event) => onChange("bcc", event.target.value)}
              placeholder="Optional"
              disabled={isSending}
            />
          </label>
        </div>
        <label className="compose-field compose-subject-field">
          <span>Subject</span>
          <Input
            value={editor.subject}
            onChange={(event) => onChange("subject", event.target.value)}
            placeholder="Subject"
            disabled={isSending}
          />
        </label>
        <Textarea
          className="compose-body"
          value={editor.bodyText}
          onChange={(event) => onChange("bodyText", event.target.value)}
          placeholder="Write your message"
          aria-label="Message body"
          disabled={isSending}
        />
      </form>

      <div className="compose-footer">
        <div className="compose-status" role={saveStatus === "error" ? "alert" : "status"}>
          <Typography variant="caption" muted={saveStatus !== "error"}>
            {statusMessage ?? "Saved locally. Sending always requires clicking Send."}
          </Typography>
        </div>
        <div className="compose-actions">
          <Button variant="danger" disabled={isSending} onClick={onDiscard}>
            <Trash2 size={15} aria-hidden="true" />
            Discard
          </Button>
          <Button variant="primary" disabled={isSending} onClick={onSend}>
            <Send size={15} aria-hidden="true" />
            {isSending ? "Sending" : "Send"}
          </Button>
        </div>
      </div>
    </Surface>
  );
}

function DraftsPanel({
  drafts,
  activeDraftId,
  statusMessage,
  status,
  onCreate,
  onOpen
}: {
  drafts: LocalDraft[];
  activeDraftId?: string;
  statusMessage?: string;
  status: DraftSaveStatus;
  onCreate: () => void;
  onOpen: (draft: LocalDraft) => void;
}) {
  return (
    <Surface className="rail-panel" tone="elevated">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">Local drafts</Typography>
          <Typography variant="caption" muted>
            {drafts.length} saved on this device
          </Typography>
        </div>
        <IconButton label="New message" variant="ghost" size="sm" onClick={onCreate}>
          <MailPlus size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="draft-list">
        {drafts.length === 0 ? (
          <div className="draft-list-empty">
            <FilePenLine size={22} aria-hidden="true" />
            <Typography variant="small" muted>No saved drafts</Typography>
          </div>
        ) : null}
        {drafts.map((draft) => (
          <button
            key={draft.id}
            className={
              draft.id === activeDraftId
                ? "draft-row draft-row--active"
                : "draft-row"
            }
            type="button"
            onClick={() => onOpen(draft)}
          >
            <div className="draft-row-heading">
              <Typography variant="small">
                {draft.subject || "(no subject)"}
              </Typography>
              <Tag tone={draft.mode === "reply" ? "accent" : "neutral"}>
                {draft.mode}
              </Tag>
            </div>
            <Typography variant="caption" muted>
              {formatDraftRecipients(draft)}
            </Typography>
            <Typography variant="caption" muted>
              {formatMessageDate(draft.updatedAt)}
            </Typography>
          </button>
        ))}
      </div>

      <div className="draft-rail-status">
        <StatusRow
          icon={status === "error" ? AlertCircle : CheckCircle2}
          label={statusMessage ?? "Drafts are stored only in local SQLite."}
          muted={status !== "error"}
        />
      </div>
    </Surface>
  );
}

function SettingsScreen({
  isBusy,
  mailState,
  statusMessage,
  connectionTest,
  onTestConnection,
  onSaveAccount
}: {
  isBusy: boolean;
  mailState: MailAccountState;
  statusMessage?: string;
  connectionTest?: JmapConnectionTestResult;
  onTestConnection: (input: JmapAccountSetupInput) => Promise<void>;
  onSaveAccount: (input: JmapAccountSetupInput) => Promise<void>;
}) {
  const [formState, setFormState] = useState<JmapAccountSetupInput>({
    displayName: mailState.accountConfig?.account.displayName ?? "",
    emailAddress: mailState.accountConfig?.account.emailAddress ?? "",
    jmapBaseUrl: mailState.accountConfig?.jmapBaseUrl ?? "",
    authMode: mailState.accountConfig?.authMode ?? "basic",
    authSecret: ""
  });

  useEffect(() => {
    if (!mailState.accountConfig) {
      return;
    }

    setFormState((currentValue) => ({
      ...currentValue,
      displayName: mailState.accountConfig?.account.displayName ?? "",
      emailAddress: mailState.accountConfig?.account.emailAddress ?? "",
      jmapBaseUrl: mailState.accountConfig?.jmapBaseUrl ?? "",
      authMode: mailState.accountConfig?.authMode ?? "basic"
    }));
  }, [mailState.accountConfig]);

  function updateFormField(field: keyof JmapAccountSetupInput, value: string) {
    setFormState((currentValue) => ({
      ...currentValue,
      [field]: value
    }));
  }

  async function submitForm(action: "test" | "save") {
    const trimmedInput = {
      displayName: formState.displayName.trim(),
      emailAddress: formState.emailAddress.trim(),
      jmapBaseUrl: formState.jmapBaseUrl.trim(),
      authMode: formState.authMode,
      authSecret: formState.authSecret.trim()
    };

    if (action === "test") {
      await onTestConnection(trimmedInput);
      return;
    }

    await onSaveAccount(trimmedInput);
    setFormState((currentValue) => ({ ...currentValue, authSecret: "" }));
  }

  return (
    <Surface className="rail-panel" tone="elevated">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">Settings</Typography>
          <Typography variant="caption" muted>Stalwart/JMAP account</Typography>
        </div>
        <Settings size={16} aria-hidden="true" />
      </div>

      <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>Display name</Typography>
          <Input
            value={formState.displayName}
            onChange={(event) => updateFormField("displayName", event.target.value)}
            placeholder="YuMail"
            required
          />
        </label>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>Email address</Typography>
          <Input
            value={formState.emailAddress}
            onChange={(event) => updateFormField("emailAddress", event.target.value)}
            placeholder="you@example.com"
            type="email"
            required
          />
        </label>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>JMAP base URL</Typography>
          <Input
            value={formState.jmapBaseUrl}
            onChange={(event) => updateFormField("jmapBaseUrl", event.target.value)}
            placeholder="mail.example.com or https://mail.example.com/jmap/session"
            required
          />
        </label>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>Authentication</Typography>
          <select
            className="ym-input"
            value={formState.authMode}
            onChange={(event) => updateFormField("authMode", event.target.value as JmapAccountSetupInput["authMode"])}
          >
            <option value="basic">Password / Basic Auth</option>
            <option value="bearer">Bearer token</option>
          </select>
        </label>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>
            {formState.authMode === "basic" ? "Password or app password" : "Bearer token"}
            {mailState.accountConfig ? " (leave blank to test saved credentials)" : ""}
          </Typography>
          <Input
            value={formState.authSecret}
            onChange={(event) => updateFormField("authSecret", event.target.value)}
            placeholder={formState.authMode === "basic" ? "Mailbox password or app password" : "Provider bearer token"}
            type="password"
            required={!mailState.accountConfig}
          />
        </label>

        <div className="settings-actions">
          <Button
            variant="secondary"
            disabled={isBusy}
            onClick={() => void submitForm("test")}
          >
            Test
          </Button>
          <Button
            variant="primary"
            disabled={isBusy}
            onClick={() => void submitForm("save")}
          >
            Save
          </Button>
        </div>
      </form>

      <div className="settings-status">
        <StatusRow
          icon={connectionTest?.ok ? CheckCircle2 : Clock3}
          label={statusMessage ?? "No connection test run yet"}
          muted={!connectionTest?.ok}
        />
        <Typography variant="caption" muted>{DESKTOP_SECURE_STORAGE_STATUS}</Typography>
      </div>

      <DiagnosticsPanel connectionTest={connectionTest} />

      <div className="status-list">
        <StatusRow
          icon={mailState.accountConfig ? CheckCircle2 : Clock3}
          label={mailState.accountConfig ? mailState.accountConfig.account.emailAddress : "No account saved"}
          muted={!mailState.accountConfig}
        />
        <StatusRow
          icon={mailState.mailboxes.length > 0 ? CheckCircle2 : Clock3}
          label={`${mailState.mailboxes.length} mailbox${mailState.mailboxes.length === 1 ? "" : "es"} cached`}
          muted={mailState.mailboxes.length === 0}
        />
        <StatusRow
          icon={mailState.inboxMessages.length > 0 ? CheckCircle2 : Clock3}
          label={`${mailState.inboxMessages.length} inbox message${mailState.inboxMessages.length === 1 ? "" : "s"} cached`}
          muted={mailState.inboxMessages.length === 0}
        />
      </div>
    </Surface>
  );
}

function DiagnosticsPanel({
  connectionTest
}: {
  connectionTest?: JmapConnectionTestResult;
}) {
  const diagnostics = connectionTest?.diagnostics;

  if (!diagnostics) {
    return null;
  }

  return (
    <div className="diagnostics-panel">
      <Typography as="h3" variant="small">Connection diagnostics</Typography>
      <Typography variant="caption" muted>{diagnostics.message}</Typography>
      {connectionTest?.sessionUrl ? (
        <Typography variant="caption" muted>
          Session: {connectionTest.sessionUrl}
        </Typography>
      ) : null}
      {connectionTest?.apiUrl ? (
        <Typography variant="caption" muted>
          API: {connectionTest.apiUrl}
        </Typography>
      ) : null}
      <Typography variant="caption" muted>
        Auth: {diagnostics.authMode}
        {diagnostics.authUsername ? ` as ${diagnostics.authUsername}` : ""}
      </Typography>
      <div className="diagnostics-list">
        {diagnostics.attemptedUrls.map((attempt, index) => (
          <div className="diagnostics-item" key={`${attempt.url}-${index}`}>
            <Typography variant="caption">
              {attempt.status ? `${attempt.status} ` : ""}
              {attempt.url}
            </Typography>
            <Typography variant="caption" muted>
              Auth {attempt.authSent ? "sent" : "not sent"} ({attempt.authMode}
              {attempt.authUsername ? ` as ${attempt.authUsername}` : ""})
              {attempt.redirectTarget ? ` · Redirect ${attempt.redirectTarget}` : ""}
              {attempt.finalUrl ? ` · Final ${attempt.finalUrl}` : ""}
              {attempt.isJson === false ? " · Invalid JSON" : ""}
              {attempt.missingFields.length > 0
                ? ` · Missing ${attempt.missingFields.join(", ")}`
                : ""}
              {attempt.errorCategory ? ` · ${attempt.errorCategory}` : ""}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  muted = false
}: {
  icon: LucideIcon;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "status-row status-row--muted" : "status-row"}>
      <Icon size={15} aria-hidden="true" />
      <Typography variant="small" muted={muted}>{label}</Typography>
    </div>
  );
}

function formatMessageDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatFullMessageDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatRecipient(recipient: Recipient): string {
  return recipient.name
    ? `${recipient.name} <${recipient.address}>`
    : recipient.address;
}

function formatRecipients(recipients: Recipient[]): string {
  return recipients.length > 0
    ? recipients.map(formatRecipient).join(", ")
    : "Not provided";
}

function createDraftEditorState(draft: LocalDraft): DraftEditorState {
  return {
    to: formatRecipientInput(draft.to),
    cc: formatRecipientInput(draft.cc),
    bcc: formatRecipientInput(draft.bcc),
    subject: draft.subject,
    bodyText: draft.bodyText
  };
}

function formatRecipientInput(recipients: Recipient[]): string {
  return recipients.map(formatRecipientForInput).join(", ");
}

function formatRecipientForInput(recipient: Recipient): string {
  if (!recipient.name) {
    return recipient.address;
  }

  const displayName = /[",;<>]/u.test(recipient.name)
    ? `"${recipient.name.replace(/(["\\])/gu, "\\$1")}"`
    : recipient.name;

  return `${displayName} <${recipient.address}>`;
}

function formatDraftRecipients(draft: LocalDraft): string {
  const recipients = [...draft.to, ...draft.cc, ...draft.bcc];
  return recipients.length > 0
    ? recipients.map((recipient) => recipient.address).join(", ")
    : "No recipients";
}

function formatDraftSaveStatus(status: DraftSaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving";
    case "saved":
      return "Saved locally";
    case "sending":
      return "Sending";
    case "error":
      return "Needs attention";
    default:
      return "Local draft";
  }
}

function formatSendFailureStatus(result: SendMessageResult): string {
  const baseMessage = result.errorMessage ?? "Message submission failed.";

  if (result.serverDraftMayRemain) {
    return `${baseMessage} The local draft is still saved, but a temporary server draft may remain.`;
  }

  if (result.cleanupAttempted && result.cleanupSucceeded) {
    return `${baseMessage} The temporary server draft was cleaned up and the local draft is still saved.`;
  }

  return `${baseMessage} The local draft is still saved.`;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1_048_576) {
    return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}
