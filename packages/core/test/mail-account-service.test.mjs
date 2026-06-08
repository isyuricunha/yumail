import assert from "node:assert/strict";
import test from "node:test";
import {
  createComposeService,
  createMailAccountService,
  createThreadReadingService,
  parseRecipientInput,
  validateRecipients
} from "../dist/index.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createFetchMock(requestLog = []) {
  return async (_url, init) => {
    if (init?.method === "GET") {
      return jsonResponse({
        capabilities: {
          "urn:ietf:params:jmap:core": {},
          "urn:ietf:params:jmap:mail": {},
          "urn:ietf:params:jmap:submission": {}
        },
        accounts: {
          accountA: {
            accountCapabilities: {
              "urn:ietf:params:jmap:mail": {},
              "urn:ietf:params:jmap:submission": {}
            }
          }
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "accountA"
        },
        apiUrl: "https://mail.example.com/jmap/api"
      });
    }

    const request = JSON.parse(String(init?.body));
    const methodName = request.methodCalls?.[0]?.[0];
    const callId = request.methodCalls?.[0]?.[2];
    requestLog.push({ methodName, callId });

    if (methodName === "Mailbox/get") {
      return jsonResponse({
        methodResponses: [
          [
            "Mailbox/get",
            {
              list: [
                {
                  id: "inbox-id",
                  name: "Inbox",
                  role: "inbox"
                }
              ]
            },
            "mailboxes"
          ]
        ]
      });
    }

    if (methodName === "Email/query") {
      return jsonResponse({
        methodResponses: [[
          "Email/query",
          { ids: ["email-1"], total: 1 },
          "query"
        ]]
      });
    }

    if (methodName === "Email/get") {
      const isMessageDetail = callId === "message-detail";
      return jsonResponse({
        methodResponses: [[
          "Email/get",
          {
            list: [
              {
                id: "email-1",
                mailboxIds: { "inbox-id": true },
                from: [{ email: "ada@example.com" }],
                subject: "Persist me",
                receivedAt: "2026-06-08T10:00:00.000Z",
                preview: "Metadata only",
                keywords: {},
                bodyStructure: isMessageDetail
                  ? {
                    partId: "text",
                    blobId: "text-blob",
                    type: "text/plain",
                    size: 15
                  }
                  : undefined,
                bodyValues: isMessageDetail
                  ? {
                    text: {
                      value: "Provider body"
                    }
                  }
                  : undefined,
                textBody: isMessageDetail
                  ? [{
                    partId: "text",
                    blobId: "text-blob",
                    type: "text/plain",
                    size: 15
                  }]
                  : undefined,
                htmlBody: isMessageDetail ? [] : undefined,
                attachments: isMessageDetail ? [] : undefined
              }
            ]
          },
          callId
        ]]
      });
    }

    throw new Error(`Unexpected method ${methodName}`);
  };
}

function createComposeFetchMock(requestLog, failSubmission = false) {
  return async (_url, init) => {
    if (init?.method === "GET") {
      return jsonResponse({
        capabilities: {
          "urn:ietf:params:jmap:core": {},
          "urn:ietf:params:jmap:mail": {},
          "urn:ietf:params:jmap:submission": {}
        },
        accounts: {
          accountA: {
            accountCapabilities: {
              "urn:ietf:params:jmap:mail": {},
              "urn:ietf:params:jmap:submission": {}
            }
          }
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "accountA"
        },
        apiUrl: "https://mail.example.com/jmap/api"
      });
    }

    const request = JSON.parse(String(init?.body));
    requestLog.push(request);
    const methodNames = request.methodCalls.map((methodCall) => methodCall[0]);
    const callIds = request.methodCalls.map((methodCall) => methodCall[2]);

    if (callIds.includes("cleanup-failed-outgoing-email")) {
      return jsonResponse({
        methodResponses: [[
          "Email/set",
          { destroyed: ["sent-email-1"] },
          "cleanup-failed-outgoing-email"
        ]]
      });
    }

    if (methodNames.includes("Identity/get")) {
      return jsonResponse({
        methodResponses: [
          [
            "Identity/get",
            {
              list: [{ id: "identity-1", email: "yu@example.com" }]
            },
            "send-identities"
          ],
          [
            "Mailbox/get",
            {
              list: [
                { id: "drafts-id", name: "Drafts", role: "drafts" },
                { id: "sent-id", name: "Sent", role: "sent" }
              ]
            },
            "send-mailboxes"
          ]
        ]
      });
    }

    return jsonResponse({
      methodResponses: [
        [
          "Email/set",
          {
            created: {
              "yumail-email": {
                id: "sent-email-1",
                threadId: "thread-1"
              }
            }
          },
          "create-outgoing-email"
        ],
        [
          "EmailSubmission/set",
          failSubmission
            ? {
              notCreated: {
                "yumail-submission": {
                  type: "forbiddenToSend",
                  description: "Submission rejected."
                }
              }
            }
            : {
              created: {
                "yumail-submission": {
                  id: "submission-1",
                  threadId: "thread-1",
                  sendAt: "2026-06-08T14:00:00.000Z"
                }
              }
            },
          "submit-outgoing-email"
        ]
      ]
    });
  };
}

