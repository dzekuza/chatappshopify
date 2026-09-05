import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { HeadlessEmbed } from "../../headless-embed.server";
import styles from "../../styles/headless-embed.module.css";

export type HeadlessSectionProps = {
  embed: HeadlessEmbed;
  storefrontOrigins: string[];
  /** What the last catalogue sync found the storefront to be built with. */
  detectedPlatform: "online-store" | "headless" | "unknown";
};

type Snippet = { id: string; label: string; code: string; caption: string };

// The counterpart to "Add to theme" for storefronts that have no theme.
//
// A theme app extension is Online Store only — a Hydrogen storefront renders
// no app embed block, so installing the app leaves the widget invisible with
// nothing in the admin explaining why. This card is that explanation plus the
// two things a headless merchant actually needs: the origin allowlist that
// lets their domain call the app proxy (see cors.server.ts), and the embed to
// paste into their storefront's root layout.
export function HeadlessSection({
  embed,
  storefrontOrigins,
  detectedPlatform,
}: HeadlessSectionProps) {
  const fetcher = useFetcher<{ ok: boolean; origins: string[] }>();
  const shopify = useAppBridge();

  const [origins, setOrigins] = useState(storefrontOrigins.join("\n"));
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(detectedPlatform === "headless");

  const isSaving = fetcher.state !== "idle";
  const wasSaving = useRef(false);

  useEffect(() => {
    if (wasSaving.current && !isSaving && fetcher.data?.ok) {
      setOrigins(fetcher.data.origins.join("\n"));
      shopify.toast.show("Storefront domains saved");
    }
    wasSaving.current = isSaving;
  }, [isSaving, fetcher.data, shopify]);

  const copy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      shopify.toast.show("Couldn't copy — select the code and copy it manually");
    }
  };

  const snippets: Snippet[] = [
    {
      id: "hydrogen",
      label: "Hydrogen (app/root.tsx)",
      code: embed.hydrogenSnippet,
      caption:
        "Paste inside the <body> of your root layout, after {children}.",
    },
    {
      id: "html",
      label: "Any other storefront",
      code: embed.htmlSnippet,
      caption: "Paste before the closing </body> tag of every page.",
    },
    {
      id: "csp",
      label: "Content Security Policy",
      code: embed.cspSnippet,
      caption:
        "Hydrogen ships a strict CSP — add these hosts in entry.server.tsx or the widget is blocked.",
    },
  ];

  if (!expanded) {
    return (
      <s-section heading="Headless storefront">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Running Hydrogen, Oxygen, or your own storefront framework?
            &ldquo;Add to theme&rdquo; only works on the Liquid Online Store —
            a headless storefront needs a short snippet instead.
          </s-paragraph>
          <s-button variant="secondary" onClick={() => setExpanded(true)}>
            Set up headless storefront
          </s-button>
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-section heading="Headless storefront">
      <s-stack direction="block" gap="large">
        {detectedPlatform === "headless" ? (
          <s-banner tone="info" heading="Headless storefront detected">
            <s-paragraph>
              Your storefront doesn&rsquo;t run a Liquid theme, so the theme
              editor&rsquo;s app embed can&rsquo;t show the widget. Follow the
              two steps below instead.
            </s-paragraph>
          </s-banner>
        ) : null}

        <s-stack direction="block" gap="base">
          <s-text type="strong">1. Allow your storefront&rsquo;s domain</s-text>
          <s-paragraph>
            The widget talks to this store over{" "}
            <s-text type="strong">{embed.proxyBase}</s-text>. Because that
            isn&rsquo;t your storefront&rsquo;s own domain, each domain the
            widget runs on has to be listed here before the browser will let it
            through.
          </s-paragraph>
          <s-text-area
            name="storefrontOrigins"
            label="Storefront domains"
            rows={3}
            value={origins}
            details="One per line, e.g. https://shop.example.com. Include every domain and preview domain the widget runs on."
            onChange={(event: Event) =>
              setOrigins((event.currentTarget as HTMLTextAreaElement).value)
            }
          />
          <s-button
            variant="primary"
            {...(isSaving ? { loading: true } : {})}
            onClick={() =>
              fetcher.submit(
                { storefrontOrigins: origins },
                { method: "post", action: "/app/headless" },
              )
            }
          >
            Save domains
          </s-button>
        </s-stack>

        <s-stack direction="block" gap="base">
          <s-text type="strong">2. Paste the widget into your storefront</s-text>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Working with a developer, or with an AI coding assistant like
                Claude Code or Cursor? Copy a ready-made prompt with this
                store&rsquo;s own URLs already filled in — it covers everything
                below, including the Content Security Policy change Hydrogen
                needs.
              </s-paragraph>
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-button
                  variant="primary"
                  icon="clipboard"
                  onClick={() => copy("ai-prompt", embed.aiPrompt)}
                >
                  {copied === "ai-prompt" ? "Copied" : "Copy AI prompt"}
                </s-button>
                <s-text color="subdued">
                  Paste it into your assistant with the storefront repo open.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>

          <s-text color="subdued">
            Or do it by hand with the snippets below.
          </s-text>

          {snippets.map((snippet) => (
            <s-stack key={snippet.id} direction="block" gap="small-200">
              <s-text color="subdued">{snippet.label}</s-text>
              <s-box padding="base" background="subdued" borderRadius="base">
                <pre className={styles.snippet}>{snippet.code}</pre>
              </s-box>
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-button
                  variant="secondary"
                  onClick={() => copy(snippet.id, snippet.code)}
                >
                  {copied === snippet.id ? "Copied" : "Copy"}
                </s-button>
                <s-text color="subdued">{snippet.caption}</s-text>
              </s-stack>
            </s-stack>
          ))}
        </s-stack>
      </s-stack>
    </s-section>
  );
}
