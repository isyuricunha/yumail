import assert from "node:assert/strict";
import test from "node:test";
import { createThreadSummaryService } from "../dist/index.js";

class MemoryAiProviderRepository {
  constructor(configuration) {
    this.configuration = configuration;
  }

  async listAiProviders() {
    return this.configuration ? [this.configuration] : [];
  }

  async getDefaultAiProvider() {
    return this.configuration;
  }

  async saveAiProvider(configuration) {
    this.configuration = configuration;
  }
}

class MemoryAiSummaryRepository {
  records = [];

  async getCachedSummary(cacheKey) {
    return this.records.find((record) => (
      record.accountId === cacheKey.accountId
      && record.messageId === cacheKey.messageId
      && record.providerId === cacheKey.providerId
      && record.model === cacheKey.model
      && record.promptId === cacheKey.promptId
      && record.promptVersion === cacheKey.promptVersion
      && record.inputHash === cacheKey.inputHash
    ));
  }

  async saveSummary(record) {
    this.records = [
      record,
      ...this.records.filter((candidate) => candidate.id !== record.id)
    ];
  }

  async deleteSummariesForContext(input) {
    const previousCount = this.records.length;
    this.records = this.records.filter((record) => (
      record.accountId !== input.accountId
      || (input.threadId
        ? record.threadId !== input.threadId
        : record.messageId !== input.messageId)
    ));
    return previousCount - this.records.length;
  }

  async deleteSummariesForAccount(accountId) {
    const previousCount = this.records.length;
    this.records = this.records.filter((record) => record.accountId !== accountId);
    return previousCount - this.records.length;
  }
}

class MemorySecretStorage {
  getReferences = [];

  constructor(secret) {
    this.secret = secret;
  }

  async getSecret(reference) {
    this.getReferences.push(reference);
    return this.secret;
  }

  async setSecret() {}

  async deleteSecret() {}
}

const configuration = {
  id: "ai-provider:default",
  providerType: "openai-compatible",
  displayName: "Private AI",
  baseUrl: "https://ai.example.com/v1",
  model: "summary-model",
  temperature: 0.2,
  maxTokens: 700,
  authMode: "bearer",
  credentialReference: "credential:ai:default",
  enabled: true,
  isDefault: true,
  createdAt: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-08T12:00:00.000Z"
};

const messageDetail = {
  id: "message:1",
  accountId: "account:1",
  providerType: "jmap",
  providerMessageId: "provider-message-1",
  providerThreadId: "provider-thread-1",
  mailboxId: "mailbox:inbox",
  subject: "Launch plan",
  from: { name: "Ada", address: "ada@example.com" },
  to: [{ address: "yu@example.com" }],
  cc: [],
  bcc: [],
  date: "2026-06-08T12:00:00.000Z",
  snippet: "Launch on Friday",
  isRead: true,
  isFlagged: false,
  isAnswered: false,
  hasAttachments: true,
  systemTags: [],
  userTags: [],
  createdAt: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-08T12:00:00.000Z",
  bodyText: "The launch is approved for Friday. Yu will publish the checklist.",
  bodyHtml: "<p>Hidden HTML must not be sent.</p>",
  bodyParts: [],
  attachments: [{
    id: "attachment:1",
    messageId: "message:1",
    providerAttachmentId: "provider-blob",
    filename: "checklist.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096
  }]
};

const singleMessageContext = {
  threadDetail: {
    id: messageDetail.id,
    accountId: messageDetail.accountId,
    providerThreadId: messageDetail.providerThreadId,
    subject: messageDetail.subject,
    participants: [messageDetail.from, ...messageDetail.to],
    messageCount: 1,
    latestMessageAt: messageDetail.date,
    isUnread: false,
    createdAt: messageDetail.createdAt,
    updatedAt: messageDetail.updatedAt,
    messages: [messageDetail]
  },
  selectedMessageId: messageDetail.id,
  source: "single-message"
};