class MemoryRepository {
  snapshot = {
    accountConfigs: [],
    mailboxesByAccountId: {},
    messagesByMailboxId: {},
    messageDetailsByCacheKey: {},
    syncStates: []
  };
  drafts = {};

  async loadSnapshot() {
    return this.snapshot;
  }

  async listAccountConfigs() {
    return this.snapshot.accountConfigs;
  }

  async saveAccountConfig(accountConfig) {
    this.snapshot.accountConfigs = [
      accountConfig,
      ...this.snapshot.accountConfigs.filter((candidate) => candidate.account.id !== accountConfig.account.id)
    ];
  }

  async saveMailboxes(accountId, mailboxes) {
    this.snapshot.mailboxesByAccountId[accountId] = mailboxes;
  }

  async getMailboxes(accountId) {
    return this.snapshot.mailboxesByAccountId[accountId] ?? [];
  }

  async saveMessages(mailboxId, messages) {
    this.snapshot.messagesByMailboxId[mailboxId] = messages;
  }

  async getMessages(mailboxId) {
    return this.snapshot.messagesByMailboxId[mailboxId] ?? [];
  }

  async saveMessageDetail(messageDetail) {
    const key = `${encodeURIComponent(messageDetail.accountId)}:${encodeURIComponent(messageDetail.providerMessageId)}`;
    this.snapshot.messageDetailsByCacheKey[key] = messageDetail;
  }

  async getMessageDetail(accountId, providerMessageId) {
    const key = `${encodeURIComponent(accountId)}:${encodeURIComponent(providerMessageId)}`;
    return this.snapshot.messageDetailsByCacheKey[key];
  }

  async saveSyncState(syncState) {
    this.snapshot.syncStates = [
      syncState,
      ...this.snapshot.syncStates.filter((candidate) => candidate.id !== syncState.id)
    ];
  }

  async listSyncStates() {
    return this.snapshot.syncStates;
  }

