import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

type RedeemResult = { ok: boolean; plan?: string; error?: string };

// A secret code that unlocks a paid plan without a real Shopify charge — see
// plan.server.ts. Posts to this page's own action, then revalidates the
// loader so isProPlan/currentPlan everywhere on the page reflect the
// newly-redeemed plan immediately.
export function PlanCodeRedeem() {
  const fetcher = useFetcher<RedeemResult>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const [code, setCode] = useState("");

  const isRedeeming = fetcher.state !== "idle";
  const wasRedeeming = useRef(false);

  useEffect(() => {
    if (wasRedeeming.current && !isRedeeming) {
      if (fetcher.data?.ok) {
        shopify.toast.show(`${fetcher.data.plan} unlocked`);
        setCode("");
        revalidator.revalidate();
      } else if (fetcher.data?.error) {
        shopify.toast.show(fetcher.data.error, { isError: true });
      }
    }
    wasRedeeming.current = isRedeeming;
  }, [isRedeeming, fetcher.data, shopify, revalidator]);

  const redeem = () => {
    if (!code.trim() || isRedeeming) return;
    fetcher.submit({ code }, { method: "post", encType: "application/json" });
  };

  return (
    <s-section heading="Have a code?">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Got an unlock code from us? Enter it here to switch this store onto
          that plan without going through checkout.
        </s-paragraph>
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
          <s-text-field
            label="Code"
            labelAccessibilityVisibility="exclusive"
            placeholder="Enter code"
            value={code}
            onChange={(event: Event) =>
              setCode((event.currentTarget as HTMLInputElement).value)
            }
          />
          <s-button
            variant="primary"
            {...(isRedeeming || !code.trim() ? { disabled: true } : {})}
            {...(isRedeeming ? { loading: true } : {})}
            onClick={redeem}
          >
            Redeem
          </s-button>
        </s-grid>
      </s-stack>
    </s-section>
  );
}
