import type { AiActions } from "@yumail/ai";
import type {
  MailMetadataRepository,
  ProviderSyncState,
  StoredJmapAccountConfig
} from "@yumail/db";
import type {
  GetMessageInput,
  JmapAuthMode,
  JmapConnectionDiagnostics,
  LocalDraft,
  Mailbox,
  Message,
  MessageDetail,
  MailProvider,
  Recipient,
  SendMessageResult
} from "@yumail/mail";
import { JmapProvider, resolveProviderMessageId } from "@yumail/mail";
import type { EntityId } from "@yumail/shared";
import { YuMailError, createStableEntityId, toIsoDateTime } from "@yumail/shared";

export interface YuMailServices {
  mailProvider: MailProvider;
  aiActions?: AiActions;
}

export interface AppBootstrapState {
  productName: "YuMail";
  milestone: "foundation";
  aiManualByDefault: true;
  remoteImagesBlockedByDefault: true;
}

export function createFoundationBootstrapState(): AppBootstrapState {
  return {
    productName: "YuMail",
    milestone: "foundation",
    aiManualByDefault: true,
    remoteImagesBlockedByDefault: true
  };
}

export interface SecretStorageAdapter {
  getSecret(reference: string): Promise<string | null>;
  setSecret(reference: string, value: string): Promise<void>;
  deleteSecret(reference: string): Promise<void>;
}

export interface JmapAccountSetupInput {
  displayName: string;
  emailAddress: string;
  jmapBaseUrl: string;
  authMode: JmapAuthMode;
  authSecret: string;
}

export interface JmapConnectionTestResult {
  ok: boolean;
  message: string;
  mailboxes: Mailbox[];
  jmapAccountId?: string;
  sessionUrl?: string;
  apiUrl?: string;
  diagnostics?: JmapConnectionDiagnostics;
}

export interface MailAccountState {
  accountConfig?: StoredJmapAccountConfig;
  mailboxes: Mailbox[];
  inboxMessages: Message[];
  inboxMailboxId?: EntityId;
}

export interface MailAccountService {
  loadState(): Promise<MailAccountState>;
  testJmapConnection(input: JmapAccountSetupInput): Promise<JmapConnectionTestResult>;
  saveJmapAccount(input: JmapAccountSetupInput): Promise<MailAccountState>;
  refreshInbox(accountId?: EntityId): Promise<MailAccountState>;
}

export interface CreateMailAccountServiceInput {
  metadataRepository: MailMetadataRepository;
  secretStorage: SecretStorageAdapter;
  fetch?: typeof fetch;
}

export interface LoadMessageDetailInput extends GetMessageInput {
  forceRefresh?: boolean;
}

export interface LoadMessageDetailResult {
  messageDetail: MessageDetail;
  source: "cache" | "provider";
}

export interface ThreadReadingService {
  loadMessageDetail(input: LoadMessageDetailInput): Promise<LoadMessageDetailResult>;
}

export interface CreateDraftInput {
  accountId: EntityId;
}

export interface CreateReplyDraftInput {
  accountId: EntityId;
  providerMessageId: string;
}

export interface UpdateDraftInput {
  draftId: EntityId;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  bodyText: string;
}

export interface RecipientValidationResult {
  isValid: boolean;
  invalidAddresses: string[];
  recipientCount: number;
  message: string;
}

export interface ComposeService {
  listDrafts(accountId: EntityId): Promise<LocalDraft[]>;
  getDraft(draftId: EntityId): Promise<LocalDraft | undefined>;
  createDraft(input: CreateDraftInput): Promise<LocalDraft>;
  createReplyDraft(input: CreateReplyDraftInput): Promise<LocalDraft>;
  updateDraft(input: UpdateDraftInput): Promise<LocalDraft>;
  discardDraft(draftId: EntityId): Promise<void>;
  sendDraft(draftId: EntityId): Promise<SendMessageResult>;
}

export function createMailAccountService(input: CreateMailAccountServiceInput): MailAccountService {
  return new DefaultMailAccountService(input);
}

export function createThreadReadingService(
  input: CreateMailAccountServiceInput
): ThreadReadingService {
  return new DefaultThreadReadingService(input);
}

