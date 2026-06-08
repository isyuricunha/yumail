import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  Inbox,
  MailPlus,
  PanelLeft,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sparkles,
  Tags
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  JmapAccountSetupInput,
  JmapConnectionTestResult,
  MailAccountState
} from "@yumail/core";
import { createFoundationBootstrapState } from "@yumail/core";
import type { Message } from "@yumail/mail";
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
import { DEVELOPMENT_SECURE_STORAGE_WARNING } from "./services/development-secure-storage";
import { createDesktopMailAccountService } from "./services/mail-services";

type ActiveView = "inbox" | "thread" | "compose" | "settings";

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

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("inbox");
  const [mailState, setMailState] = useState<MailAccountState>(emptyMailState);
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [connectionTest, setConnectionTest] = useState<JmapConnectionTestResult>();
  const bootstrapState = useMemo(() => createFoundationBootstrapState(), []);
  const mailAccountService = useMemo(() => createDesktopMailAccountService(), []);
  const selectedMessage = mailState.inboxMessages.find((message) => message.id === selectedMessageId);

  useEffect(() => {
    let isMounted = true;

    void mailAccountService.loadState()
      .then((loadedState) => {
        if (!isMounted) {
          return;
        }

        setMailState(loadedState);
        setSelectedMessageId(loadedState.inboxMessages[0]?.id);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setStatusMessage(getErrorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mailAccountService]);

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
      const result = await mailAccountService.testJmapConnection(input);
      setConnectionTest(result);
      setStatusMessage(result.message);
    });
  }

  async function handleSaveAccount(input: JmapAccountSetupInput) {
    await runMailAction(async () => {
      const savedState = await mailAccountService.saveJmapAccount(input);
      setMailState(savedState);
      setSelectedMessageId(savedState.inboxMessages[0]?.id);
      setConnectionTest(undefined);
      setActiveView("inbox");
      setStatusMessage("JMAP account saved and inbox metadata loaded.");
    });
  }

  async function handleRefreshInbox() {
    await runMailAction(async () => {
      const refreshedState = await mailAccountService.refreshInbox(mailState.accountConfig?.account.id);
      setMailState(refreshedState);
      setSelectedMessageId(refreshedState.inboxMessages[0]?.id);
      setStatusMessage("Inbox metadata refreshed.");
    });
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

        <Button className="compose-button" variant="primary" onClick={() => setActiveView("compose")}>
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
                onClick={() => setActiveView(item.id)}
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
            onOpenThread={(message) => {
              setSelectedMessageId(message.id);
              setActiveView("thread");
            }}
            onRefresh={handleRefreshInbox}
          />
          <ThreadScreen activeView={activeView} selectedMessage={selectedMessage} />
          <aside className="detail-rail">
            {activeView === "compose" ? (
              <ComposeScreen />
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
  selectedMessage
}: {
  activeView: ActiveView;
  selectedMessage?: Message;
}) {
  return (
    <Surface className="thread-panel">
      <div className="thread-toolbar">
        <div>
          <Typography as="h2" variant="title">
            {selectedMessage?.subject ?? (activeView === "thread" ? "Thread" : "YuMail JMAP")}
          </Typography>
          <Typography variant="small" muted>
            {selectedMessage
              ? `${selectedMessage.from.name ?? selectedMessage.from.address} · ${formatMessageDate(selectedMessage.date)}`
              : "Select an inbox message to inspect metadata."}
          </Typography>
        </div>
        <div className="toolbar-actions">
          <IconButton label="Summarize" variant="ghost" disabled>
            <Sparkles size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Tag suggestions" variant="ghost" disabled>
            <Tags size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="thread-empty">
        <Shield size={28} aria-hidden="true" />
        <Typography variant="heading">
          {selectedMessage ? "Metadata only" : "Privacy-first defaults"}
        </Typography>
        <Typography variant="body" muted>
          {selectedMessage
            ? selectedMessage.snippet || "Message bodies are not fetched in Milestone 1."
            : "Remote images stay blocked, AI stays user-triggered, and platform APIs stay behind adapters."}
        </Typography>
      </div>
    </Surface>
  );
}

function ComposeScreen() {
  return (
    <Surface className="rail-panel" tone="elevated">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">Compose</Typography>
          <Typography variant="caption" muted>Drafting remains deferred</Typography>
        </div>
        <Send size={16} aria-hidden="true" />
      </div>

      <div className="compose-form">
        <Input placeholder="To" aria-label="To" disabled />
        <Input placeholder="Subject" aria-label="Subject" disabled />
        <Textarea placeholder="Write a draft" aria-label="Draft body" disabled />
        <div className="compose-actions">
          <Button variant="secondary" disabled>
            <Bot size={15} aria-hidden="true" />
            Improve
          </Button>
          <Button variant="primary" disabled>
            <Send size={15} aria-hidden="true" />
            Send
          </Button>
        </div>
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
      jmapBaseUrl: mailState.accountConfig?.jmapBaseUrl ?? ""
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
            placeholder="https://mail.example.com"
            type="url"
            required
          />
        </label>
        <label className="field-stack">
          <Typography as="span" variant="caption" muted>Auth token or password</Typography>
          <Input
            value={formState.authSecret}
            onChange={(event) => updateFormField("authSecret", event.target.value)}
            placeholder="Bearer token, Basic header, password:secret, or user:password"
            type="password"
            required
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
        <Typography variant="caption" muted>{DEVELOPMENT_SECURE_STORAGE_WARNING}</Typography>
      </div>

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}
