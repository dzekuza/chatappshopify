import type { WidgetSettings } from "@prisma/client";

export type UpdateSettingFn = <K extends keyof WidgetSettings>(
  key: K,
  value: WidgetSettings[K],
) => void;

export type WidgetSectionProps = {
  enabled: boolean;
  welcomeMessage: string;
  systemPrompt: string;
  onChange: UpdateSettingFn;
};

export function WidgetSection({
  enabled,
  welcomeMessage,
  systemPrompt,
  onChange,
}: WidgetSectionProps) {
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
      </s-stack>
    </s-section>
  );
}