export function createComposeService(
  input: CreateMailAccountServiceInput
): ComposeService {
  return new DefaultComposeService(input);
}

export function parseRecipientInput(value: string): Recipient[] {
  return splitRecipientInput(value)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseRecipientToken);
}

export function validateRecipients(
  recipientGroups: Pick<LocalDraft, "to" | "cc" | "bcc">
): RecipientValidationResult {
  const recipients = [
    ...recipientGroups.to,
    ...recipientGroups.cc,
    ...recipientGroups.bcc
  ];
  const invalidAddresses = recipients
    .map((recipient) => recipient.address.trim())
    .filter((address) => !isValidEmailAddress(address));

  const recipientCount = recipients.length;
  const message = recipientCount === 0
    ? "Add at least one recipient before sending."
    : invalidAddresses.length === 0
      ? ""
      : invalidAddresses.length === 1
        ? `Correct this recipient address before sending: ${invalidAddresses[0]}.`
        : `Correct these recipient addresses before sending: ${invalidAddresses.join(", ")}.`;

  return {
    isValid: recipients.length > 0 && invalidAddresses.length === 0,
    invalidAddresses,
    recipientCount,
    message
  };
}

class DefaultComposeService implements ComposeService {
  private readonly metadataRepository: MailMetadataRepository;
  private readonly secretStorage: SecretStorageAdapter;
  private readonly fetchImpl?: typeof fetch;

  constructor(input: CreateMailAccountServiceInput) {
    this.metadataRepository = input.metadataRepository;
    this.secretStorage = input.secretStorage;
    this.fetchImpl = input.fetch;
  }

  listDrafts(accountId: EntityId): Promise<LocalDraft[]> {
    return this.metadataRepository.listDrafts(accountId);
  }

  getDraft(draftId: EntityId): Promise<LocalDraft | undefined> {
    return this.metadataRepository.getDraft(draftId);
  }

  async createDraft(input: CreateDraftInput): Promise<LocalDraft> {
    await this.getAccountConfig(input.accountId);
    const now = toIsoDateTime();
    const draft: LocalDraft = {
      id: createStableEntityId("draft", [
        input.accountId,
        crypto.randomUUID()
      ]),
      accountId: input.accountId,
      mode: "new",
      references: [],
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      bodyFormat: "plain-text",
      bodyText: "",
      createdAt: now,
      updatedAt: now
    };

    await this.metadataRepository.saveDraft(draft);
    return draft;
  }

  async createReplyDraft(input: CreateReplyDraftInput): Promise<LocalDraft> {
    const accountConfig = await this.getAccountConfig(input.accountId);
    const message = await this.metadataRepository.getMessageDetail(
      input.accountId,
      input.providerMessageId
    );

    if (!message) {
      throw new YuMailError({
        code: "reply_message_not_cached",
        message: "Load the message before creating a reply."
      });
    }

    const now = toIsoDateTime();
    const draft: LocalDraft = {
      id: createStableEntityId("draft", [
        input.accountId,
        crypto.randomUUID()
      ]),
      accountId: input.accountId,
      mode: "reply",
      relatedMessageId: message.id,
      relatedProviderMessageId: message.providerMessageId,
      relatedProviderThreadId: message.providerThreadId,
      relatedMessageIdHeader: message.messageIdHeader,
      references: message.references ?? [],
      to: getReplyRecipients(message, accountConfig.account.emailAddress),
      cc: [],
      bcc: [],
      subject: createReplySubject(message.subject),
      bodyFormat: "plain-text",
      bodyText: "",
      createdAt: now,
      updatedAt: now
    };

    await this.metadataRepository.saveDraft(draft);
    return draft;
  }

  async updateDraft(input: UpdateDraftInput): Promise<LocalDraft> {
    const existingDraft = await this.requireDraft(input.draftId);
    const updatedDraft: LocalDraft = {
      ...existingDraft,
      to: normalizeRecipients(input.to),
      cc: normalizeRecipients(input.cc),
      bcc: normalizeRecipients(input.bcc),
      subject: input.subject,
      bodyText: input.bodyText,
      updatedAt: toIsoDateTime()
    };

    await this.metadataRepository.saveDraft(updatedDraft);
    return updatedDraft;
  }

