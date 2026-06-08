import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenAiCompatibleProvider,
  createOpenAiCompatibleEndpointUrl,
  normalizeOpenAiCompatibleBaseUrl
} from "../dist/index.js";

const configuration = {
  id: "ai-provider:default",
  providerType: "openai-compatible",
  displayName: "Custom AI",
  baseUrl: "https://ai.example.com/v1/",
  model: "test-model",
  temperature: 0.3,
  maxTokens: 512,
  authMode: "bearer",
  credentialReference: "credential:ai:default",
  enabled: true,
  isDefault: true,
  createdAt: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-08T12:00:00.000Z"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-yumail-final-url": "https://ai.example.com/v1/final"
    }
  });
}

test("normalizes OpenAI-compatible base URLs without rewriting API paths", () => {
  assert.equal(
    normalizeOpenAiCompatibleBaseUrl(" ai.example.com/v1/ "),
    "https://ai.example.com/v1"
  );
  assert.equal(
    normalizeOpenAiCompatibleBaseUrl("http://localhost:11434/v1///"),
    "http://localhost:11434/v1"
  );
  assert.equal(
    createOpenAiCompatibleEndpointUrl("https://proxy.example.com/custom/v1/", "/models"),
    "https://proxy.example.com/custom/v1/models"
  );
});

test("lists models with Bearer authentication", async () => {
  const requests = [];
  const provider = new OpenAiCompatibleProvider(async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      object: "list",
      data: [
        { id: "model-b", object: "model" },
        { id: "model-a", object: "model" }
      ]
    });
  });
  const result = await provider.listModels({
    configuration,
    apiKey: "top-secret"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ["model-a", "model-b"]);
  assert.equal(requests[0].url, "https://ai.example.com/v1/models");
  assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer top-secret");
  assert.equal(JSON.stringify(result).includes("top-secret"), false);
});

test("constructs a minimal OpenAI-compatible chat completion test request", async () => {
  const requests = [];
  const provider = new OpenAiCompatibleProvider(async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      id: "chatcmpl-test",
      object: "chat.completion",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "OK"
        }
      }]
    });
  });
  const result = await provider.testConnection({
    configuration,
    apiKey: "top-secret"
  });
  const requestBody = JSON.parse(String(requests[0].init.body));

  assert.equal(result.ok, true);
  assert.equal(requests[0].url, "https://ai.example.com/v1/chat/completions");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer top-secret");
  assert.deepEqual(requestBody, {
    model: "test-model",
    messages: [{ role: "user", content: "Reply with OK." }],
    temperature: 0,
    max_tokens: 1,
    stream: false
  });
  assert.equal(JSON.stringify(result).includes("top-secret"), false);
});

test("normalizes authentication and invalid response failures without secret leakage", async () => {
  const apiKey = "must-never-appear";
  const authenticationProvider = new OpenAiCompatibleProvider(async () => (
    jsonResponse({ error: { message: `Rejected ${apiKey}` } }, 401)
  ));
  const invalidResponseProvider = new OpenAiCompatibleProvider(async () => (
    new Response("not-json", { status: 200 })
  ));

  const authenticationResult = await authenticationProvider.testConnection({
    configuration,
    apiKey
  });
  const invalidResponseResult = await invalidResponseProvider.listModels({
    configuration,
    apiKey
  });

  assert.equal(authenticationResult.ok, false);
  assert.equal(authenticationResult.diagnostics.errorCategory, "authentication");
  assert.equal(authenticationResult.message, "The AI endpoint rejected the configured credentials.");
  assert.equal(invalidResponseResult.ok, false);
  assert.equal(invalidResponseResult.diagnostics.errorCategory, "invalid-response");
  assert.equal(JSON.stringify(authenticationResult).includes(apiKey), false);
  assert.equal(JSON.stringify(invalidResponseResult).includes(apiKey), false);
});

test("returns safe network diagnostics when the endpoint cannot be reached", async () => {
  const apiKey = "network-secret";
  const provider = new OpenAiCompatibleProvider(async () => {
    throw new Error(`Network failure with ${apiKey}`);
  });
  const result = await provider.testConnection({
    configuration,
    apiKey
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.errorCategory, "network");
  assert.equal(result.diagnostics.attemptedUrls[0].authSent, true);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});
