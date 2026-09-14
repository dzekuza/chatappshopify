import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  MAX_PROACTIVE_MESSAGE_LENGTH,
  MAX_PROACTIVE_RULES,
  ONLINE_STORE_ONLY_TRIGGERS,
  type ProactiveFrequency,
  type ProactivePageScope,
  type ProactiveRule,
  type ProactiveTrigger,
  type ProactiveTriggerType,
} from "../../proactive";

export const PROACTIVE_RULE_MODAL_ID = "proactive-rule-modal";

export type ProactiveSectionProps = {
  proactiveEnabled: boolean;
  rules: ProactiveRule[];
  /** What the last catalogue sync found the storefront to be built with. */
  detectedPlatform: "online-store" | "headless" | "unknown";
};

const TRIGGER_LABELS: Record<ProactiveTriggerType, string> = {
  time_on_page: "Time on page",
  exit_intent: "Exit intent",
  scroll_depth: "Scroll depth",
  return_visit: "Return visit",
  cart_value: "Cart value",
  cart_idle: "Cart sitting idle",
};

const PAGE_LABELS: Record<ProactivePageScope, string> = {
  any: "Any page",
  home: "Home page",
  product: "Product pages",
  collection: "Collection pages",
  cart: "Cart page",
};

const FREQUENCY_LABELS: Record<ProactiveFrequency, string> = {
  once_per_session: "Once per session",
  once_per_day: "Once per day",
  once_ever: "Once ever",
};

function defaultTrigger(type: ProactiveTriggerType): ProactiveTrigger {
  switch (type) {
    case "time_on_page":
      return { type, seconds: 20 };
    case "exit_intent":
      return { type };
    case "scroll_depth":
      return { type, percent: 60 };
    case "return_visit":
      return { type, minVisits: 2 };
    case "cart_value":
      return { type, minSubtotal: 50 };
    case "cart_idle":
      return { type, seconds: 45 };
  }
}

function describeTrigger(trigger: ProactiveTrigger) {
  switch (trigger.type) {
    case "time_on_page":
      return `After ${trigger.seconds}s on the page`;
    case "exit_intent":
      return "When they look like they're leaving";
    case "scroll_depth":
      return `After scrolling ${trigger.percent}%`;
    case "return_visit":
      return `On visit ${trigger.minVisits}+`;
    case "cart_value":
      return `Cart over ${trigger.minSubtotal}`;
    case "cart_idle":
      return `Cart idle for ${trigger.seconds}s`;
  }
}

function newRule(): ProactiveRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    priority: 0,
    trigger: defaultTrigger("time_on_page"),
    audience: { pages: "any", handles: [] },
    message: "",
    frequency: "once_per_session",
  };
}

