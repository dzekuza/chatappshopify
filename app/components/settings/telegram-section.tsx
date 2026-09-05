import { useFetcher, useRevalidator } from "react-router";
import { useEffect } from "react";

export type TelegramLinkState = {
  linkCode: string;
  linkCodeExpiresAt: string | null;
  chatId: string | null;
  chatTitle: string | null;
  enabled: boolean;
  feedScope: string;
} | null;

export type TelegramSectionProps = {
  link: TelegramLinkState;
  botUsername: string | null;
  isConfigured: boolean;
};

// Telegram is the app's push channel: Shopify's mobile admin has no
// notification for widget conversations, so without this a merchant only
// finds out a shopper wanted them by opening the app.
export function TelegramSection({
  link,
  botUsername,
  isConfigured,
}: TelegramSectionProps) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const isBusy = fetcher.state !== "idle";

  // The chat id is filled in by Telegram's webhook, not by this page, so the
  // loader data only catches up once something re-runs it.
  useEffect(() => {
    const stillRedeemable =
      link?.linkCodeExpiresAt &&
      new Date(link.linkCodeExpiresAt).getTime() > Date.now();
    if (stillRedeemable && !link?.chatId) {
      const timer = setInterval(() => revalidator.revalidate(), 4000);
      return () => clearInterval(timer);
    }
  }, [link?.linkCodeExpiresAt, link?.chatId, revalidator]);

  if (!isConfigured) {
    return (
      <s-section heading="Telegram notifications">
        <s-banner tone="info" heading="Not available yet">
          <s-paragraph>
            Telegram notifications need the{" "}
            <s-text type="strong">TELEGRAM_BOT_TOKEN</s-text> environment
            variable to be set on this app.
          </s-paragraph>
        </s-banner>
      </s-section>
    );
  }

  if (!link) {
    return (
      <s-section heading="Telegram notifications">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Get chat activity pushed to your phone, and reply to shoppers
            straight from Telegram. Shopify&rsquo;s mobile app doesn&rsquo;t
            notify you about chat conversations — this does.
          </s-paragraph>
          <s-button
            variant="primary"
            icon="chat"
            {...(isBusy ? { loading: true } : {})}
            onClick={() =>
              fetcher.submit({ intent: "connect" }, { method: "post", action: "/app/telegram" })
            }
          >
            Connect Telegram
          </s-button>
        </s-stack>
      </s-section>
    );
  }

  if (!link.chatId) {
    const isExpired =
      !link.linkCodeExpiresAt ||
      new Date(link.linkCodeExpiresAt).getTime() <= Date.now();
    const deepLink =
      botUsername && !isExpired
        ? `https://t.me/${botUsername}?start=${link.linkCode}`
        : null;

    return (
      <s-section heading="Telegram notifications">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Open the bot in Telegram and send it this code to finish
            connecting. It works once, and only for the next 15 minutes.
          </s-paragraph>
          {isExpired ? (
            <s-banner tone="warning" heading="This code has expired">
              <s-paragraph>Generate a new one to carry on.</s-paragraph>
            </s-banner>
          ) : (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text type="strong">{link.linkCode}</s-text>
            </s-box>
          )}
          <s-stack direction="inline" gap="base">
            {deepLink ? (
              <s-button variant="primary" href={deepLink} target="_blank" icon="external">
                Open Telegram
              </s-button>
            ) : null}
            <s-button
              variant="secondary"
              {...(isBusy ? { loading: true } : {})}
              onClick={() =>
                fetcher.submit({ intent: "connect" }, { method: "post", action: "/app/telegram" })
              }
            >
              New code
            </s-button>
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() =>
                fetcher.submit({ intent: "disconnect" }, { method: "post", action: "/app/telegram" })
              }
            >
              Cancel
            </s-button>
          </s-stack>
          {isExpired ? null : (
            <s-text color="subdued">
              Waiting for the code — this page updates itself once it arrives.
            </s-text>
          )}
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-section heading="Telegram notifications">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-badge tone={link.enabled ? "success" : "caution"}>
            {link.enabled ? "Connected" : "Paused"}
          </s-badge>
          {link.chatTitle ? <s-text color="subdued">{link.chatTitle}</s-text> : null}
        </s-stack>

        <s-select
          label="What to send"
          name="feedScope"
          value={link.feedScope}
          details="Busy stores can cut the noise down to just the moments that need a person."
          onChange={(event: Event) =>
            fetcher.submit(
              {
                intent: "scope",
                feedScope: (event.target as HTMLSelectElement).value,
              },
              { method: "post", action: "/app/telegram" },
            )
          }
        >
          <s-option value="all">Every message</s-option>
          <s-option value="alerts">Only when a shopper asks for a human</s-option>
        </s-select>

        <s-paragraph>
          Reply to any shopper message in Telegram and it goes straight back
          into their chat on your store.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button
            variant="secondary"
            {...(isBusy ? { loading: true } : {})}
            onClick={() =>
              fetcher.submit(
                { intent: "toggle", enabled: String(!link.enabled) },
                { method: "post", action: "/app/telegram" },
              )
            }
          >
            {link.enabled ? "Pause notifications" : "Resume notifications"}
          </s-button>
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={() =>
              fetcher.submit({ intent: "disconnect" }, { method: "post", action: "/app/telegram" })
            }
          >
            Disconnect
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
