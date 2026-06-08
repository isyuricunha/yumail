import assert from "node:assert/strict";
import test from "node:test";
import {
  createMailAccountService,
  createThreadReadingService
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
        accounts: {
          accountA: {
            accountCapabilities: {
              "urn:ietf:params:jmap:mail": {}
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

class MemoryRepository {
  snapshot = {
    accountConfigs: [],
    mailboxesByAccountId: {},
    messagesByMailboxId: {},
    messageDetailsByCacheKey: {},
    syncStates: []
  };

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
    authSecret: "Bearer super-secret"
  });
  const serializedMetadata = JSON.stringify(await repository.loadSnapshot());

  assert.equal(state.accountConfig?.account.emailAddress, "yu@example.com");
  assert.equal(state.mailboxes[0].role, "inbox");
  assert.equal(state.inboxMessages[0].subject, "Persist me");
  assert.equal(serializedMetadata.includes("super-secret"), false);
  assert.equal(Object.values(secretStorage.secrets).includes("Bearer super-secret"), true);
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
    authSecret: "Bearer super-secret"
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
    authSecret: "Bearer super-secret"
  });

  const result = await service.testJmapConnection({
    displayName: "Yu",
    emailAddress: "yu@example.com",
    jmapBaseUrl: "https://mail.example.com",
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
    authSecret: "Bearer super-secret"
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
