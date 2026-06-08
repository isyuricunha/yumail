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

  const privacyReview = service.getPrivacyReview(messageDetail);
  const initiallyCached = await service.loadCachedSummary(messageDetail);

  assert.equal(initiallyCached, undefined);
  assert.equal(requests.length, 0);
  assert.equal(secretStorage.getReferences.length, 0);
  assert.match(privacyReview.included.join(" "), /plain-text message body/i);
  assert.match(privacyReview.excluded.join(" "), /attachment contents/i);

  const generated = await service.summarizeThread({ messageDetail });
  const cached = await service.loadCachedSummary(messageDetail);
  const reused = await service.summarizeThread({ messageDetail });

  assert.equal(generated.source, "provider");
  assert.equal(generated.summary.mainPoint, "The launch is approved.");
  assert.equal(generated.record.promptId, "summarize-thread");
  assert.equal(generated.record.promptVersion, "1.0.0");
  assert.equal(generated.record.inputHash.length, 64);
  assert.match(generated.record.summaryText, /Action items:/);
  assert.equal(cached.source, "cache");
  assert.equal(reused.source, "cache");
  assert.equal(requests.length, 1);
  assert.deepEqual(secretStorage.getReferences, ["credential:ai:default"]);
  assert.equal(requests[0].authorization, "Bearer summary-secret");
  assert.equal(JSON.stringify(summaryRepository.records).includes("summary-secret"), false);
  assert.equal(JSON.stringify(summaryRepository.records).includes(messageDetail.bodyHtml), false);
  assert.equal(JSON.stringify(requests[0].body).includes(messageDetail.bodyHtml), false);
  assert.equal(JSON.stringify(requests[0].body).includes("provider-blob"), false);
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

  await service.summarizeThread({ messageDetail });
  const regenerated = await service.summarizeThread({
    messageDetail,
    forceRefresh: true
  });

  assert.equal(regenerated.source, "provider");
  assert.equal(requests.length, 2);
  assert.equal(summaryRepository.records.length, 1);
});

test("returns a safe configuration error when no default provider exists", async () => {
  const service = createThreadSummaryService({
    providerRepository: new MemoryAiProviderRepository(undefined),
    summaryRepository: new MemoryAiSummaryRepository(),
    secretStorage: new MemorySecretStorage("unused"),
    fetch: createSummaryFetch([])
  });

  await assert.rejects(
    () => service.summarizeThread({ messageDetail }),
    /Configure a default AI provider/
  );
});