  discardDraft(draftId: EntityId): Promise<void> {
    return this.metadataRepository.deleteDraft(draftId);
  }

  async sendDraft(draftId: EntityId): Promise<SendMessageResult> {
    const draft = await this.requireDraft(draftId);
    const validation = validateRecipients(draft);

    if (!validation.isValid) {
      throw new YuMailError({
        code: validation.recipientCount === 0
          ? "missing_recipients"
          : "invalid_recipients",
        message: validation.message
      });
    }

    const accountConfig = await this.getAccountConfig(draft.accountId);
    const secret = await this.secretStorage.getSecret(accountConfig.credentialReference);

    if (!secret) {
      throw new YuMailError({
        code: "missing_jmap_secret",
        message: "JMAP credentials are missing from secure storage."
      });
    }

    const provider = new JmapProvider({
      localAccountId: accountConfig.account.id,
      emailAddress: accountConfig.account.emailAddress,
      baseUrl: accountConfig.jmapBaseUrl,
      authSecret: secret,
      authMode: accountConfig.authMode,
      authUsername: accountConfig.authUsername,
      jmapAccountId: accountConfig.jmapAccountId,
      fetch: this.fetchImpl
    });
    const sendInput = {
      accountId: draft.accountId,
      from: {
        name: accountConfig.account.displayName,
        address: accountConfig.account.emailAddress
      },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      bodyText: draft.bodyText,
      replyTo: draft.mode === "reply" && draft.relatedMessageId
        && draft.relatedProviderMessageId
        ? {
          messageId: draft.relatedMessageId,
          providerMessageId: draft.relatedProviderMessageId,
          providerThreadId: draft.relatedProviderThreadId,
          messageIdHeader: draft.relatedMessageIdHeader,
          references: draft.references
        }
        : undefined
    };
    const result = sendInput.replyTo
      ? await provider.replyMessage({
        ...sendInput,
        replyTo: sendInput.replyTo
      })
      : await provider.sendMessage(sendInput);

    if (result.sent) {
      await this.metadataRepository.deleteDraft(draft.id);
    }

    return result;
  }

  private async getAccountConfig(accountId: EntityId): Promise<StoredJmapAccountConfig> {
    const accountConfigs = await this.metadataRepository.listAccountConfigs();
    const accountConfig = accountConfigs.find(
      (candidate) => candidate.account.id === accountId
    );

    if (!accountConfig) {
      throw new YuMailError({
        code: "mail_account_not_found",
        message: "The selected mail account is not configured."
      });
    }

    return accountConfig;
  }

  private async requireDraft(draftId: EntityId): Promise<LocalDraft> {
    const draft = await this.metadataRepository.getDraft(draftId);

    if (!draft) {
      throw new YuMailError({
        code: "draft_not_found",
        message: "The selected local draft no longer exists."
      });
    }

    return draft;
  }
}

class DefaultThreadReadingService implements ThreadReadingService {
  private readonly metadataRepository: MailMetadataRepository;
  private readonly secretStorage: SecretStorageAdapter;
  private readonly fetchImpl?: typeof fetch;

  constructor(input: CreateMailAccountServiceInput) {
    this.metadataRepository = input.metadataRepository;
    this.secretStorage = input.secretStorage;
    this.fetchImpl = input.fetch;
  }

  async loadMessageDetail(input: LoadMessageDetailInput): Promise<LoadMessageDetailResult> {
    const providerMessageId = resolveProviderMessageId(input);

    if (!input.forceRefresh) {
      const cachedMessageDetail = await this.metadataRepository.getMessageDetail(
        input.accountId,
        providerMessageId
      );

      if (cachedMessageDetail) {
        return {
          messageDetail: cachedMessageDetail,
          source: "cache"
        };
      }
    }

    const accountConfigs = await this.metadataRepository.listAccountConfigs();
    const accountConfig = accountConfigs.find(
      (candidate) => candidate.account.id === input.accountId
    );

    if (!accountConfig) {
      throw new YuMailError({
        code: "mail_account_not_found",
        message: "The selected mail account is not configured."
      });
    }

    const secret = await this.secretStorage.getSecret(accountConfig.credentialReference);

    if (!secret) {
      throw new YuMailError({
        code: "missing_jmap_secret",
        message: "JMAP credentials are missing from secure storage."
      });
    }

    const provider = new JmapProvider({
      localAccountId: accountConfig.account.id,
      emailAddress: accountConfig.account.emailAddress,
      baseUrl: accountConfig.jmapBaseUrl,
      authSecret: secret,
      authMode: accountConfig.authMode,
      authUsername: accountConfig.authUsername,
      fetch: this.fetchImpl
    });
    const messageDetail = await provider.getMessage({
      accountId: input.accountId,
      messageId: input.messageId,
      providerMessageId,
      mailboxId: input.mailboxId
    });

    await this.metadataRepository.saveMessageDetail(messageDetail);

    return {
      messageDetail,
      source: "provider"
    };
  }
}

