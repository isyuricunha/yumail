import { useMemo, useState } from "react";
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
  Settings,
  Shield,
  Sparkles,
  Tags
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createFoundationBootstrapState } from "@yumail/core";
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

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("inbox");
  const bootstrapState = useMemo(() => createFoundationBootstrapState(), []);

  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">Y</div>
          <div>
            <Typography as="h1" variant="heading">YuMail</Typography>
            <Typography variant="caption" muted>Foundation</Typography>
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
          <Chip tone="success">AI manual</Chip>
          <Chip>JMAP first</Chip>
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
            <Tag>Dark</Tag>
          </div>
        </header>

        <div className="workspace-grid">
          <InboxScreen activeView={activeView} onOpenThread={() => setActiveView("thread")} />
          <ThreadScreen activeView={activeView} />
          <aside className="detail-rail">
            {activeView === "compose" ? <ComposeScreen /> : <SettingsScreen activeView={activeView} />}
          </aside>
        </div>
      </section>
    </main>
  );
}

function InboxScreen({
  activeView,
  onOpenThread
}: {
  activeView: ActiveView;
  onOpenThread: () => void;
}) {
  return (
    <Surface className="mail-list" tone="sunken">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">Inbox</Typography>
          <Typography variant="caption" muted>Connect a JMAP account to load mail.</Typography>
        </div>
        <IconButton label="Inbox actions" variant="ghost" size="sm">
          <Inbox size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <button
        className={activeView === "thread" ? "message-row message-row--active" : "message-row"}
        type="button"
        onClick={onOpenThread}
      >
        <div className="message-row-top">
          <Typography variant="small">No account connected</Typography>
          <Typography variant="caption" muted>Now</Typography>
        </div>
        <Typography variant="caption" muted>Provider contracts are ready for Milestone 1.</Typography>
      </button>

      <div className="skeleton-stack" aria-label="Loading placeholders">
        <Skeleton height="48px" />
        <Skeleton height="48px" />
        <Skeleton height="48px" />
      </div>
    </Surface>
  );
}

function ThreadScreen({ activeView }: { activeView: ActiveView }) {
  return (
    <Surface className="thread-panel">
      <div className="thread-toolbar">
        <div>
          <Typography as="h2" variant="title">
            {activeView === "thread" ? "Thread" : "YuMail Foundation"}
          </Typography>
          <Typography variant="small" muted>Safe rendering and mail sync arrive in later milestones.</Typography>
        </div>
        <div className="toolbar-actions">
          <IconButton label="Summarize" variant="ghost">
            <Sparkles size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Tag suggestions" variant="ghost">
            <Tags size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="thread-empty">
        <Shield size={28} aria-hidden="true" />
        <Typography variant="heading">Privacy-first defaults</Typography>
        <Typography variant="body" muted>
          Remote images stay blocked, AI stays user-triggered, and platform APIs stay behind adapters.
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
          <Typography variant="caption" muted>Drafting UI placeholder</Typography>
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

function SettingsScreen({ activeView }: { activeView: ActiveView }) {
  return (
    <Surface className="rail-panel" tone="elevated">
      <div className="panel-heading">
        <div>
          <Typography as="h2" variant="heading">
            {activeView === "settings" ? "Settings" : "Status"}
          </Typography>
          <Typography variant="caption" muted>Milestone 0 boundaries</Typography>
        </div>
        <Settings size={16} aria-hidden="true" />
      </div>

      <div className="status-list">
        <StatusRow icon={CheckCircle2} label="Provider interfaces" />
        <StatusRow icon={CheckCircle2} label="AI action contracts" />
        <StatusRow icon={Clock3} label="JMAP connection" muted />
        <StatusRow icon={Clock3} label="SQLite repositories" muted />
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
