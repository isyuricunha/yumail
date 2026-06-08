import type { EntityId } from "@yumail/shared";
import type { Message } from "@yumail/mail";

export interface SearchQuery {
  accountId: EntityId;
  term: string;
  mailboxIds?: EntityId[];
  limit: number;
}

export interface SearchResult {
  message: Message;
  highlights: string[];
  score: number;
}

export interface SearchService {
  searchMessages(query: SearchQuery): Promise<SearchResult[]>;
}