class DefaultMailAccountService implements MailAccountService {
  private readonly metadataRepository: MailMetadataRepository;
  private readonly secretStorage: SecretStorageAdapter;
  private readonly fetchImpl?: typeof fetch;

  constructor(input: CreateMailAccountServiceInput) {
    this.metadataRepository = input.metadataRepository;
    this.secretStorage = input.secretStorage;
    this.fetchImpl = input.fetch;
  }

  async loadState(): Promise<MailAccountState> {
    const [accountConfig] = await this.metadataRepository.listAccountConfigs();

    if (!accountConfig) {
      return {
        mailboxes: [],
        inboxMessages: []
      };
    }

    return this.loadCachedState(accountConfig);
  }

  async testJmapConnection(input: JmapAccountSetupInput): Promise<JmapConnectionTestResult> {
    try {
      const accountId = this.createAccountId(input);
      const authSecret = await this.resolveAccountSecret(accountId, input.authSecret);
      const provider = this.createProvider(accountId, input, authSecret);
      const connectionInfo = await provider.discoverSession();
      const mailboxes = await provider.listMailboxes(accountId);

      return {
        ok: true,
        message: `Connected to ${mailboxes.length} mailbox${mailboxes.length === 1 ? "" : "es"}.`,
        mailboxes,
        jmapAccountId: connectionInfo.jmapAccountId,
        sessionUrl: connectionInfo.sessionUrl,
        apiUrl: connectionInfo.apiUrl,
        diagnostics: connectionInfo.diagnostics
      };
    } catch (error) {
      const diagnostics = error instanceof YuMailError
        && isJmapConnectionDiagnostics(error.cause)
        ? error.cause
        : undefined;

      return {
        ok: false,
        message: diagnostics?.message ?? getErrorMessage(error),
        mailboxes: [],
        diagnostics
      };
    }
  }

  async saveJmapAccount(input: JmapAccountSetupInput): Promise<MailAccountState> {
    const now = toIsoDateTime();
    const accountId = this.createAccountId(input);
    const credentialReference = this.createCredentialReference(input);
    const authSecret = await this.resolveAccountSecret(accountId, input.authSecret);
    const provider = this.createProvider(accountId, input, authSecret);
    const connectionInfo = await provider.discoverSession();
    const mailboxes = await provider.listMailboxes(accountId);
    const inboxMailbox = findInboxMailbox(mailboxes);
    const inboxMessages = inboxMailbox
      ? (await provider.listMessages({
        accountId,
        mailboxId: inboxMailbox.id,
        page: { limit: 25 }
      })).items
      : [];

    await this.secretStorage.setSecret(credentialReference, authSecret);

    const accountConfig: StoredJmapAccountConfig = {
      account: {
        id: accountId,
        displayName: input.displayName.trim(),
        emailAddress: input.emailAddress.trim(),
        providerType: "jmap",
        providerConfigReference: createStableEntityId("provider-config", [
          input.emailAddress,
          input.jmapBaseUrl
        ]),
        isDefault: true,
        createdAt: now,
        updatedAt: now
      },
      jmapBaseUrl: input.jmapBaseUrl.trim(),
      credentialReference,
      authMode: normalizeJmapAccountAuthMode(input.authMode),
      jmapAccountId: connectionInfo.jmapAccountId,
      sessionUrl: connectionInfo.sessionUrl,
      sessionApiUrl: connectionInfo.apiUrl,
      lastConnectedAt: now
    };

    await this.metadataRepository.saveAccountConfig(accountConfig);
    await this.metadataRepository.saveMailboxes(accountId, mailboxes);

    if (inboxMailbox) {
      await this.metadataRepository.saveMessages(inboxMailbox.id, inboxMessages);
      await this.metadataRepository.saveSyncState(this.createSyncState(accountId, inboxMailbox.id, now));
    }

    return {
      accountConfig,
      mailboxes,
      inboxMessages,
      inboxMailboxId: inboxMailbox?.id
    };
  }

