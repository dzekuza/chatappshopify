// Which Gemini model a shop's chats actually run on.
//
// Two independent hazards, both confirmed live against the shared key on
// 2026-09-04, and both of which used to surface as a dead assistant with no
// explanation:
//
//   1. Google retires models for new API users. `gemini-2.5-flash` — until
//      now this file's "safe" fallback and the column default — answers
//      404 "no longer available to new users", so every shop still holding
//      that value 404s on every message. (`gemini-2.5-pro` went the same way
//      on 2026-08-24; see ai-model-section.tsx.)
//   2. Pro-tier models require billing. The shared GEMINI_API_KEY sits on
//      Google's free tier, which has a *zero* quota for them —
//      `gemini-3.1-pro-preview` answers 429 "You exceeded your current
//      quota". Only a merchant's own key can have a paid quota behind it.
//
// So: rewrite retired model ids for everyone, and hold shops on the shared
// key to the models that are known to work on the free tier.

// Latest flash-lite — the cheapest model that still generates. Verified.
const FREE_TIER_DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Verified to return a completion on the shared free-tier key. A model not
// in here isn't necessarily broken — it just isn't proven free-tier-safe, so
// a shop without its own key doesn't get to gamble on it.
const FREE_TIER_SAFE_MODELS = new Set([
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
]);

// Retired ids mapped to Google's own recommended replacement. Applied to
// every shop, own key or not — a retired model is a hard 404 regardless of
// who's paying. This is deliberately done at read time rather than as a data
// migration, so a shop whose settings were written before a deprecation
// keeps working without anyone having to remember to backfill the column.
const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "gemini-2.5-flash": FREE_TIER_DEFAULT_MODEL,
  "gemini-2.5-flash-lite": FREE_TIER_DEFAULT_MODEL,
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
};

export { FREE_TIER_DEFAULT_MODEL };

export function resolveGeminiModel(
  requestedModel: string,
  hasOwnApiKey: boolean,
) {
  const model = RETIRED_MODEL_REPLACEMENTS[requestedModel] ?? requestedModel;
  if (hasOwnApiKey) return model;
  return FREE_TIER_SAFE_MODELS.has(model) ? model : FREE_TIER_DEFAULT_MODEL;
}
