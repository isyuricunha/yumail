import type { EntityId, IsoDateTime, SystemTag } from "@yumail/shared";
import type { MessageDetail, Recipient, SentMessageSample, ThreadDetail } from "@yumail/mail";

export interface AiProviderConfiguration {
  id: EntityId;
  name: string;
  baseUrl: string;
  apiKeyReference: string;
  defaultUtilityModel: string;
  defaultDraftingModel: string;
  temperature?: number;
  maxTokens?: number;
  headersReference?: string;
}

export interface AiProvider {
  testConnection(configuration: AiProviderConfiguration): Promise<AiProviderHealth>;
  completeStructured<TOutput>(input: AiStructuredCompletionInput): Promise<TOutput>;
}

export interface AiProviderHealth {
  ok: boolean;
  checkedAt: IsoDateTime;
  message?: string;
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

export const PROMPT_VERSION_FOUNDATION = "foundation-v0";
