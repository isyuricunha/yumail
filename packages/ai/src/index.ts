import type { EntityId, IsoDateTime, SystemTag } from "@yumail/shared";
import type { MessageDetail, Recipient, SentMessageSample, ThreadDetail } from "@yumail/mail";

export type AiProviderType = "openai-compatible";
export type AiProviderAuthMode = "bearer" | "none";
export type AiConnectionErrorCategory =
  | "configuration"
  | "network"
  | "authentication"
  | "http"
  | "invalid-response";

export interface AiProviderConfiguration {
  id: EntityId;
  providerType: AiProviderType;
  displayName: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  authMode: AiProviderAuthMode;
  credentialReference: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AiProvider {
  listModels(input: AiProviderConnectionInput): Promise<AiModelListResult>;
  testConnection(input: AiProviderConnectionInput): Promise<AiProviderHealth>;
}

export interface AiProviderHealth {
  ok: boolean;
  checkedAt: IsoDateTime;
  message: string;
  diagnostics: AiConnectionDiagnostics;
}

export interface AiProviderConnectionInput {
  configuration: AiProviderConfiguration;
  apiKey?: string;
}

export interface AiConnectionAttempt {
  method: "GET" | "POST";
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  authSent: boolean;
  isJson?: boolean;
  responseShapeValid?: boolean;
  errorCategory?: AiConnectionErrorCategory;
}

export interface AiConnectionDiagnostics {
  attemptedUrls: AiConnectionAttempt[];
  authMode: AiProviderAuthMode;
  message: string;
  errorCategory?: AiConnectionErrorCategory;
  developerDetails?: string;
}

export interface AiModelListResult {
  ok: boolean;
  models: string[];
  diagnostics: AiConnectionDiagnostics;
}

export interface AiStructuredCompletionInput {
  providerId: EntityId;
  model: string;
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiActionContext {
  accountId: EntityId;
  providerId: EntityId;
  model: string;
  promptVersion: string;
  privacyReviewRequired: boolean;
}

export interface ThreadSummary {
  mainPoint: string;
  currentStatus: string;
  decisions: string[];
  actionItems: string[];
  deadlines: string[];
  peopleInvolved: string[];
  attachmentNotes?: string[];
}

export interface SummarizeThreadInput extends AiActionContext {
  thread: ThreadDetail;
}

export interface SuggestedTag {
  label: SystemTag | string;
  confidence: number;
  reason: string;
  source: "system" | "freeform";
}

export interface SuggestTagsInput extends AiActionContext {
  thread: ThreadDetail;
  allowedSystemTags: readonly SystemTag[];
}

export interface ActionItem {
  description: string;
  owner?: string;
  dueAt?: IsoDateTime;
  sourceMessageId?: EntityId;
}

export interface ExtractActionItemsInput extends AiActionContext {
  thread: ThreadDetail;
}

export interface WritingStyleProfile {
  id: EntityId;
  accountId: EntityId;
  primaryLanguage: string;
  tone: string;
  formality: string;
  greetingPatterns: string[];
  closingPatterns: string[];
  sentenceStyle: string;
  directness: string;
  formattingHabits: string[];
  commonPhrases: string[];
  phrasesToAvoid: string[];
  notes: string[];
  sourceMessageCount: number;
  updatedAt: IsoDateTime;
}

export interface AnalyzeWritingStyleInput extends AiActionContext {
  samples: SentMessageSample[];
}

export interface DraftReplyInput extends AiActionContext {
  thread: ThreadDetail;
  selectedMessage?: MessageDetail;
  writingStyleProfile?: WritingStyleProfile;
  existingDraft?: string;
  contactContext?: string;
  requestedTone?: string;
}

export interface DraftReplyResult {
  bodyText: string;
  addressedRecipients: Recipient[];
  notes: string[];
}

export interface ImproveDraftInput extends AiActionContext {
  draftBody: string;
  requestedChange: "shorten" | "more-direct" | "more-polite" | "firmer" | "translate" | "custom";
  customInstruction?: string;
  targetLanguage?: string;
  writingStyleProfile?: WritingStyleProfile;
}

export interface CheckBeforeSendInput extends AiActionContext {
  draftBody: string;
  thread?: ThreadDetail;
  expectedAttachments?: string[];
}

export interface SendCheckFinding {
  type:
    | "unanswered-question"
    | "tone"
    | "length"
    | "ai-like"
    | "missing-attachment"
    | "sensitive-information"
    | "consistency"
    | "clarity";
  severity: "info" | "warning" | "blocker";
  message: string;
}

export interface CheckBeforeSendResult {
  safeToSend: boolean;
  findings: SendCheckFinding[];
}

export interface AiActions {
  summarizeThread(input: SummarizeThreadInput): Promise<ThreadSummary>;
  suggestTags(input: SuggestTagsInput): Promise<SuggestedTag[]>;
  extractActionItems(input: ExtractActionItemsInput): Promise<ActionItem[]>;
  draftReply(input: DraftReplyInput): Promise<DraftReplyResult>;
  improveDraft(input: ImproveDraftInput): Promise<string>;
  checkBeforeSend(input: CheckBeforeSendInput): Promise<CheckBeforeSendResult>;
  analyzeWritingStyle(input: AnalyzeWritingStyleInput): Promise<WritingStyleProfile>;
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listModels(input: AiProviderConnectionInput): Promise<AiModelListResult> {
    const request = createOpenAiCompatibleRequest(input, "models", "GET");

    if (!request.ok) {
      return {
        ok: false,
        models: [],
        diagnostics: request.diagnostics
      };
    }

    try {
      const response = await this.fetchImpl(request.url, {
        method: "GET",
        headers: request.headers
      });
      const parsedResponse = await readJsonResponse(response);
      const models = readModelIds(parsedResponse.value);
      const responseShapeValid = models !== undefined;
      const attempt = createResponseAttempt("GET", request.url, response, request.authSent, {
        isJson: parsedResponse.isJson,
        responseShapeValid,
        errorCategory: getResponseErrorCategory(response, parsedResponse.isJson, responseShapeValid)
      });

      if (!response.ok || !parsedResponse.isJson || !responseShapeValid) {
        return {
          ok: false,
          models: [],
          diagnostics: createDiagnostics(
            input.configuration.authMode,
            [attempt],
            response.ok
              ? "The endpoint returned an invalid model-list response."
              : createHttpFailureMessage(response.status),
            attempt.errorCategory,
            "Expected an OpenAI-compatible model list with a data array."
          )
        };
      }

      return {
        ok: true,
        models,
        diagnostics: createDiagnostics(
          input.configuration.authMode,
          [attempt],
          `Loaded ${models.length} available model${models.length === 1 ? "" : "s"}.`
        )
      };
    } catch {
      return {
        ok: false,
        models: [],
        diagnostics: createNetworkDiagnostics(
          input.configuration.authMode,
          "GET",
          request.url,
          request.authSent
        )
      };
    }
  }

