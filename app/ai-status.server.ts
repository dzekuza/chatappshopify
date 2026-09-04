import prisma from "./db.server";

// Turns a thrown Gemini error into something a merchant can act on.
//
// Before this existed, an exhausted or invalid API key was silent in both
// directions: `streamText` threw, the response stream died mid-flight, the
// shopper got "Sorry, something went wrong", and nothing anywhere told the
// merchant their assistant had stopped answering. It read as an app bug. See
// gemini-model.server.ts for the incident — a shop on the shared free-tier
// key whose every request came back 429 "Quota exceeded ... limit: 0".

export type AiErrorKind = "quota" | "auth" | "billing" | "model" | "unknown";

// Shown to the *shopper* when the model call fails. Deliberately blames
// nothing the shopper controls — "check your connection" would be a lie — and
// points them somewhere useful instead.
export const AI_UNAVAILABLE_MESSAGE =
  "Sorry — the assistant is temporarily unavailable right now. Please contact the store directly and someone will help you.";

function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause) parts.push(errorText(error.cause));
  }
  const record = error as Record<string, unknown>;
  for (const key of ["statusCode", "status", "responseBody", "reason"]) {
    const value = record?.[key];
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
    }
  }
  return parts.join(" ");
}

export function classifyAiError(error: unknown): AiErrorKind {
  const text = errorText(error);

  // Billing is checked before quota: Google's billing-disabled response also
  // mentions a quota of 0, and "enable billing" is the more actionable of the
  // two messages.
  if (/billing|BILLING_DISABLED|payment required/i.test(text)) return "billing";
  if (/\b429\b|quota|RESOURCE_EXHAUSTED|rate limit|too many requests/i.test(text)) {
    return "quota";
  }
  if (
    /\b40[13]\b|API[_ ]key not valid|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|unauthorized/i.test(
      text,
    )
  ) {
    return "auth";
  }
  // Google retires models for new API users, which turns a previously fine
  // saved setting into a hard 404. Distinguished from "unknown" because the
  // merchant can't fix it from their side — it needs a code change here.
  if (/no longer available|NOT_FOUND|is not found for API version/i.test(text)) {
    return "model";
  }
  return "unknown";
}

/**
 * Records that the model call failed. Fire-and-forget at every call site — a
 * failure to write the health flag must never turn a degraded chat into a
 * broken one.
 */
export async function recordAiFailure(
  shop: string,
  error: unknown,
  usedOwnKey: boolean,
): Promise<AiErrorKind> {
  const lastErrorKind = classifyAiError(error);
  const data = { lastErrorKind, lastErrorAt: new Date(), usedOwnKey };
  await prisma.aiStatus.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  return lastErrorKind;
}

/**
 * Clears a previously recorded failure once the assistant answers again.
 *
 * `updateMany` with a "currently failing" filter rather than an upsert on
 * purpose: the healthy path runs on every single chat message, and it should
 * not write a row (or contend on one) just to restate that nothing is wrong.
 */
export async function recordAiSuccess(shop: string): Promise<void> {
  await prisma.aiStatus.updateMany({
    where: { shop, lastErrorKind: { not: null } },
    data: { lastErrorKind: null, lastErrorAt: null, lastSuccessAt: new Date() },
  });
}

export type AiHealth = {
  ok: boolean;
  kind: AiErrorKind | null;
  lastErrorAt: Date | null;
  usedOwnKey: boolean;
  /** Merchant-facing explanation of what broke and who fixes it. */
  heading: string | null;
  detail: string | null;
};

const HEALTHY: AiHealth = {
  ok: true,
  kind: null,
  lastErrorAt: null,
  usedOwnKey: false,
  heading: null,
  detail: null,
};

function explain(kind: AiErrorKind, usedOwnKey: boolean) {
  if (kind === "quota") {
    return {
      heading: "AI usage limit reached",
      detail: usedOwnKey
        ? "Your own Gemini API key has hit its quota with Google. Chats will start working again once the quota resets, or once you raise the limit in Google AI Studio."
        : "The shared AI key this app provides has hit its usage limit, so your assistant has stopped answering shoppers. Upgrade to the Pro plan and add your own Gemini API key to run on your own quota.",
    };
  }
  if (kind === "auth") {
    return {
      heading: "AI key rejected",
      detail: usedOwnKey
        ? "Google rejected the Gemini API key saved in your settings. Check that it's still valid and paste it in again."
        : "The shared AI key this app provides was rejected by Google. This one's on us — please get in touch so we can fix it.",
    };
  }
  if (kind === "billing") {
    return {
      heading: "AI billing problem",
      detail: usedOwnKey
        ? "Google reports a billing problem on the account behind your Gemini API key. Check billing is enabled for that project in Google AI Studio."
        : "There's a billing problem on the shared AI key this app provides. This one's on us — please get in touch so we can fix it.",
    };
  }
  if (kind === "model") {
    return {
      heading: "The assistant needs an update",
      detail:
        "Google has retired the AI model this store was set to use, so chats are failing. Pick a different model under Settings → AI model, or get in touch and we'll sort it out.",
    };
  }
  return {
    heading: "The assistant stopped answering",
    detail:
      "The last chat request to the AI failed for an unknown reason. If shoppers are still getting no reply, please get in touch.",
  };
}

export async function getAiHealth(shop: string): Promise<AiHealth> {
  const status = await prisma.aiStatus.findUnique({ where: { shop } });
  if (!status?.lastErrorKind) return HEALTHY;

  const kind = status.lastErrorKind as AiErrorKind;
  return {
    ok: false,
    kind,
    lastErrorAt: status.lastErrorAt,
    usedOwnKey: status.usedOwnKey,
    ...explain(kind, status.usedOwnKey),
  };
}