  async refreshInbox(accountId?: EntityId): Promise<MailAccountState> {
    const accountConfigs = await this.metadataRepository.listAccountConfigs();
    const accountConfig = accountId
      ? accountConfigs.find((candidate) => candidate.account.id === accountId)
      : accountConfigs[0];

    if (!accountConfig) {
      return {
        mailboxes: [],
        inboxMessages: []
      };
    }

    const secret = await this.secretStorage.getSecret(accountConfig.credentialReference);

    if (!secret) {
      throw new YuMailError({
        code: "missing_jmap_secret",
        message: "JMAP credentials are missing from secure storage."
      });
    }

    const provider = this.createProvider(
      accountConfig.account.id,
      {
        displayName: accountConfig.account.displayName,
        emailAddress: accountConfig.account.emailAddress,
        jmapBaseUrl: accountConfig.jmapBaseUrl,
        authMode: accountConfig.authMode,
        authSecret: secret
      },
      secret
    );
    const mailboxes = await provider.listMailboxes(accountConfig.account.id);
    const inboxMailbox = findInboxMailbox(mailboxes);
    const inboxMessages = inboxMailbox
      ? (await provider.listMessages({
        accountId: accountConfig.account.id,
        mailboxId: inboxMailbox.id,
        page: { limit: 25 }
      })).items
      : [];
    const now = toIsoDateTime();

    await this.metadataRepository.saveMailboxes(accountConfig.account.id, mailboxes);

    if (inboxMailbox) {
      await this.metadataRepository.saveMessages(inboxMailbox.id, inboxMessages);
      await this.metadataRepository.saveSyncState(
        this.createSyncState(accountConfig.account.id, inboxMailbox.id, now)
      );
    }

    return {
      accountConfig,
      mailboxes,
      inboxMessages,
      inboxMailboxId: inboxMailbox?.id
    };
  }

  private async loadCachedState(accountConfig: StoredJmapAccountConfig): Promise<MailAccountState> {
    const mailboxes = await this.metadataRepository.getMailboxes(accountConfig.account.id);
    const inboxMailbox = findInboxMailbox(mailboxes);
    const inboxMessages = inboxMailbox
      ? await this.metadataRepository.getMessages(inboxMailbox.id)
      : [];

    return {
      accountConfig,
      mailboxes,
      inboxMessages,
      inboxMailboxId: inboxMailbox?.id
    };
  }

  private createProvider(
    accountId: EntityId,
    input: JmapAccountSetupInput,
    authSecret: string
  ): JmapProvider {
    return new JmapProvider({
      localAccountId: accountId,
      emailAddress: input.emailAddress,
      baseUrl: input.jmapBaseUrl,
      authSecret,
      authMode: normalizeJmapAccountAuthMode(input.authMode),
      fetch: this.fetchImpl
    });
  }

  private createAccountId(input: JmapAccountSetupInput): EntityId {
    return createStableEntityId("account", [input.emailAddress, input.jmapBaseUrl]);
  }

  private createCredentialReference(input: JmapAccountSetupInput): string {
    return createStableEntityId("credential", ["jmap", input.emailAddress, input.jmapBaseUrl]);
  }

  private async resolveAccountSecret(
    accountId: EntityId,
    submittedSecret: string
  ): Promise<string> {
    if (submittedSecret.trim()) {
      return submittedSecret;
    }

    const accountConfigs = await this.metadataRepository.listAccountConfigs();
    const accountConfig = accountConfigs.find(
      (candidate) => candidate.account.id === accountId
    );

    if (!accountConfig) {
      throw new YuMailError({
        code: "missing_jmap_secret",
        message: "Enter credentials before testing this JMAP account."
      });
    }

    const storedSecret = await this.secretStorage.getSecret(
      accountConfig.credentialReference
    );

    if (!storedSecret) {
      throw new YuMailError({
        code: "missing_jmap_secret",
        message: "JMAP credentials are missing from secure storage."
      });
    }

    return storedSecret;
  }

