import assert from "node:assert/strict";
import test from "node:test";
import { createMailAccountService } from "../dist/index.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createFetchMock() {
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
                keywords: {}
              }
            ]
          },
          "emails"
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

  async saveSyncState(syncState) {
    this.snapshot.syncStates = [
      syncState,
      ...this.snapshot.syncStates.filter((candidate) => candidate.id !== syncState.id)
    ];
  }
}

class MemorySecretStorage {
  secrets = {};

  async getSecret(reference) {
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
