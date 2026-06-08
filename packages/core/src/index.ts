import type { AiActions } from "@yumail/ai";
import type {
  MailMetadataRepository,
  ProviderSyncState,
  StoredJmapAccountConfig
} from "@yumail/db";
import type {
  GetMessageInput,
  Mailbox,
  Message,
  MessageDetail,
  MailProvider
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
  authSecret: string;
}

export interface JmapConnectionTestResult {
  ok: boolean;
  message: string;
  mailboxes: Mailbox[];
  jmapAccountId?: string;
  sessionUrl?: string;
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

export function createMailAccountService(input: CreateMailAccountServiceInput): MailAccountService {
  return new DefaultMailAccountService(input);
}

export function createThreadReadingService(
  input: CreateMailAccountServiceInput
): ThreadReadingService {
  return new DefaultThreadReadingService(input);
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
        sessionUrl: connectionInfo.sessionUrl
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
        mailboxes: []
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
      jmapAccountId: connectionInfo.jmapAccountId,
      sessionApiUrl: connectionInfo.session.apiUrl,
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not connect to the JMAP server.";
}