const earlierMessage = {
  ...messageDetail,
  id: "message:0",
  providerMessageId: "provider-message-0",
  subject: "Launch proposal",
  date: "2026-06-08T10:00:00.000Z",
  bodyText: "Ada proposed a Friday launch at https://tracker.example/launch.",
  bodyHtml: "<img src=\"https://tracker.example/earlier\">",
  bcc: [{ address: "hidden@example.com" }],
  attachments: [{
    ...messageDetail.attachments[0],
    id: "attachment:0",
    messageId: "message:0",
    providerAttachmentId: "private-earlier-blob"
  }]
};

const threadContext = {
  threadDetail: {
    id: "thread:1",
    accountId: messageDetail.accountId,
    providerThreadId: messageDetail.providerThreadId,
    subject: messageDetail.subject,
    participants: [earlierMessage.from, messageDetail.from],
    messageCount: 2,
    latestMessageAt: messageDetail.date,
    isUnread: false,
    createdAt: earlierMessage.createdAt,
    updatedAt: messageDetail.updatedAt,
    messages: [messageDetail, earlierMessage]
  },
  selectedMessageId: messageDetail.id,
  source: "provider"
};

function createSummaryFetch(requests) {
  return async (url, init) => {
    requests.push({
      url: String(url),
      authorization: new Headers(init?.headers).get("Authorization"),
      body: JSON.parse(String(init?.body))
    });

    return new Response(JSON.stringify({
      id: "chatcmpl-summary",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            mainPoint: "The launch is approved.",
            currentStatus: "Scheduled for Friday.",
            decisions: ["Launch Friday."],
            actionItems: ["Yu will publish the checklist."],
            deadlines: ["Friday"],
            peopleInvolved: ["Ada", "Yu"],
            attachmentNotes: ["checklist.pdf metadata was provided."]
          })
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
}

test("summarizes only after an explicit service call and reuses the cached result", async () => {
  const requests = [];
  const summaryRepository = new MemoryAiSummaryRepository();
  const secretStorage = new MemorySecretStorage("summary-secret");
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(configuration),
    summaryRepository,
    secretStorage,
    fetch: createSummaryFetch(requests)
  });

  const privacyReview = service.getPrivacyReview(threadContext);
  const initiallyCached = await service.loadCachedSummary(threadContext);

  assert.equal(initiallyCached, undefined);
  assert.equal(requests.length, 0);
  assert.equal(secretStorage.getReferences.length, 0);
  assert.equal(privacyReview.messageCount, 2);
  assert.match(privacyReview.included.join(" "), /chronological order/i);
  assert.match(privacyReview.excluded.join(" "), /attachment contents/i);

  const generated = await service.summarizeThread({ context: threadContext });
  const cached = await service.loadCachedSummary(threadContext);
  const reused = await service.summarizeThread({ context: threadContext });

  assert.equal(generated.source, "provider");
  assert.equal(generated.summary.mainPoint, "The launch is approved.");
  assert.equal(generated.record.promptId, "summarize-thread");
  assert.equal(generated.record.promptVersion, "2.0.0");
  assert.equal(generated.record.threadId, "thread:1");
  assert.equal(generated.record.messageId, undefined);
  assert.equal(generated.messageCount, 2);
  assert.equal(generated.record.inputHash.length, 64);
  assert.match(generated.record.summaryText, /Action items:/);
  assert.equal(cached.source, "cache");
  assert.equal(reused.source, "cache");
  assert.equal(requests.length, 1);
  assert.deepEqual(secretStorage.getReferences, ["credential:ai:default"]);
  assert.equal(requests[0].authorization, "Bearer summary-secret");
  assert.equal(JSON.stringify(summaryRepository.records).includes("summary-secret"), false);
  assert.equal(JSON.stringify(summaryRepository.records).includes(messageDetail.bodyHtml), false);
  assert.equal(JSON.stringify(requests[0].body).includes(earlierMessage.bodyHtml), false);
  assert.equal(JSON.stringify(requests[0].body).includes("tracker.example"), false);
  assert.equal(JSON.stringify(requests[0].body).includes("hidden@example.com"), false);
  assert.equal(JSON.stringify(requests[0].body).includes(messageDetail.bodyHtml), false);
  assert.equal(JSON.stringify(requests[0].body).includes("provider-blob"), false);
  assert.equal(JSON.stringify(requests[0].body).includes("private-earlier-blob"), false);
  const promptPayload = JSON.parse(requests[0].body.messages[1].content);
  assert.equal(promptPayload.messageCount, 2);
  assert.deepEqual(
    promptPayload.messages.map((message) => message.subject),
    ["Launch proposal", "Launch plan"]
  );
  assert.equal(JSON.stringify(generated).includes("summary-secret"), false);
  assert.equal(JSON.stringify(generated).includes(messageDetail.bodyText), false);
});

