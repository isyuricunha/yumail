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
import {
  UnsupportedProviderOperationError,
  YuMailError,
  toIsoDateTime
} from "@yumail/shared";

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

export interface MessageBodyPart {
  partId?: string;
  blobId?: string;
  mimeType: string;
  name?: string;
  charset?: string;
  sizeBytes?: number;
  disposition?: string;
  contentId?: string;
  language: string[];
  location?: string;
  isTruncated: boolean;
  hasEncodingProblem: boolean;
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
  bodyParts: MessageBodyPart[];
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
  providerMessageId?: string;
  mailboxId?: EntityId;
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

const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const JMAP_MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";

type FetchFunction = typeof fetch;
type JmapMethodCall = [string, Record<string, unknown>, string];
type JmapMethodResponse = [string, unknown, string];

interface JmapAccountEntry {
  name?: string;
  isPersonal?: boolean;
  isReadOnly?: boolean;
  accountCapabilities?: Record<string, unknown>;
}

export interface JmapSession {
  apiUrl: string;
  accounts: Record<string, JmapAccountEntry>;
  primaryAccounts?: Record<string, string>;
}

export interface JmapProviderOptions {
  localAccountId: EntityId;
  emailAddress: EmailAddress;
  baseUrl: string;
  authSecret: string;
  fetch?: FetchFunction;
}

export interface JmapConnectionInfo {
  session: JmapSession;
  jmapAccountId: string;
  sessionUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function getRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function getRecordArray(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function createJmapAuthorizationHeader(authSecret: string, emailAddress: EmailAddress): string {
  const trimmedSecret = authSecret.trim();

  if (/^(bearer|basic)\s+/iu.test(trimmedSecret)) {
    return trimmedSecret;
  }

  if (trimmedSecret.toLowerCase().startsWith("password:")) {
    return `Basic ${btoa(`${emailAddress}:${trimmedSecret.slice("password:".length)}`)}`;
  }

  if (trimmedSecret.includes(":")) {
    return `Basic ${btoa(trimmedSecret)}`;
  }

  return `Bearer ${trimmedSecret}`;
}

export function createJmapSessionUrlCandidates(baseUrl: string): string[] {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/u, "");
  const parsedUrl = new URL(trimmedBaseUrl);

  if (
    parsedUrl.pathname.endsWith("/.well-known/jmap") ||
    parsedUrl.pathname.endsWith("/jmap/session")
  ) {
    return [parsedUrl.toString()];
  }

  return unique([
    `${trimmedBaseUrl}/.well-known/jmap`,
    `${trimmedBaseUrl}/jmap/session`,
    `${parsedUrl.origin}/.well-known/jmap`,
    `${parsedUrl.origin}/jmap/session`
  ]);
}

function createMailboxEntityId(accountId: EntityId, providerMailboxId: string): EntityId {
  return `${accountId}:mailbox:${encodeURIComponent(providerMailboxId)}`;
}

function getProviderMailboxId(mailboxId: EntityId): string {
  const marker = ":mailbox:";
  const markerIndex = mailboxId.indexOf(marker);

  if (markerIndex === -1) {
    return mailboxId;
  }

  return decodeURIComponent(mailboxId.slice(markerIndex + marker.length));
}

function createMessageEntityId(accountId: EntityId, providerMessageId: string): EntityId {
  return `${accountId}:message:${encodeURIComponent(providerMessageId)}`;
}

export function resolveProviderMessageId(input: GetMessageInput): string {
  if (input.providerMessageId) {
    return input.providerMessageId;
  }

  const marker = ":message:";
  const markerIndex = input.messageId.indexOf(marker);

  if (markerIndex === -1) {
    return input.messageId;
  }

  return decodeURIComponent(input.messageId.slice(markerIndex + marker.length));
}

function normalizeMailboxRole(role: string | undefined, name: string): MailboxRole {
  const normalizedRole = role?.toLowerCase();
  const normalizedName = name.toLowerCase();

  if (normalizedRole === "inbox" || normalizedName === "inbox") {
    return "inbox";
  }

  if (normalizedRole === "sent" || normalizedName === "sent") {
    return "sent";
  }

  if (normalizedRole === "drafts" || normalizedName === "drafts") {
    return "drafts";
  }

  if (normalizedRole === "archive" || normalizedName === "archive") {
    return "archive";
  }

  if (normalizedRole === "trash" || normalizedName === "trash") {
    return "trash";
  }

  if (normalizedRole === "junk" || normalizedRole === "spam" || normalizedName === "junk") {
    return "junk";
  }

  return "custom";
}

function readRecipient(value: Record<string, unknown> | undefined): Recipient {
  return {
    name: value ? getString(value, "name") : undefined,
    address: value ? getString(value, "email") ?? "" : ""
  };
}

function readRecipients(email: Record<string, unknown>, key: string): Recipient[] {
  return getRecordArray(email, key)
    .map(readRecipient)
    .filter((recipient) => recipient.address.length > 0);
}

function firstStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((item): item is string => typeof item === "string");
    return firstValue;
  }

