// Pro-tier Gemini models require billing — the shared GEMINI_API_KEY (used
// by every shop that hasn't set their own Pro-plan key) sits on Google's
// free tier, which has zero request/token quota for pro-tier models. This
// was discovered in production: a shop had "Gemini 3.1 Pro" selected and
// every chat request failed with a 429 ("Quota exceeded ... limit: 0,
// model: gemini-3.1-pro"). Only honor a merchant's higher-tier model choice
// when they've supplied their own API key — that's the only case where a
// paid quota might actually exist — otherwise force the flash-tier model
// that's confirmed to work on the shared key's free tier.
const FREE_TIER_SAFE_MODEL = "gemini-2.5-flash";

export function resolveGeminiModel(
  requestedModel: string,
  hasOwnApiKey: boolean,
) {
  return hasOwnApiKey ? requestedModel : FREE_TIER_SAFE_MODEL;
}
