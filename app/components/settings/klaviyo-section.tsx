import type { UpdateSettingFn } from "./widget-section";

export type KlaviyoSectionProps = {
  syncCustomersToShopify: boolean;
  klaviyoApiKey: string | null;
  onChange: UpdateSettingFn;
};

// Covers both chat-start sync destinations — Shopify customers and Klaviyo
// — in one card since they share the same source data (the chat widget's
// name/email/phone contact gate) and the same off-by-default reasoning: the
// widget is an unauthenticated storefront endpoint, so a merchant opts in
// deliberately rather than every shop getting this silently on day one.
export function KlaviyoSection({
  syncCustomersToShopify,
  klaviyoApiKey,
  onChange,
}: KlaviyoSectionProps) {
  return (
    <s-section heading="Customer sync">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Every chat starts with a name and email (phone optional) before the
          shopper can send a message. Choose where that gets saved beyond
          this app&rsquo;s own conversation log.
        </s-paragraph>
        <s-switch
          name="syncCustomersToShopify"
          label="Create a Shopify customer for each new chat"
          details={'Tagged "AI Chat Widget" so you can tell them apart. Only creates new customers — never overwrites an existing one.'}
          {...(syncCustomersToShopify ? { checked: true } : {})}
          onChange={(event: Event) =>
            onChange(
              "syncCustomersToShopify",
              (event.currentTarget as HTMLInputElement).checked,
            )
          }
        />
        <s-text-field
          name="klaviyoApiKey"
          label="Klaviyo private API key"
          details="From Klaviyo: Settings → API Keys → Create Private API Key. Needs Profiles: Full Access. Leave blank to turn this off. Only creates new profiles — never overwrites an existing one."
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