  return undefined;
}

function getFirstMailboxId(email: Record<string, unknown>): string | undefined {
  const mailboxIds = getRecord(email, "mailboxIds");
  return mailboxIds ? Object.keys(mailboxIds)[0] : undefined;
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function flattenBodyStructure(
  part: Record<string, unknown> | undefined,
  output: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (!part) {
    return output;
  }

  output.push(part);

  for (const subPart of getRecordArray(part, "subParts")) {
    flattenBodyStructure(subPart, output);
  }

  return output;
}

function getBodyValue(
  bodyValues: Record<string, unknown>,
  partId: string | undefined
): Record<string, unknown> | undefined {
  if (!partId) {
    return undefined;
  }

  const value = bodyValues[partId];
  return isRecord(value) ? value : undefined;
}

function readBodyPart(
  part: Record<string, unknown>,
  bodyValues: Record<string, unknown>
): MessageBodyPart {
  const partId = getString(part, "partId");
  const bodyValue = getBodyValue(bodyValues, partId);

  return {
    partId,
    blobId: getString(part, "blobId"),
    mimeType: getString(part, "type") ?? "application/octet-stream",
    name: getString(part, "name"),
    charset: getString(part, "charset"),
    sizeBytes: getNumber(part, "size"),
    disposition: getString(part, "disposition"),
    contentId: getString(part, "cid"),
    language: getStringArray(part, "language"),
    location: getString(part, "location"),
    isTruncated: bodyValue ? getBoolean(bodyValue, "isTruncated") ?? false : false,
    hasEncodingProblem: bodyValue ? getBoolean(bodyValue, "isEncodingProblem") ?? false : false
  };
}

function collectBodyValue(
  parts: Record<string, unknown>[],
  bodyValues: Record<string, unknown>
): string | undefined {
  const values = parts
    .map((part) => getBodyValue(bodyValues, getString(part, "partId")))
    .map((bodyValue) => bodyValue ? getString(bodyValue, "value") : undefined)
    .filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join("\n") : undefined;
}

function uniqueBodyParts(parts: Record<string, unknown>[]): Record<string, unknown>[] {
  const uniqueParts = new Map<string, Record<string, unknown>>();

  for (const part of parts) {
    const key = [
      getString(part, "partId"),
      getString(part, "blobId"),
      getString(part, "type"),
      getString(part, "name")
    ].filter(Boolean).join(":");

    if (key) {
      uniqueParts.set(key, part);
    }
  }

  return [...uniqueParts.values()];
}

function getMethodResponse(
  methodResponses: JmapMethodResponse[],
  methodName: string,
  callId: string
): Record<string, unknown> {
  const foundResponse = methodResponses.find(
    ([responseName, , responseCallId]) => responseName === methodName && responseCallId === callId
  );

  if (!foundResponse) {
    const errorResponse = methodResponses.find(
      ([responseName, , responseCallId]) => responseName === "error" && responseCallId === callId
    );
    const errorDetails = errorResponse && isRecord(errorResponse[1]) ? errorResponse[1] : undefined;

    throw new YuMailError({
      code: "jmap_method_failed",
      message: `JMAP method ${methodName} failed.`,
      cause: errorDetails
    });
  }

  if (!isRecord(foundResponse[1])) {
    throw new YuMailError({
      code: "jmap_invalid_response",
      message: `JMAP method ${methodName} returned an invalid response.`
    });
  }

  return foundResponse[1];
}

function parseMethodResponses(responseBody: unknown): JmapMethodResponse[] {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.methodResponses)) {
    throw new YuMailError({
      code: "jmap_invalid_response",
      message: "JMAP response did not include methodResponses."
    });
  }

  return responseBody.methodResponses
    .filter(Array.isArray)
    .filter((response): response is JmapMethodResponse => (
      typeof response[0] === "string" &&
      typeof response[2] === "string"
    ));
}

abstract class PlaceholderMailProvider implements MailProvider {
  protected abstract readonly capabilities: MailProviderCapabilities;

  async getCapabilities(): Promise<MailProviderCapabilities> {
    return this.capabilities;
  }

