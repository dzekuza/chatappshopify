import type { UpdateSettingFn } from "./widget-section";

export type KlaviyoSectionProps = {
  klaviyoApiKey: string | null;
  onChange: UpdateSettingFn;
};

export function KlaviyoSection({ klaviyoApiKey, onChange }: KlaviyoSectionProps) {
  return (
    <s-section heading="Klaviyo">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          When set, every shopper who starts a chat is created or updated as
          a Klaviyo profile (name, email, and phone if given) — so you can
          follow up or add them to a flow in Klaviyo, not just see them here.
        </s-paragraph>
        <s-text-field
          name="klaviyoApiKey"
          label="Klaviyo private API key"
          details="From Klaviyo: Settings → API Keys → Create Private API Key. Needs Profiles: Full Access. Leave blank to turn this off."
          value={klaviyoApiKey ?? ""}
          onChange={(event: Event) =>
            onChange(
              "klaviyoApiKey",
              (event.currentTarget as HTMLInputElement).value,
            )
          }
        />
      </s-stack>
    </s-section>
  );
}