test("regeneration bypasses cache but does not create duplicate cache records", async () => {
  const requests = [];
  const summaryRepository = new MemoryAiSummaryRepository();
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(configuration),
    summaryRepository,
    secretStorage: new MemorySecretStorage("summary-secret"),
    fetch: createSummaryFetch(requests)
  });

  await service.summarizeThread({ context: threadContext });
  const regenerated = await service.summarizeThread({
    context: threadContext,
    forceRefresh: true
  });

  assert.equal(regenerated.source, "provider");
  assert.equal(requests.length, 2);
  assert.equal(summaryRepository.records.length, 1);
});

test("falls back to a message-scoped cache and changes the hash when thread content changes", async () => {
  const requests = [];
  const summaryRepository = new MemoryAiSummaryRepository();
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(configuration),
    summaryRepository,
    secretStorage: new MemorySecretStorage("summary-secret"),
    fetch: createSummaryFetch(requests)
  });

  const singleResult = await service.summarizeThread({
    context: singleMessageContext
  });
  const changedContext = {
    ...threadContext,
    threadDetail: {
      ...threadContext.threadDetail,
      messages: [
        earlierMessage,
        {
          ...messageDetail,
          bodyText: `${messageDetail.bodyText} Updated after approval.`
        }
      ]
    }
  };
  const originalThreadResult = await service.summarizeThread({
    context: threadContext
  });
  const changedThreadResult = await service.summarizeThread({
    context: changedContext
  });

  assert.equal(singleResult.record.messageId, messageDetail.id);
  assert.equal(singleResult.record.threadId, undefined);
  assert.notEqual(
    originalThreadResult.record.inputHash,
    changedThreadResult.record.inputHash
  );
  assert.equal(requests.length, 3);
});

test("deletes the current summary cache and all account summaries", async () => {
  const requests = [];
  const summaryRepository = new MemoryAiSummaryRepository();
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(configuration),
    summaryRepository,
    secretStorage: new MemorySecretStorage("summary-secret"),
    fetch: createSummaryFetch(requests)
  });

  await service.summarizeThread({ context: threadContext });
  await service.summarizeThread({ context: singleMessageContext });

  assert.equal(summaryRepository.records.length, 2);
  assert.equal(await service.deleteCachedSummary(threadContext), 1);
  assert.equal(summaryRepository.records.length, 1);
  assert.equal(
    await service.clearAccountSummaries(messageDetail.accountId),
    1
  );
  assert.equal(summaryRepository.records.length, 0);
});

test("returns a safe configuration error when no default provider exists", async () => {
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(undefined),
    summaryRepository: new MemoryAiSummaryRepository(),
    secretStorage: new MemorySecretStorage("unused"),
    fetch: createSummaryFetch([])
  });

  await assert.rejects(
    () => service.summarizeThread({ context: singleMessageContext }),
    /Configure a default AI provider/
  );
});
