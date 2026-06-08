import assert from "node:assert/strict";
import test from "node:test";
import { createAiProviderSettingsService } from "../dist/index.js";

class MemoryAiProviderRepository {
  providers = [];

  async listAiProviders() {
    return this.providers;
  }

  async getDefaultAiProvider() {
    return this.providers.find((provider) => provider.isDefault) ?? this.providers[0];
  }

  async saveAiProvider(configuration) {
    this.providers = [
      configuration,
      ...this.providers.filter((provider) => provider.id !== configuration.id)
    ];
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

function createFetchMock(requests) {
  return async (url, init) => {
    requests.push({
      url: String(url),
      method: init?.method,
      authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });

    if (init?.method === "GET") {
      return new Response(JSON.stringify({
        object: "list",
        data: [
          { id: "utility-model", object: "model" },
          { id: "drafting-model", object: "model" }
        ]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      id: "chatcmpl-test",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "OK" }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
}

const setupInput = {
  displayName: "Private AI",
  baseUrl: "https://ai.example.com/v1/",
  apiKey: "core-secret",
  model: "utility-model",
  temperature: 0.2,
  maxTokens: 1024,
  authMode: "bearer",
  enabled: true
};

test("saves AI provider metadata with only a secure credential reference", async () => {
  const providerRepository = new MemoryAiProviderRepository();
  const secretStorage = new MemorySecretStorage();
  const service = createAiProviderSettingsService({
    providerRepository,
    secretStorage,
    fetch: createFetchMock([])
  });
  const state = await service.saveProvider(setupInput);
  const serializedMetadata = JSON.stringify(providerRepository.providers);

  assert.equal(state.configuration.baseUrl, "https://ai.example.com/v1");
  assert.equal(state.configuration.model, "utility-model");
  assert.equal(state.configuration.isDefault, true);
  assert.equal(serializedMetadata.includes("core-secret"), false);
  assert.equal(
    secretStorage.secrets[state.configuration.credentialReference],
    "core-secret"
  );
});

test("reloads the API key by credential reference and tests models plus completion", async () => {
  const providerRepository = new MemoryAiProviderRepository();
  const secretStorage = new MemorySecretStorage();
  const requests = [];
  const service = createAiProviderSettingsService({
    providerRepository,
    secretStorage,
    fetch: createFetchMock(requests)
  });
  const savedState = await service.saveProvider(setupInput);
  const result = await service.testConnection({
    ...setupInput,
    providerId: savedState.configuration.id,
    apiKey: ""
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.availableModels, ["drafting-model", "utility-model"]);
  assert.deepEqual(secretStorage.getReferences, [
    savedState.configuration.credentialReference
  ]);
  assert.equal(requests.length, 2);
  assert.equal(requests.every((request) => request.authorization === "Bearer core-secret"), true);
  assert.equal(
    requests.some((request) => request.url.endsWith("/models")),
    true
  );
  assert.equal(
    requests.some((request) => request.url.endsWith("/chat/completions")),
    true
  );
  assert.equal(JSON.stringify(result).includes("core-secret"), false);
});