  async testConnection(input: AiProviderConnectionInput): Promise<AiProviderHealth> {
    const request = createOpenAiCompatibleRequest(input, "chat/completions", "POST");
    const checkedAt = new Date().toISOString();

    if (!request.ok) {
      return {
        ok: false,
        checkedAt,
        message: request.diagnostics.message,
        diagnostics: request.diagnostics
      };
    }

    try {
      const response = await this.fetchImpl(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          model: input.configuration.model,
          messages: [
            {
              role: "user",
              content: "Reply with OK."
            }
          ],
          temperature: 0,
          max_tokens: 1,
          stream: false
        })
      });
      const parsedResponse = await readJsonResponse(response);
      const responseShapeValid = hasChatCompletionShape(parsedResponse.value);
      const attempt = createResponseAttempt("POST", request.url, response, request.authSent, {
        isJson: parsedResponse.isJson,
        responseShapeValid,
        errorCategory: getResponseErrorCategory(response, parsedResponse.isJson, responseShapeValid)
      });
      const message = response.ok && parsedResponse.isJson && responseShapeValid
        ? `Connected with model ${input.configuration.model}.`
        : response.ok
          ? "The endpoint returned an invalid chat-completion response."
          : createHttpFailureMessage(response.status);
      const diagnostics = createDiagnostics(
        input.configuration.authMode,
        [attempt],
        message,
        attempt.errorCategory,
        response.ok && !responseShapeValid
          ? "Expected an OpenAI-compatible response with a choices array."
          : undefined
      );

      return {
        ok: response.ok && parsedResponse.isJson && responseShapeValid,
        checkedAt,
        message,
        diagnostics
      };
    } catch {
      const diagnostics = createNetworkDiagnostics(
        input.configuration.authMode,
        "POST",
        request.url,
        request.authSent
      );

      return {
        ok: false,
        checkedAt,
        message: diagnostics.message,
        diagnostics
      };
    }
  }
}

