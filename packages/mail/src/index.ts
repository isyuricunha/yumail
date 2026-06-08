import type {
  EmailAddress,
  EntityId,
  IsoDateTime,
  PagedResult,
  ProviderType,
  ResultPage,
  SystemTag,
  TimestampedEntity
} from "@yumail/shared";
import { UnsupportedProviderOperationError } from "@yumail/shared";

export type MailboxRole =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash"
  | "junk"
  | "custom";

export interface Account extends TimestampedEntity {
  id: EntityId;
  displayName: string;
  emailAddress: EmailAddress;
  providerType: ProviderType;
  providerConfigReference: string;
  isDefault: boolean;
}

export interface Mailbox extends TimestampedEntity {
  id: EntityId;
  accountId: EntityId;
  providerMailboxId: string;
  name: string;
  role: MailboxRole;
  unreadCount?: number;
  totalCount?: number;
}

export interface Recipient {
  name?: string;
  address: EmailAddress;
}

export interface Attachment {
  id: EntityId;
  messageId: EntityId;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId?: string;
}

export interface Message extends TimestampedEntity {
  id: EntityId;
  accountId: EntityId;
  providerType: ProviderType;
  providerMessageId: string;
  providerThreadId?: string;
  mailboxId: EntityId;
  messageIdHeader?: string;
  subject: string;
  from: Recipient;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  date: IsoDateTime;
  receivedAt?: IsoDateTime;
  snippet: string;
  isRead: boolean;
  isFlagged: boolean;
  isAnswered: boolean;
  hasAttachments: boolean;
  systemTags: SystemTag[];
  userTags: string[];
}

export interface MessageDetail extends Message {
  bodyText?: string;
  bodyHtml?: string;
  attachments: Attachment[];
}

export interface Thread extends TimestampedEntity {
  id: EntityId;
  accountId: EntityId;
  providerThreadId: string;
  subject: string;
  participants: Recipient[];
  messageCount: number;
  latestMessageAt: IsoDateTime;
  isUnread: boolean;
}

export interface ThreadDetail extends Thread {
  messages: MessageDetail[];
}

export interface MailProviderCapabilities {
  providerType: ProviderType;
  supportsThreads: boolean;
  supportsServerDrafts: boolean;
  supportsArchive: boolean;
  supportsMove: boolean;
  supportsLabels: boolean;
  supportsRecentSentSamples: boolean;
}

export interface ListMessagesInput {
  accountId: EntityId;
  mailboxId: EntityId;
  page: ResultPage;
}

export type ListMessagesResult = PagedResult<Message>;

export interface GetMessageInput {
  accountId: EntityId;
  messageId: EntityId;
}

export interface GetThreadInput {
  accountId: EntityId;
  threadId: EntityId;
}

export interface SendMessageInput {
  accountId: EntityId;
  from: Recipient;
  to: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: Attachment[];
  replyToMessageId?: EntityId;
}

export interface SendMessageResult {
  providerMessageId: string;
  messageId?: EntityId;
  sentAt: IsoDateTime;
}

export interface SaveDraftInput extends SendMessageInput {
  draftId?: EntityId;
}

export interface SaveDraftResult {
  draftId: EntityId;
  providerDraftId?: string;
  updatedAt: IsoDateTime;
}

export interface MessageMutationInput {
  accountId: EntityId;
  messageIds: EntityId[];
}

export interface MoveMessageInput extends MessageMutationInput {
  targetMailboxId: EntityId;
}

export interface DownloadAttachmentInput {
  accountId: EntityId;
  messageId: EntityId;
  attachmentId: EntityId;
}

export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  data: Uint8Array;
}

export interface RecentSentInput {
  accountId: EntityId;
  limit: number;
}

export interface SentMessageSample {
  messageId: EntityId;
  sentAt: IsoDateTime;
  to: Recipient[];
  subject: string;
  bodyText: string;
}

export interface MailProvider {
  getCapabilities(): Promise<MailProviderCapabilities>;
  listMailboxes(accountId: EntityId): Promise<Mailbox[]>;
  listMessages(input: ListMessagesInput): Promise<ListMessagesResult>;
  getMessage(input: GetMessageInput): Promise<MessageDetail>;
  getThread(input: GetThreadInput): Promise<ThreadDetail>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  saveDraft(input: SaveDraftInput): Promise<SaveDraftResult>;
  markRead(input: MessageMutationInput): Promise<void>;
  markUnread(input: MessageMutationInput): Promise<void>;
  archive(input: MessageMutationInput): Promise<void>;
  move(input: MoveMessageInput): Promise<void>;
  delete(input: MessageMutationInput): Promise<void>;
  downloadAttachment(input: DownloadAttachmentInput): Promise<AttachmentDownload>;
  getRecentSentMessages(input: RecentSentInput): Promise<SentMessageSample[]>;
}

abstract class PlaceholderMailProvider implements MailProvider {
  protected abstract readonly capabilities: MailProviderCapabilities;

  async getCapabilities(): Promise<MailProviderCapabilities> {
    return this.capabilities;
  }

  async listMailboxes(): Promise<Mailbox[]> {
    throw new UnsupportedProviderOperationError("listMailboxes");
  }

  async listMessages(): Promise<ListMessagesResult> {
    throw new UnsupportedProviderOperationError("listMessages");
  }

  async getMessage(): Promise<MessageDetail> {
    throw new UnsupportedProviderOperationError("getMessage");
  }

  async getThread(): Promise<ThreadDetail> {
    throw new UnsupportedProviderOperationError("getThread");
  }

  async sendMessage(): Promise<SendMessageResult> {
    throw new UnsupportedProviderOperationError("sendMessage");
  }

  async saveDraft(): Promise<SaveDraftResult> {
    throw new UnsupportedProviderOperationError("saveDraft");
  }

  async markRead(): Promise<void> {
    throw new UnsupportedProviderOperationError("markRead");
  }

  async markUnread(): Promise<void> {
    throw new UnsupportedProviderOperationError("markUnread");
  }

  async archive(): Promise<void> {
    throw new UnsupportedProviderOperationError("archive");
  }

  async move(): Promise<void> {
    throw new UnsupportedProviderOperationError("move");
  }

  async delete(): Promise<void> {
    throw new UnsupportedProviderOperationError("delete");
  }

  async downloadAttachment(): Promise<AttachmentDownload> {
    throw new UnsupportedProviderOperationError("downloadAttachment");
  }

  async getRecentSentMessages(): Promise<SentMessageSample[]> {
    throw new UnsupportedProviderOperationError("getRecentSentMessages");
  }
}

export class JmapProvider extends PlaceholderMailProvider {
  protected readonly capabilities: MailProviderCapabilities = {
    providerType: "jmap",
    supportsThreads: true,
    supportsServerDrafts: true,
    supportsArchive: true,
    supportsMove: true,
    supportsLabels: true,
    supportsRecentSentSamples: true
  };
}

export class ImapSmtpProvider extends PlaceholderMailProvider {
  protected readonly capabilities: MailProviderCapabilities = {
    providerType: "imap-smtp",
    supportsThreads: false,
    supportsServerDrafts: false,
    supportsArchive: false,
    supportsMove: false,
    supportsLabels: false,
    supportsRecentSentSamples: false
  };
}
