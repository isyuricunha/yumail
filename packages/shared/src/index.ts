export type EntityId = string;
export type IsoDateTime = string;
export type EmailAddress = string;

export type ProviderType =
  | "jmap"
  | "imap-smtp"
  | "gmail"
  | "outlook";

export interface TimestampedEntity {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ResultPage {
  limit: number;
  offset?: number;
  cursor?: string;
}

export interface PagedResult<TItem> {
  items: TItem[];
  nextCursor?: string;
  total?: number;
}

export interface OperationErrorDetails {
  code: string;
  message: string;
  cause?: unknown;
}

export class YuMailError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(details: OperationErrorDetails) {
    super(details.message);
    this.name = "YuMailError";
    this.code = details.code;
    this.cause = details.cause;
  }
}

export class UnsupportedProviderOperationError extends YuMailError {
  constructor(operation: string) {
    super({
      code: "unsupported_provider_operation",
      message: `${operation} is not implemented for this provider yet.`
    });
  }
}

export const SYSTEM_TAGS = [
  "needs-reply",
  "important",
  "invoice",
  "receipt",
  "security",
  "newsletter",
  "personal",
  "work",
  "meeting",
  "travel",
  "github",
  "support",
  "waiting-for-me",
  "waiting-for-them"
] as const;

export type SystemTag = (typeof SYSTEM_TAGS)[number];

export function createStableEntityId(prefix: string, parts: readonly string[]): EntityId {
  const normalizedParts = parts
    .map((part) => encodeURIComponent(part.trim().toLowerCase()))
    .filter(Boolean);

  return `${prefix}:${normalizedParts.join(":")}`;
}

export function toIsoDateTime(date = new Date()): IsoDateTime {
  return date.toISOString();
}