// Rules the shopper's browser evaluates on its own — no scopes, no webhooks,
// no scheduler. Saves through its own fetcher rather than the settings form's
// save bar, because that bar derives its dirty state from field events and a
// list edited through a modal fires none.
export function ProactiveSection({
  proactiveEnabled,
  rules: initialRules,
  detectedPlatform,
}: ProactiveSectionProps) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const shopify = useAppBridge();

  const [enabled, setEnabled] = useState(proactiveEnabled);
  const [rules, setRules] = useState<ProactiveRule[]>(initialRules);
  const [draft, setDraft] = useState<ProactiveRule | null>(null);

  // @shopify/polaris-types doesn't export the s-modal element class, so
  // there's no non-`any` type to ref it against. Spread as a prop object so
  // the suppression sits on a statement, where it actually applies — an
  // eslint-disable comment can't reach a JSX attribute.
  const modalRef = useRef<{ hideOverlay: () => void }>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalRefProp = { ref: modalRef as any };

  const isSaving = fetcher.state !== "idle";
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      if (fetcher.data?.ok) shopify.toast.show("Proactive messages saved");
      else if (fetcher.data?.error) shopify.toast.show(fetcher.data.error);
    }
    wasSaving.current = isSaving;
  }, [isSaving, fetcher.data, shopify]);

  // `/cart.js` is Online Store only, so a headless storefront can never
  // satisfy the cart triggers — offering them would be offering a rule that
  // silently never fires. See ONLINE_STORE_ONLY_TRIGGERS.
  const isHeadless = detectedPlatform === "headless";
  const availableTriggers = (
    Object.keys(TRIGGER_LABELS) as ProactiveTriggerType[]
  ).filter((t) => !isHeadless || !ONLINE_STORE_ONLY_TRIGGERS.includes(t));

  const save = (nextEnabled: boolean, nextRules: ProactiveRule[]) => {
    setEnabled(nextEnabled);
    setRules(nextRules);
    fetcher.submit(
      { enabled: nextEnabled, rules: nextRules },
      { method: "post", action: "/app/proactive", encType: "application/json" },
    );
  };

  const commitDraft = () => {
    if (!draft || !draft.message.trim()) return;
    const exists = rules.some((r) => r.id === draft.id);
    save(
      enabled,
      exists ? rules.map((r) => (r.id === draft.id ? draft : r)) : [...rules, draft],
    );
    setDraft(null);
    modalRef.current?.hideOverlay();
  };

  const editDraft = <K extends keyof ProactiveRule>(
    key: K,
    value: ProactiveRule[K],
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <s-section heading="Proactive messages">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Let the widget start the conversation when a shopper looks stuck or
          about to leave. Everything is decided in the shopper&apos;s browser —
          no emails are sent and no extra permissions are needed.
        </s-paragraph>

        <s-switch
          name="proactiveEnabled"
          label="Enable proactive messages"
          {...(enabled ? { checked: true } : {})}
          onChange={(event: Event) =>
            save((event.currentTarget as HTMLInputElement).checked, rules)
          }
        />

        {isHeadless && (
          <s-banner tone="info">
            <s-paragraph>
              Cart triggers need the Online Store&apos;s cart endpoint, which a
              headless storefront doesn&apos;t expose — they&apos;re hidden here.
            </s-paragraph>
          </s-banner>
        )}

        {rules.length === 0 ? (
          <s-paragraph>
            <s-text color="subdued">
              No rules yet. Add one to have the widget reach out on its own.
            </s-text>
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Message</s-table-header>
              <s-table-header listSlot="secondary">Trigger</s-table-header>
              <s-table-header listSlot="inline">Pages</s-table-header>
              <s-table-header listSlot="inline">Frequency</s-table-header>
              <s-table-header listSlot="labeled">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-300">
                      <s-text>{rule.message}</s-text>
                      {!rule.enabled && <s-badge tone="info">Off</s-badge>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{describeTrigger(rule.trigger)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{PAGE_LABELS[rule.audience.pages]}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{FREQUENCY_LABELS[rule.frequency]}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-300">
                      <s-button
                        variant="tertiary"
                        commandFor={PROACTIVE_RULE_MODAL_ID}
                        command="--show"
                        onClick={() => setDraft({ ...rule })}
                      >
                        Edit
                      </s-button>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() =>
                          save(
                            enabled,
                            rules.filter((r) => r.id !== rule.id),
                          )
                        }
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}

        <s-stack direction="inline" gap="base">
          <s-button
            commandFor={PROACTIVE_RULE_MODAL_ID}
            command="--show"
            {...(rules.length >= MAX_PROACTIVE_RULES ? { disabled: true } : {})}
            onClick={() => setDraft(newRule())}
          >
            Add rule
          </s-button>
          {isSaving && <s-spinner accessibilityLabel="Saving" />}
        </s-stack>
      </s-stack>

      <s-modal
        {...modalRefProp}
        id={PROACTIVE_RULE_MODAL_ID}
        heading="Proactive rule"
      >
        {draft && (
          <s-stack direction="block" gap="base">
            <s-text-area
              name="message"
              label="Message"
              value={draft.message}
              maxLength={MAX_PROACTIVE_MESSAGE_LENGTH}
              details="Shown next to the chat bubble. Opening the chat replaces the welcome message with this."
              onChange={(event: Event) =>
                editDraft(
                  "message",
                  (event.currentTarget as HTMLTextAreaElement).value,
                )
              }
            />

            <s-select
              name="triggerType"
              label="Trigger"
              value={draft.trigger.type}
              onChange={(event: Event) =>
                editDraft(
                  "trigger",
                  defaultTrigger(
                    (event.currentTarget as HTMLSelectElement)
                      .value as ProactiveTriggerType,
                  ),
                )
              }
            >
              {availableTriggers.map((t) => (
                <s-option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </s-option>
              ))}
            </s-select>

            {draft.trigger.type !== "exit_intent" && (
              <s-number-field
                name="triggerValue"
                label={
                  draft.trigger.type === "scroll_depth"
                    ? "Percent scrolled"
                    : draft.trigger.type === "return_visit"
                      ? "Minimum visits"
                      : draft.trigger.type === "cart_value"
                        ? "Minimum cart subtotal"
                        : "Seconds"
                }
                value={String(
                  draft.trigger.type === "scroll_depth"
                    ? draft.trigger.percent
                    : draft.trigger.type === "return_visit"
                      ? draft.trigger.minVisits
                      : draft.trigger.type === "cart_value"
                        ? draft.trigger.minSubtotal
                        : draft.trigger.seconds,
                )}
                onChange={(event: Event) => {
                  const n = Number(
                    (event.currentTarget as HTMLInputElement).value,
                  );
                  if (!Number.isFinite(n)) return;
                  const t = draft.trigger;
                  editDraft(
                    "trigger",
                    t.type === "scroll_depth"
                      ? { type: t.type, percent: n }
                      : t.type === "return_visit"
                        ? { type: t.type, minVisits: n }
                        : t.type === "cart_value"
                          ? { type: t.type, minSubtotal: n }
                          : t.type === "cart_idle"
                            ? { type: t.type, seconds: n }
                            : { type: "time_on_page", seconds: n },
                  );
                }}
              />
            )}

            <s-select
              name="pages"
              label="Show on"
              value={draft.audience.pages}
              onChange={(event: Event) =>
                editDraft("audience", {
                  ...draft.audience,
                  pages: (event.currentTarget as HTMLSelectElement)
                    .value as ProactivePageScope,
                })
              }
            >
              {(Object.keys(PAGE_LABELS) as ProactivePageScope[]).map((p) => (
                <s-option key={p} value={p}>
                  {PAGE_LABELS[p]}
                </s-option>
              ))}
            </s-select>

            <s-select
              name="frequency"
              label="Show at most"
              value={draft.frequency}
              onChange={(event: Event) =>
                editDraft(
                  "frequency",
                  (event.currentTarget as HTMLSelectElement)
                    .value as ProactiveFrequency,
                )
              }
            >
              {(Object.keys(FREQUENCY_LABELS) as ProactiveFrequency[]).map(
                (f) => (
                  <s-option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </s-option>
                ),
              )}
            </s-select>

            <s-switch
              name="ruleEnabled"
              label="Rule is active"
              {...(draft.enabled ? { checked: true } : {})}
              onChange={(event: Event) =>
                editDraft(
                  "enabled",
                  (event.currentTarget as HTMLInputElement).checked,
                )
              }
            />
          </s-stack>
        )}

        <s-button
          slot="secondary-actions"
          commandFor={PROACTIVE_RULE_MODAL_ID}
          command="--hide"
          onClick={() => setDraft(null)}
        >
          Cancel
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          {...(draft && draft.message.trim() ? {} : { disabled: true })}
          onClick={commitDraft}
        >
          Save rule
        </s-button>
      </s-modal>
    </s-section>
  );
}
