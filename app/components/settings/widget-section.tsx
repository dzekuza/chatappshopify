import { useEffect, useRef, useState } from "react";
import type { WidgetSettings } from "@prisma/client";
import {
  PromptTemplateModal,
  PROMPT_TEMPLATE_MODAL_ID,
} from "./prompt-template-modal";
import {
  PromptImproveModal,
  PROMPT_IMPROVE_MODAL_ID,
} from "./prompt-improve-modal";

export type UpdateSettingFn = <K extends keyof WidgetSettings>(
  key: K,
  value: WidgetSettings[K],
) => void;

export type WidgetSectionProps = {
  enabled: boolean;
  welcomeMessage: string;
  systemPrompt: string;
  geminiModel: string;
  onChange: UpdateSettingFn;
};

export function WidgetSection({
  enabled,
  welcomeMessage,
  systemPrompt,
  geminiModel,
  onChange,
}: WidgetSectionProps) {
  // data-save-bar derives its dirty state from events the form's fields
  // emit. Applying a template or an AI rewrite sets the value through React
  // instead, which fires nothing — so the merchant would see the new prompt
  // in the field with no Save button to persist it. Re-dispatch input/change
  // from the field itself once React has committed the new value.
  // @shopify/polaris-types doesn't export the s-text-area element class, so
  // there's no non-`any` type to ref the field against.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promptFieldRef = useRef<any>(null);
  const [applyCount, setApplyCount] = useState(0);

  useEffect(() => {
    if (applyCount === 0) return;
    const field = promptFieldRef.current;
    if (!field) return;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, [applyCount]);

  const setSystemPrompt = (value: string) => {
    onChange("systemPrompt", value as WidgetSettings["systemPrompt"]);
    setApplyCount((count) => count + 1);
  };

  return (
    <s-section heading="Widget">
      <s-stack direction="block" gap="base">
        <s-switch
          name="enabled"
          label="Enable chat widget on storefront"
          {...(enabled ? { checked: true } : {})}
          onChange={(event: Event) =>
            onChange("enabled", (event.currentTarget as HTMLInputElement).checked)
          }
        />
        <s-text-field
          name="welcomeMessage"
          label="Welcome message"
          value={welcomeMessage}
          details="Shown when a shopper first opens the widget."
          onChange={(event: Event) =>
            onChange(
              "welcomeMessage",
              (event.currentTarget as HTMLInputElement).value,
            )
          }
        />
        <s-text-area
          ref={promptFieldRef}
          name="systemPrompt"
          label="Assistant persona / instructions"
          value={systemPrompt}
          rows={5}
          details="Tells the AI how to behave. It can also look up real product data from your store."
          onChange={(event: Event) =>
            onChange(
              "systemPrompt",
              (event.currentTarget as HTMLTextAreaElement).value,
            )
          }
        />
        <s-stack direction="inline" gap="small-200">
          <s-button
            variant="secondary"
            icon="collection"
            commandFor={PROMPT_TEMPLATE_MODAL_ID}
          >
            Templates
          </s-button>
          <s-button
            variant="secondary"
            icon="wand"
            commandFor={PROMPT_IMPROVE_MODAL_ID}
          >
            Improve with AI
          </s-button>
        </s-stack>
      </s-stack>

      <PromptTemplateModal onApply={setSystemPrompt} />
      <PromptImproveModal
        systemPrompt={systemPrompt}
        geminiModel={geminiModel}
        onApply={setSystemPrompt}
      />
    </s-section>
  );
}
