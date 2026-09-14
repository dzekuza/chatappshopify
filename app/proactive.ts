// Proactive in-widget messages.
//
// Rules are evaluated entirely client-side by the storefront widget from
// signals already on the page — dwell time, exit intent, scroll depth, return
// visits, cart state. Nothing here talks to Shopify, so the feature needs no
// extra access scopes, no webhooks and no scheduler.
//
// They're stored as JSON on WidgetSettings (see schema.prisma) and shipped to
// the storefront by apps.chat-widget.settings.tsx.

export const PROACTIVE_TRIGGER_TYPES = [
  "time_on_page",
  "exit_intent",
  "scroll_depth",
  "return_visit",
  "cart_value",
  "cart_idle",
] as const;
export type ProactiveTriggerType = (typeof PROACTIVE_TRIGGER_TYPES)[number];

// `/cart.js` is an Online Store endpoint. A Hydrogen/custom storefront (see
// headless-embed.server.ts) has no equivalent the widget can read, so these
// two triggers can never fire there — the admin UI disables them rather than
// offering a rule that silently does nothing.
export const ONLINE_STORE_ONLY_TRIGGERS: readonly ProactiveTriggerType[] = [
  "cart_value",
  "cart_idle",
];

export const PROACTIVE_PAGE_SCOPES = [
  "any",
  "home",
  "product",
  "collection",
  "cart",
] as const;
export type ProactivePageScope = (typeof PROACTIVE_PAGE_SCOPES)[number];

export const PROACTIVE_FREQUENCIES = [
  "once_per_session",
  "once_per_day",
  "once_ever",
] as const;
export type ProactiveFrequency = (typeof PROACTIVE_FREQUENCIES)[number];

export type ProactiveTrigger =
  | { type: "time_on_page"; seconds: number }
  | { type: "exit_intent" }
  | { type: "scroll_depth"; percent: number }
  | { type: "return_visit"; minVisits: number }
  | { type: "cart_value"; minSubtotal: number }
  | { type: "cart_idle"; seconds: number };

export type ProactiveRule = {
  id: string;
  enabled: boolean;
  priority: number;
  trigger: ProactiveTrigger;
  audience: { pages: ProactivePageScope; handles: string[] };
  message: string;
  frequency: ProactiveFrequency;
};

// What the storefront actually receives. `enabled` is dropped because disabled
// rules are filtered out server-side — merchant copy for a rule that is turned
// off has no business being readable in page source.
export type PublicProactiveRule = Omit<ProactiveRule, "enabled">;

// Caps exist so a settings row can't grow unbounded (it's fetched on every
// page load) and so a rule can't be configured into something absurd.
export const MAX_PROACTIVE_RULES = 10;
export const MAX_PROACTIVE_MESSAGE_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function parseTrigger(value: unknown): ProactiveTrigger | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  switch (type) {
    case "time_on_page":
      return { type, seconds: asFiniteNumber(value.seconds, 15, 1, 3600) };
    case "exit_intent":
      return { type };
    case "scroll_depth":
      return { type, percent: asFiniteNumber(value.percent, 50, 1, 100) };
    case "return_visit":
      return { type, minVisits: asFiniteNumber(value.minVisits, 2, 2, 100) };
    case "cart_value":
      return { type, minSubtotal: asFiniteNumber(value.minSubtotal, 0, 0, 1_000_000) };
    case "cart_idle":
      return { type, seconds: asFiniteNumber(value.seconds, 30, 1, 3600) };
    default:
      return null;
  }
}

function parseAudience(value: unknown): ProactiveRule["audience"] {
  if (!isRecord(value)) return { pages: "any", handles: [] };
  const pages = PROACTIVE_PAGE_SCOPES.find((p) => p === value.pages) ?? "any";
  const handles = Array.isArray(value.handles)
    ? value.handles.filter((h): h is string => typeof h === "string" && h.length > 0)
    : [];
  return { pages, handles };
}

// Tolerant on purpose: this parses data that has already been written, and a
// single malformed rule must never take the storefront widget down with it.
// Unparseable entries are dropped, not thrown on. Validation of *incoming*
// merchant input belongs in the settings action, where an error can be shown.
export function parseProactiveRules(value: unknown): ProactiveRule[] {
  if (!Array.isArray(value)) return [];

  const rules: ProactiveRule[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || raw.id.length === 0) continue;

    const trigger = parseTrigger(raw.trigger);
    if (!trigger) continue;

    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (!message) continue;

    rules.push({
      id: raw.id,
      enabled: raw.enabled !== false,
      priority: asFiniteNumber(raw.priority, 0, -100, 100),
      trigger,
      audience: parseAudience(raw.audience),
      message: message.slice(0, MAX_PROACTIVE_MESSAGE_LENGTH),
      frequency:
        PROACTIVE_FREQUENCIES.find((f) => f === raw.frequency) ?? "once_per_session",
    });

    if (rules.length >= MAX_PROACTIVE_RULES) break;
  }
  return rules;
}

// Strict counterpart to parseProactiveRules, for merchant input arriving from
// the admin. Where the parser silently drops junk (it must never break a live
// storefront), this refuses the save and says why, so a typo surfaces in the
// UI instead of vanishing.
export function validateProactiveRules(
  input: unknown,
): { rules: ProactiveRule[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "Rules must be a list." };
  if (input.length > MAX_PROACTIVE_RULES) {
    return { error: `You can have at most ${MAX_PROACTIVE_RULES} rules.` };
  }

  const seen = new Set<string>();
  const rules: ProactiveRule[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) return { error: "A rule is malformed." };

    if (typeof raw.id !== "string" || !raw.id) {
      return { error: "A rule is missing its id." };
    }
    if (seen.has(raw.id)) return { error: "Two rules share the same id." };
    seen.add(raw.id);

    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (!message) return { error: "Every rule needs a message." };
    if (message.length > MAX_PROACTIVE_MESSAGE_LENGTH) {
      return {
        error: `Messages must be ${MAX_PROACTIVE_MESSAGE_LENGTH} characters or fewer.`,
      };
    }

    const trigger = parseTrigger(raw.trigger);
    if (!trigger) return { error: "A rule has an unknown trigger." };

    rules.push({
      id: raw.id,
      enabled: raw.enabled !== false,
      priority: asFiniteNumber(raw.priority, 0, -100, 100),
      trigger,
      audience: parseAudience(raw.audience),
      message,
      frequency:
        PROACTIVE_FREQUENCIES.find((f) => f === raw.frequency) ??
        "once_per_session",
    });
  }

  return { rules };
}

// Highest priority first, so the widget can take the first match it finds
// instead of scoring the whole list.
export function publicProactiveRules(value: unknown): PublicProactiveRule[] {
  return parseProactiveRules(value)
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority)
    .map((rule) => ({
      id: rule.id,
      priority: rule.priority,
      trigger: rule.trigger,
      audience: rule.audience,
      message: rule.message,
      frequency: rule.frequency,
    }));
}