  async listMailboxes(_accountId: EntityId): Promise<Mailbox[]> {
    throw new UnsupportedProviderOperationError("listMailboxes");
  }

  async listMessages(_input: ListMessagesInput): Promise<ListMessagesResult> {
    throw new UnsupportedProviderOperationError("listMessages");
  }

  async getMessage(_input: GetMessageInput): Promise<MessageDetail> {
    throw new UnsupportedProviderOperationError("getMessage");
  }

  async getThread(_input: GetThreadInput): Promise<ThreadDetail> {
    throw new UnsupportedProviderOperationError("getThread");
  }

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    throw new UnsupportedProviderOperationError("sendMessage");
  }

  async saveDraft(_input: SaveDraftInput): Promise<SaveDraftResult> {
    throw new UnsupportedProviderOperationError("saveDraft");
  }

  async markRead(_input: MessageMutationInput): Promise<void> {
    throw new UnsupportedProviderOperationError("markRead");
  }

  async markUnread(_input: MessageMutationInput): Promise<void> {
    throw new UnsupportedProviderOperationError("markUnread");
  }

  async archive(_input: MessageMutationInput): Promise<void> {
    throw new UnsupportedProviderOperationError("archive");
  }

  async move(_input: MoveMessageInput): Promise<void> {
    throw new UnsupportedProviderOperationError("move");
  }

  async delete(_input: MessageMutationInput): Promise<void> {
    throw new UnsupportedProviderOperationError("delete");
  }

  async downloadAttachment(_input: DownloadAttachmentInput): Promise<AttachmentDownload> {
    throw new UnsupportedProviderOperationError("downloadAttachment");
  }

  async getRecentSentMessages(_input: RecentSentInput): Promise<SentMessageSample[]> {
    throw new UnsupportedProviderOperationError("getRecentSentMessages");
  }
}

export class JmapProvider extends PlaceholderMailProvider {
  private readonly localAccountId: EntityId;
  private readonly emailAddress: EmailAddress;
  private readonly baseUrl: string;
  private readonly authSecret: string;
  private readonly fetchImpl: FetchFunction;
  private connectionInfo?: JmapConnectionInfo;

  constructor(options: JmapProviderOptions) {
    super();
    this.localAccountId = options.localAccountId;
    this.emailAddress = options.emailAddress;
    this.baseUrl = options.baseUrl;
    this.authSecret = options.authSecret;
    this.fetchImpl = options.fetch ?? fetch;
  }

  protected readonly capabilities: MailProviderCapabilities = {
    providerType: "jmap",
    supportsThreads: true,
    supportsServerDrafts: true,
    supportsArchive: true,
    supportsMove: true,
    supportsLabels: true,
    supportsRecentSentSamples: true
  };

  async discoverSession(): Promise<JmapConnectionInfo> {
    if (this.connectionInfo) {
      return this.connectionInfo;
    }

    const authorization = createJmapAuthorizationHeader(this.authSecret, this.emailAddress);
    let lastError: unknown;

    for (const sessionUrl of createJmapSessionUrlCandidates(this.baseUrl)) {
      try {
        const response = await this.fetchImpl(sessionUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Authorization": authorization
          }
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }

        const session = this.parseSession(await response.json());
        const jmapAccountId = this.getPrimaryMailAccountId(session);
        this.connectionInfo = { session, jmapAccountId, sessionUrl };
        return this.connectionInfo;
      } catch (error) {
        lastError = error;
      }
    }