  async listDrafts(accountId) {
    return Object.values(this.drafts)
      .filter((draft) => draft.accountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getDraft(draftId) {
    return this.drafts[draftId];
  }

  async saveDraft(draft) {
    this.drafts[draft.id] = draft;
  }

  async deleteDraft(draftId) {
    delete this.drafts[draftId];
  }
}

class MemorySecretStorage {
  secrets = {};
  getReferences = [];

  async getSecret(reference) {
    this.getReferences.push(reference);
    return this.secrets[reference] ?? null;
  }

  async setSecret(reference, value) {
    this.secrets[reference] = value;
  }

  async deleteSecret(reference) {
    delete this.secrets[reference];
  }
}

test("saves JMAP account metadata and keeps the secret out of metadata storage", async () => {
  const repository = new MemoryRepository();
  const secretStorage = new MemorySecretStorage();
  const service = createMailAccountService({
    metadataRepository: repository,
    secretStorage,
    fetch: createFetchMock()
  });

  const state = await service.saveJmapAccount({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
    authMode: "basic",
    authSecret: "super-secret"
  });
  const serializedMetadata = JSON.stringify(await repository.loadSnapshot());

  assert.equal(state.accountConfig?.account.emailAddress, "yu@example.com");
  assert.equal(state.mailboxes[0].role, "inbox");
  assert.equal(state.inboxMessages[0].subject, "Persist me");
  assert.equal(state.accountConfig.authMode, "basic");
  assert.equal(serializedMetadata.includes("super-secret"), false);
  assert.equal(Object.values(secretStorage.secrets).includes("super-secret"), true);
});

test("reloads saved JMAP credentials by reference through secure storage", async () => {
  const repository = new MemoryRepository();
  const secretStorage = new MemorySecretStorage();
  const service = createMailAccountService({
    metadataRepository: repository,
    secretStorage,
    fetch: createFetchMock()
  });
  const savedState = await service.saveJmapAccount({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
    authMode: "basic",
    authSecret: "super-secret"
  });

  await service.refreshInbox(savedState.accountConfig.account.id);

  assert.deepEqual(secretStorage.getReferences, [
    savedState.accountConfig.credentialReference
  ]);
});

test("tests a saved JMAP account using its secure-storage reference", async () => {
  const repository = new MemoryRepository();
  const secretStorage = new MemorySecretStorage();
  const service = createMailAccountService({
    metadataRepository: repository,
    secretStorage,
    fetch: createFetchMock()
  });
  const savedState = await service.saveJmapAccount({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
    authMode: "basic",
    authSecret: "super-secret"
  });

  const result = await service.testJmapConnection({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
    authMode: "basic",
    authSecret: ""
  });

  assert.equal(result.ok, true);
  assert.deepEqual(secretStorage.getReferences, [
    savedState.accountConfig.credentialReference
  ]);
});

test("loads message detail from the provider once and then uses the local cache", async () => {
  const repository = new MemoryRepository();
  const secretStorage = new MemorySecretStorage();
  const requestLog = [];
  const accountService = createMailAccountService({
    metadataRepository: repository,
    secretStorage,
    fetch: createFetchMock(requestLog)
  });

  const accountState = await accountService.saveJmapAccount({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
    authMode: "basic",
    authSecret: "super-secret"
  });
  const message = accountState.inboxMessages[0];
  const readingService = createThreadReadingService({
    metadataRepository: repository,
    secretStorage,
    fetch: createFetchMock(requestLog)
  });
  const input = {
    accountId: message.accountId,
    messageId: message.id,
    mailboxId: message.mailboxId
  };

  const fetched = await readingService.loadMessageDetail(input);
  const cached = await readingService.loadMessageDetail(input);
  const detailRequests = requestLog.filter((request) => request.callId === "message-detail");

  assert.equal(fetched.source, "provider");
  assert.equal(fetched.messageDetail.bodyText, "Provider body");
  assert.equal(cached.source, "cache");
  assert.equal(cached.messageDetail.bodyText, "Provider body");
  assert.equal(detailRequests.length, 1);
});

test("parses and validates compose recipients", () => {
  const recipients = parseRecipientInput(
    "\"Lovelace, Ada\" <ada@example.com>, team@example.com; Grace Hopper <grace@example.com>\ninvalid"
  );
  const validation = validateRecipients({
    to: recipients,
    cc: [],
    bcc: []
  });

  assert.deepEqual(recipients, [
    { name: "Lovelace, Ada", address: "ada@example.com" },
    { address: "team@example.com" },
    { name: "Grace Hopper", address: "grace@example.com" },
    { address: "invalid" }
  ]);
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.invalidAddresses, ["invalid"]);
  assert.equal(
    validation.message,
    "Correct this recipient address before sending: invalid."
  );
  assert.equal(validateRecipients({ to: [], cc: [], bcc: [] }).isValid, false);
});

test("creates and updates a local draft without sending", async () => {
  const repository = new MemoryRepository();
  repository.snapshot.accountConfigs = [createStoredAccountConfig()];
  const requestLog = [];
  const service = createComposeService({
    metadataRepository: repository,
    secretStorage: new MemorySecretStorage(),
    fetch: createComposeFetchMock(requestLog)
  });

  const draft = await service.createDraft({ accountId: "account:yu" });
  const updatedDraft = await service.updateDraft({
    draftId: draft.id,
    to: [{ address: "ada@example.com" }],
    cc: [],
    bcc: [],
    subject: "Local draft",
    bodyText: "Saved locally"
  });

  assert.equal((await service.listDrafts("account:yu"))[0].bodyText, "Saved locally");
  assert.deepEqual(await service.getDraft(draft.id), updatedDraft);
  assert.equal(requestLog.length, 0);
});

test("constructs reply context from cached message metadata", async () => {
  const repository = new MemoryRepository();
  repository.snapshot.accountConfigs = [createStoredAccountConfig()];
  await repository.saveMessageDetail(createCachedMessageDetail());
  const service = createComposeService({
    metadataRepository: repository,
    secretStorage: new MemorySecretStorage()
  });

  const draft = await service.createReplyDraft({
    accountId: "account:yu",
    providerMessageId: "email-1"
  });

  assert.equal(draft.mode, "reply");
  assert.deepEqual(draft.to, [{ name: "Ada", address: "reply@example.com" }]);
  assert.equal(draft.subject, "Re: Project update");
  assert.equal(draft.relatedMessageId, "account:yu:message:email-1");
  assert.equal(draft.relatedProviderThreadId, "thread-1");
  assert.equal(draft.relatedMessageIdHeader, "message@example.com");
  assert.deepEqual(draft.references, ["root@example.com"]);
});

test("sends only on explicit service call and removes a successful draft", async () => {
  const repository = new MemoryRepository();
  const accountConfig = createStoredAccountConfig();
  repository.snapshot.accountConfigs = [accountConfig];
  const secretStorage = new MemorySecretStorage();
  secretStorage.secrets[accountConfig.credentialReference] = "secure-token";
  const requestLog = [];
  const service = createComposeService({
    metadataRepository: repository,
    secretStorage,
    fetch: createComposeFetchMock(requestLog)
  });
  const draft = await service.createDraft({ accountId: "account:yu" });
  await service.updateDraft({
    draftId: draft.id,
    to: [{ address: "ada@example.com" }],
    cc: [],
    bcc: [],
    subject: "Manual send",
    bodyText: "Send only after click"
  });

  assert.equal(requestLog.length, 0);
  assert.equal(
    JSON.stringify(repository.drafts).includes("secure-token"),
    false
  );
  const result = await service.sendDraft(draft.id);

  assert.equal(result.sent, true);
  assert.equal(result.providerSubmissionId, "submission-1");
  assert.equal(result.submissionId, "submission-1");
  assert.equal(await service.getDraft(draft.id), undefined);
  assert.deepEqual(secretStorage.getReferences, [accountConfig.credentialReference]);
  assert.equal(requestLog.length, 2);
});

test("keeps a local draft when JMAP submission fails", async () => {
  const repository = new MemoryRepository();
  const accountConfig = createStoredAccountConfig();
  repository.snapshot.accountConfigs = [accountConfig];
  const secretStorage = new MemorySecretStorage();
  secretStorage.secrets[accountConfig.credentialReference] = "secure-token";
  const service = createComposeService({
    metadataRepository: repository,
    secretStorage,
    fetch: createComposeFetchMock([], true)
  });
  const draft = await service.createDraft({ accountId: "account:yu" });
  await service.updateDraft({
    draftId: draft.id,
    to: [{ address: "ada@example.com" }],
    cc: [],
    bcc: [],
    subject: "Retry later",
    bodyText: "Keep this draft"
  });

  const result = await service.sendDraft(draft.id);

  assert.equal(result.sent, false);
  assert.equal(result.failed, true);
  assert.equal(result.cleanupAttempted, true);
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.serverDraftMayRemain, false);
  assert.match(result.errorMessage, /Submission rejected/u);
  assert.equal((await service.getDraft(draft.id)).bodyText, "Keep this draft");
  assert.equal(
    JSON.stringify(repository.drafts).includes("secure-token"),
    false
  );
  assert.equal(JSON.stringify(result).includes("secure-token"), false);
});

