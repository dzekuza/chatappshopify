// Cheap heuristic for deciding whether a shopper's question was already
// covered by one of the merchant's freeform KnowledgeEntry (FAQ) rows, used
// to populate KnowledgeQuery.matched for the "top unanswered questions"
// panel. Deliberately not ML/embeddings-based and not a second model call —
// a token-overlap heuristic is good enough for gap-finding, and keeps this
// synchronous and free of extra latency/cost per message.

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
  "i", "you", "your", "my", "me", "it", "its", "this", "that", "to",
  "of", "for", "on", "in", "at", "and", "or", "can", "will", "how",
  "what", "when", "where", "why", "who", "with", "have", "has", "be",
]);

const MATCH_THRESHOLD = 0.5;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) {
    if (b.has(word)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

type KnowledgeEntryForMatching = { id: string; type: string; question: string | null };

export function matchKnowledgeEntry(
  question: string,
  entries: KnowledgeEntryForMatching[],
): { matched: boolean; matchedEntryId: string | null } {
  const questionTokens = tokenize(question);
  if (questionTokens.size === 0) return { matched: false, matchedEntryId: null };

  let best: { id: string; score: number } | null = null;
  for (const entry of entries) {
    if (entry.type === "product" || !entry.question) continue;
    const score = overlapRatio(questionTokens, tokenize(entry.question));
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { id: entry.id, score };
    }
  }

  return best
    ? { matched: true, matchedEntryId: best.id }
    : { matched: false, matchedEntryId: null };
}