export function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error("Enter an AI provider base URL.");
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
  const url = new URL(candidate);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("AI provider URLs must use HTTP or HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("AI provider credentials must not be embedded in the URL.");
  }

  if (url.search || url.hash) {
    throw new Error("AI provider base URLs must not include a query string or fragment.");
  }

  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

export function createOpenAiCompatibleEndpointUrl(
  baseUrl: string,
  endpoint: string
): string {
  const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/${endpoint.replace(/^\/+/u, "")}`;
}

export const PROMPT_VERSION_FOUNDATION = "foundation-v0";

interface PreparedRequest {
  ok: true;
  url: string;
  headers: Headers;
  authSent: boolean;
}

interface InvalidPreparedRequest {
  ok: false;
  diagnostics: AiConnectionDiagnostics;
}

function createOpenAiCompatibleRequest(
  input: AiProviderConnectionInput,
  endpoint: string,
  method: "GET" | "POST"
): PreparedRequest | InvalidPreparedRequest {
  let url: string;

  try {
    url = createOpenAiCompatibleEndpointUrl(input.configuration.baseUrl, endpoint);
  } catch {
    return {
      ok: false,
      diagnostics: createDiagnostics(
        input.configuration.authMode,
        [],
        "The AI provider base URL is invalid.",
        "configuration",
        "URL normalization failed before an HTTP request was made."
      )
    };
  }

  const headers = new Headers({
    Accept: "application/json"
  });
  let authSent = false;

  if (method === "POST") {
    headers.set("Content-Type", "application/json");
  }

  if (input.configuration.authMode === "bearer") {
    if (!input.apiKey) {
      return {
        ok: false,
        diagnostics: createDiagnostics(
          input.configuration.authMode,
          [],
          "Enter an API key or save one in secure storage before testing.",
          "configuration",
          "Bearer authentication was selected but no secret was available."
        )
      };
    }

    headers.set("Authorization", `Bearer ${input.apiKey}`);
    authSent = true;
  }

  return {
    ok: true,
    url,
    headers,
    authSent
  };
}

function createResponseAttempt(
  method: "GET" | "POST",
  url: string,
  response: Response,
  authSent: boolean,
  details: Pick<
    AiConnectionAttempt,
    "isJson" | "responseShapeValid" | "errorCategory"
  >
): AiConnectionAttempt {
  return {
    method,
    url,
    finalUrl: (response.headers.get("x-yumail-final-url") ?? response.url) || undefined,
    httpStatus: response.status,
    authSent,
    ...details
  };
}

async function readJsonResponse(
  response: Response
): Promise<{ isJson: boolean; value?: unknown }> {
  try {
    return {
      isJson: true,
      value: await response.json()
    };
  } catch {
    return {
      isJson: false
    };
  }
}

function readModelIds(value: unknown): string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return undefined;
  }

  const models = value.data
    .map((candidate) => (
      isRecord(candidate) && typeof candidate.id === "string"
        ? candidate.id.trim()
        : ""
    ))
    .filter(Boolean);

  return [...new Set(models)].sort((left, right) => left.localeCompare(right));
}

function hasChatCompletionShape(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.choices);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseErrorCategory(
  response: Response,
  isJson: boolean,
  responseShapeValid: boolean
): AiConnectionErrorCategory | undefined {
  if (response.status === 401 || response.status === 403) {
    return "authentication";
  }

  if (!response.ok) {
    return "http";
  }

  if (!isJson || !responseShapeValid) {
    return "invalid-response";
  }

  return undefined;
}

function createHttpFailureMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The AI endpoint rejected the configured credentials.";
  }

  return `The AI endpoint returned HTTP ${status}.`;
}

function createDiagnostics(
  authMode: AiProviderAuthMode,
  attemptedUrls: AiConnectionAttempt[],
  message: string,
  errorCategory?: AiConnectionErrorCategory,
  developerDetails?: string
): AiConnectionDiagnostics {
  return {
    attemptedUrls,
    authMode,
    message,
    ...(errorCategory ? { errorCategory } : {}),
    ...(developerDetails ? { developerDetails } : {})
  };
}

function createNetworkDiagnostics(
  authMode: AiProviderAuthMode,
  method: "GET" | "POST",
  url: string,
  authSent: boolean
): AiConnectionDiagnostics {
  return createDiagnostics(
    authMode,
    [{
      method,
      url,
      authSent,
      errorCategory: "network"
    }],
    "The AI endpoint could not be reached.",
    "network",
    "The HTTP request failed before a response was received."
  );
}