    throw new YuMailError({
      code: "jmap_session_discovery_failed",
      message: "Could not discover a valid JMAP session endpoint.",
      cause: lastError
    });
  }

  override async listMailboxes(_accountId: EntityId): Promise<Mailbox[]> {
    const connectionInfo = await this.discoverSession();
    const methodResponses = await this.callJmap([
      [
        "Mailbox/get",
        {
          accountId: connectionInfo.jmapAccountId,
          ids: null
        },
        "mailboxes"
      ]
    ]);
    const response = getMethodResponse(methodResponses, "Mailbox/get", "mailboxes");
    const list = Array.isArray(response.list) ? response.list.filter(isRecord) : [];
    const now = toIsoDateTime();

    return list.map((mailbox) => {
      const providerMailboxId = getString(mailbox, "id") ?? "";
      const name = getString(mailbox, "name") ?? "Mailbox";
      const role = normalizeMailboxRole(getString(mailbox, "role"), name);

      return {
        id: createMailboxEntityId(this.localAccountId, providerMailboxId),
        accountId: this.localAccountId,
        providerMailboxId,
        name,
        role,
        unreadCount: getNumber(mailbox, "unreadEmails"),
        totalCount: getNumber(mailbox, "totalEmails"),
        createdAt: now,
        updatedAt: now
      };
    });
  }

  override async listMessages(input: ListMessagesInput): Promise<ListMessagesResult> {
    const connectionInfo = await this.discoverSession();
    const providerMailboxId = getProviderMailboxId(input.mailboxId);
    const limit = Math.max(1, Math.min(input.page.limit, 100));
    const queryResponses = await this.callJmap([
      [
        "Email/query",
        {
          accountId: connectionInfo.jmapAccountId,
          filter: {
            inMailbox: providerMailboxId
          },
          sort: [
            {
              property: "receivedAt",
              isAscending: false
            }
          ],
          limit,
          position: input.page.offset ?? 0
        },
        "query"
      ]
    ]);
    const queryResponse = getMethodResponse(queryResponses, "Email/query", "query");
    const emailIds = Array.isArray(queryResponse.ids)
      ? queryResponse.ids.filter((id): id is string => typeof id === "string")
      : [];

    if (emailIds.length === 0) {
      return { items: [], total: getNumber(queryResponse, "total") };
    }

    const getResponses = await this.callJmap([
      [
        "Email/get",
        {
          accountId: connectionInfo.jmapAccountId,
          ids: emailIds,
          properties: [
            "id",
            "mailboxIds",
            "threadId",
            "messageId",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "keywords",
            "hasAttachment"
          ]
        },
        "emails"
      ]
    ]);
    const getResponse = getMethodResponse(getResponses, "Email/get", "emails");
    const emails = Array.isArray(getResponse.list) ? getResponse.list.filter(isRecord) : [];

    return {
      items: emails.map((email) => this.normalizeMessage(email, input.mailboxId)),
      total: getNumber(queryResponse, "total")
    };
  }

  override async getMessage(input: GetMessageInput): Promise<MessageDetail> {
    const connectionInfo = await this.discoverSession();
    const providerMessageId = resolveProviderMessageId(input);
    const methodResponses = await this.callJmap([
      [
        "Email/get",
        {
          accountId: connectionInfo.jmapAccountId,
          ids: [providerMessageId],
          properties: [
            "id",
            "blobId",
            "mailboxIds",
            "threadId",
            "messageId",
            "from",
            "to",
            "cc",
            "bcc",
            "replyTo",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "keywords",
            "hasAttachment",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments"
          ],
          bodyProperties: [
            "partId",
            "blobId",
            "size",
            "name",
            "type",
            "charset",
            "disposition",
            "cid",
            "language",
            "location"
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          maxBodyValueBytes: 2_000_000
        },
        "message-detail"
      ]
    ]);
    const response = getMethodResponse(methodResponses, "Email/get", "message-detail");
    const email = Array.isArray(response.list) ? response.list.find(isRecord) : undefined;

    if (!email) {
      throw new YuMailError({
        code: "jmap_message_not_found",
        message: "The requested JMAP message was not found."
      });
    }

    return this.normalizeMessageDetail(email, input.mailboxId);
  }

  private parseSession(value: unknown): JmapSession {
    if (!isRecord(value)) {
      throw new YuMailError({
        code: "jmap_invalid_session",
        message: "JMAP session response was not an object."
      });
    }

    const apiUrl = getString(value, "apiUrl");
    const accounts = getRecord(value, "accounts");

    if (!apiUrl || !accounts) {
      throw new YuMailError({
        code: "jmap_invalid_session",
        message: "JMAP session response did not include apiUrl and accounts."
      });
    }

    const normalizedAccounts: Record<string, JmapAccountEntry> = {};

    for (const [accountId, account] of Object.entries(accounts)) {
      if (!isRecord(account)) {
        continue;
      }

      normalizedAccounts[accountId] = {
        name: getString(account, "name"),
        isPersonal: getBoolean(account, "isPersonal"),
        isReadOnly: getBoolean(account, "isReadOnly"),
        accountCapabilities: getRecord(account, "accountCapabilities")
      };
    }

    return {
      apiUrl,
      accounts: normalizedAccounts,
      primaryAccounts: getRecord(value, "primaryAccounts") as Record<string, string> | undefined
    };
  }

  private getPrimaryMailAccountId(session: JmapSession): string {
    const primaryMailAccountId = session.primaryAccounts?.[JMAP_MAIL_CAPABILITY];

    if (primaryMailAccountId && session.accounts[primaryMailAccountId]) {
      return primaryMailAccountId;
    }

    const discoveredAccountId = Object.entries(session.accounts).find(([, account]) => (
      Boolean(account.accountCapabilities?.[JMAP_MAIL_CAPABILITY])
    ))?.[0];

    if (!discoveredAccountId) {
      throw new YuMailError({
        code: "jmap_mail_account_not_found",
        message: "JMAP session did not include a mail-capable account."
      });
    }

    return discoveredAccountId;
  }

  private async callJmap(methodCalls: JmapMethodCall[]): Promise<JmapMethodResponse[]> {
    const connectionInfo = await this.discoverSession();
    const response = await this.fetchImpl(connectionInfo.session.apiUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": createJmapAuthorizationHeader(this.authSecret, this.emailAddress),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        using: [JMAP_CORE_CAPABILITY, JMAP_MAIL_CAPABILITY],
        methodCalls
      })
    });

    if (!response.ok) {
      throw new YuMailError({
        code: "jmap_request_failed",
        message: `JMAP API request failed with HTTP ${response.status}.`
      });
    }

    return parseMethodResponses(await response.json());
  }

  private normalizeMessage(email: Record<string, unknown>, requestedMailboxId: EntityId): Message {
    const now = toIsoDateTime();
    const providerMessageId = getString(email, "id") ?? "";
    const providerMailboxId = getFirstMailboxId(email);
    const mailboxId = providerMailboxId
      ? createMailboxEntityId(this.localAccountId, providerMailboxId)
      : requestedMailboxId;
    const from = readRecipient(getRecordArray(email, "from")[0]);
    const keywords = getRecord(email, "keywords") ?? {};
    const receivedAt = getString(email, "receivedAt");
    const sentAt = getString(email, "sentAt");
    const subject = getString(email, "subject") ?? "(no subject)";

    return {
      id: createMessageEntityId(this.localAccountId, providerMessageId),
      accountId: this.localAccountId,
      providerType: "jmap",
      providerMessageId,
      providerThreadId: getString(email, "threadId"),
      mailboxId,
      messageIdHeader: firstStringValue(email.messageId),
      subject,
      from,
      to: readRecipients(email, "to"),
      cc: readRecipients(email, "cc"),
      bcc: readRecipients(email, "bcc"),
      date: receivedAt ?? sentAt ?? now,
      receivedAt,
      snippet: getString(email, "preview") ?? "",
      isRead: keywords.$seen === true,
      isFlagged: keywords.$flagged === true,
      isAnswered: keywords.$answered === true,
      hasAttachments: getBoolean(email, "hasAttachment") ?? false,
      systemTags: [],
      userTags: Object.entries(keywords)
        .filter(([keyword, isSet]) => !keyword.startsWith("$") && isSet === true)
        .map(([keyword]) => keyword),
      createdAt: now,
      updatedAt: now
    };
  }

  private normalizeMessageDetail(
    email: Record<string, unknown>,
    requestedMailboxId?: EntityId
  ): MessageDetail {
    const providerMailboxId = getFirstMailboxId(email);
    const fallbackMailboxId = requestedMailboxId ?? createMailboxEntityId(
      this.localAccountId,
      providerMailboxId ?? "unknown"
    );
    const message = this.normalizeMessage(email, fallbackMailboxId);
    const bodyValues = getRecord(email, "bodyValues") ?? {};
    const textBody = getRecordArray(email, "textBody");
    const htmlBody = getRecordArray(email, "htmlBody");
    const attachmentParts = getRecordArray(email, "attachments");
    const structureParts = flattenBodyStructure(getRecord(email, "bodyStructure"));
    const bodyParts = uniqueBodyParts([
      ...structureParts,
      ...textBody,
      ...htmlBody,
      ...attachmentParts
    ]).map((part) => readBodyPart(part, bodyValues));

    return {
      ...message,
      bodyText: collectBodyValue(textBody, bodyValues),
      bodyHtml: collectBodyValue(htmlBody, bodyValues),
      bodyParts,
      attachments: attachmentParts.map((part, index) => ({
        id: `${message.id}:attachment:${encodeURIComponent(
          getString(part, "blobId") ?? getString(part, "partId") ?? String(index)
        )}`,
        messageId: message.id,
        providerAttachmentId:
          getString(part, "blobId") ?? getString(part, "partId") ?? String(index),
        filename: getString(part, "name") ?? `attachment-${index + 1}`,
        mimeType: getString(part, "type") ?? "application/octet-stream",
        sizeBytes: getNumber(part, "size") ?? 0,
        contentId: getString(part, "cid")
      }))
    };
  }
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