test("blocks invalid recipients before credential or provider access", async () => {
  const repository = new MemoryRepository();
  const accountConfig = createStoredAccountConfig();
  repository.snapshot.accountConfigs = [accountConfig];
  const secretStorage = new MemorySecretStorage();
  secretStorage.secrets[accountConfig.credentialReference] = "secure-token";
  const requestLog = [];
  const service = createComposeService({
    metadataRepository: repository,
    secretStorage,
    fetch: createComposeFetchMock(requestLog)
  });
  const draft = await service.createDraft({ accountId: "account:yu" });
  await service.updateDraft({
    draftId: draft.id,
    to: [{ address: "invalid" }],
    cc: [],
    bcc: [],
    subject: "Do not send",
    bodyText: "Invalid recipient"
  });

  await assert.rejects(
    service.sendDraft(draft.id),
    (error) => {
      assert.equal(error.code, "invalid_recipients");
      return true;
    }
  );
  assert.deepEqual(secretStorage.getReferences, []);
  assert.equal(requestLog.length, 0);
  assert.notEqual(await service.getDraft(draft.id), undefined);
});

function createStoredAccountConfig() {
  return {
    account: {
      id: "account:yu",
      displayName: "Yu",
      emailAddress: "yu@example.com",
      providerType: "jmap",
      providerConfigReference: "provider-config:yu",
      isDefault: true,
      createdAt: "2026-06-08T12:00:00.000Z",
      updatedAt: "2026-06-08T12:00:00.000Z"
    },
    jmapBaseUrl: "https://mail.example.com",
    credentialReference: "credential:jmap:yu",
    authMode: "bearer",
    jmapAccountId: "accountA"
  };
}

function createCachedMessageDetail() {
  return {
    id: "account:yu:message:email-1",
    accountId: "account:yu",
    providerType: "jmap",
    providerMessageId: "email-1",
    providerThreadId: "thread-1",
    mailboxId: "account:yu:mailbox:inbox-id",
    messageIdHeader: "message@example.com",
    references: ["root@example.com"],
    subject: "Project update",
    from: { name: "Ada", address: "ada@example.com" },
    replyTo: [{ name: "Ada", address: "reply@example.com" }],
    to: [{ address: "yu@example.com" }],
    cc: [],
    bcc: [],
    date: "2026-06-08T10:00:00.000Z",
    snippet: "Update",
    isRead: true,
    isFlagged: false,
    isAnswered: false,
    hasAttachments: false,
    systemTags: [],
    userTags: [],
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z",
    bodyText: "Project update",
    bodyParts: [],
    attachments: []
  };
}