  private createSyncState(accountId: EntityId, mailboxId: EntityId, now: string): ProviderSyncState {
    return {
      id: createStableEntityId("sync", [accountId, mailboxId]),
      accountId,
      mailboxId,
      providerType: "jmap",
      syncStatus: "idle",
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now
    };
  }
}

function findInboxMailbox(mailboxes: Mailbox[]): Mailbox | undefined {
  return mailboxes.find((mailbox) => mailbox.role === "inbox")
    ?? mailboxes.find((mailbox) => mailbox.name.toLowerCase() === "inbox");
}

function splitRecipientInput(value: string): string[] {
  const entries: string[] = [];
  let currentEntry = "";
  let isQuoted = false;
  let isEscaped = false;
  let angleDepth = 0;

  for (const character of value) {
    if (isEscaped) {
      currentEntry += character;
      isEscaped = false;
      continue;
    }

    if (character === "\\" && isQuoted) {
      currentEntry += character;
      isEscaped = true;
      continue;
    }

    if (character === "\"") {
      isQuoted = !isQuoted;
      currentEntry += character;
      continue;
    }

    if (!isQuoted && character === "<") {
      angleDepth += 1;
      currentEntry += character;
      continue;
    }

    if (!isQuoted && character === ">" && angleDepth > 0) {
      angleDepth -= 1;
      currentEntry += character;
      continue;
    }

    if (!isQuoted && angleDepth === 0 && (
      character === "," || character === ";" || character === "\n"
    )) {
      entries.push(currentEntry);
      currentEntry = "";
      continue;
    }

    currentEntry += character;
  }

  entries.push(currentEntry);
  return entries;
}

function parseRecipientToken(value: string): Recipient {
  const addressMatch = value.match(/^(.*?)<([^<>]+)>$/u);

  if (!addressMatch) {
    return { address: unquoteDisplayName(value).trim() };
  }

  const name = unquoteDisplayName(addressMatch[1]?.trim() ?? "");

  return {
    ...(name ? { name } : {}),
    address: addressMatch[2]?.trim() ?? ""
  };
}

function unquoteDisplayName(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length >= 2 && trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) {
    return trimmedValue
      .slice(1, -1)
      .replace(/\\(["\\])/gu, "$1")
      .trim();
  }

  return trimmedValue.replace(/^['"]|['"]$/gu, "").trim();
}

function createReplySubject(subject: string): string {
  return /^\s*re\s*:/iu.test(subject) ? subject : `Re: ${subject}`;
}

function getReplyRecipients(
  message: Message,
  accountEmailAddress: string
): Recipient[] {
  if (message.replyTo && message.replyTo.length > 0) {
    return normalizeRecipients(message.replyTo);
  }

  if (message.from.address.toLowerCase() !== accountEmailAddress.toLowerCase()) {
    return normalizeRecipients([message.from]);
  }

  return normalizeRecipients(
    message.to.filter(
      (recipient) => recipient.address.toLowerCase() !== accountEmailAddress.toLowerCase()
    )
  );
}

function normalizeRecipients(recipients: Recipient[]): Recipient[] {
  const normalizedRecipients = new Map<string, Recipient>();

  for (const recipient of recipients) {
    const address = recipient.address.trim();

    if (!address) {
      continue;
    }

    normalizedRecipients.set(address.toLowerCase(), {
      ...(recipient.name?.trim() ? { name: recipient.name.trim() } : {}),
      address
    });
  }

  return [...normalizedRecipients.values()];
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/u.test(value);
}

function normalizeJmapAccountAuthMode(value: JmapAuthMode | undefined): JmapAuthMode {
  return value === "bearer" ? "bearer" : "basic";
}

function isJmapConnectionDiagnostics(value: unknown): value is JmapConnectionDiagnostics {
  return typeof value === "object"
    && value !== null
    && "attemptedUrls" in value
    && Array.isArray((value as JmapConnectionDiagnostics).attemptedUrls);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not connect to the JMAP server.";
}
