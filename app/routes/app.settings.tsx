import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, MONTHLY_PLAN, PRO_PLAN } from "../shopify.server";
import prisma from "../db.server";
import { WidgetSection } from "../components/settings/widget-section";
import { AppearanceSection } from "../components/settings/appearance-section";
import { AiModelSection } from "../components/settings/ai-model-section";
import { TelegramSection } from "../components/settings/telegram-section";
import { HeadlessSection } from "../components/settings/headless-section";
import { buildHeadlessEmbed } from "../headless-embed.server";
import { parseStorefrontOrigins } from "../cors.server";
import type { StorefrontPlatform } from "../storefront.server";
import { isTelegramConfigured, telegramBotUsername } from "../telegram.server";
import type { KnowledgeCollection } from "../components/settings/knowledge-sync-section";
import type { WidgetSettings } from "@prisma/client";
import { FREE_TIER_DEFAULT_MODEL } from "../gemini-model.server";

const LANGUAGE_VALUES = [
  "auto",
  "en",
  "lt",
  "lv",
  "et",
  "pl",
  "de",
  "ru",
  "es",
  "fr",
  "it",
  "pt",
  "nl",
  "sv",
  "no",
  "da",
  "fi",
];

// The app embed deep link is keyed on the app's api_key (same value as
// client_id in shopify.app.*.toml, and what SHOPIFY_API_KEY holds) plus the
// block's filename without .liquid. The older extension-uuid form is
// deprecated and, because prod and dev are two separate Shopify apps with
// different extension registrations, a hardcoded uuid made the theme editor
// answer "App embed does not exist".
const THEME_BLOCK_HANDLE = "chat_widget";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  // The DB upsert and the Shopify billing check don't depend on each
  // other's result — running them concurrently instead of sequentially
  // roughly halves this loader's critical path.
  const [settings, { appSubscriptions }, telegramLink, catalogSync] =
    await Promise.all([
      prisma.widgetSettings.upsert({
        where: { shop: session.shop },
        update: {},
        create: { shop: session.shop },
      }),
      billing.check({ plans: [MONTHLY_PLAN, PRO_PLAN] }),
      prisma.telegramLink.findUnique({ where: { shop: session.shop } }),
      // Only for the detected-platform hint on the headless card — the
      // catalogue sync already probes the storefront and records how it's
      // built (see storefront.server.ts), so nothing extra has to be fetched
      // from Shopify to know whether this shop even has a theme.
      prisma.catalogSync.findUnique({
        where: { shop: session.shop },
        select: { platform: true },
      }),
    ]);
  const isProPlan = appSubscriptions.some((sub) => sub.name === PRO_PLAN);

  const addToThemeUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${process.env.SHOPIFY_API_KEY}/${THEME_BLOCK_HANDLE}`;

  const detectedPlatform: StorefrontPlatform =
    catalogSync?.platform === "headless"
      ? "headless"
      : catalogSync?.platform === "online-store"
        ? "online-store"
        : "unknown";

  return {
    settings,
    addToThemeUrl,
    isProPlan,
    headless: {
      embed: buildHeadlessEmbed(session.shop, process.env.SHOPIFY_APP_URL ?? ""),
      storefrontOrigins: parseStorefrontOrigins(settings.storefrontOrigins),
      detectedPlatform,
    },
    telegram: {
      link: telegramLink
        ? {
            linkCode: telegramLink.linkCode,
            linkCodeExpiresAt:
              telegramLink.linkCodeExpiresAt?.toISOString() ?? null,
            chatId: telegramLink.chatId,
            chatTitle: telegramLink.chatTitle,
            enabled: telegramLink.enabled,
            feedScope: telegramLink.feedScope,
          }
        : null,
      botUsername: telegramBotUsername(),
      isConfigured: isTelegramConfigured(),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const payload = await request.json();

  const { appSubscriptions } = await billing.check({
    plans: [MONTHLY_PLAN, PRO_PLAN],
  });
  const isProPlan = appSubscriptions.some((sub) => sub.name === PRO_PLAN);

  const enabled = Boolean(payload.enabled);
  const welcomeMessage = String(payload.welcomeMessage ?? "").trim();
  const systemPrompt = String(payload.systemPrompt ?? "").trim();
  const primaryColor = String(payload.primaryColor ?? "").trim();
  const iconUrl = String(payload.iconUrl ?? "").trim() || null;
  const position = String(payload.position ?? "bottom-right");
  const headerTitle =
    String(payload.headerTitle ?? "").trim() || "Chat with us";
  const cornerStyle =
    payload.cornerStyle === "square" ? "square" : "rounded";
  const geminiModel = String(payload.geminiModel ?? FREE_TIER_DEFAULT_MODEL);
  // Bring-your-own API key is a Pro plan feature — silently ignore it for
  // other plans rather than trusting the client-side gate.
  const geminiApiKey = isProPlan
    ? String(payload.geminiApiKey ?? "").trim() || null
    : null;
  const language = LANGUAGE_VALUES.includes(payload.language)
    ? String(payload.language)
    : "auto";
  const knowledgeCollections: KnowledgeCollection[] = Array.isArray(
    payload.knowledgeCollections,
  )
    ? payload.knowledgeCollections
        .filter(
          (c: unknown): c is KnowledgeCollection =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as Record<string, unknown>).id === "string",
        )
        .map((c: KnowledgeCollection) => ({
          id: c.id,
          title: String(c.title ?? ""),
          handle: String(c.handle ?? ""),
        }))
    : [];

  try {
    const settings = await prisma.widgetSettings.upsert({
      where: { shop: session.shop },
      update: {
        enabled,
        welcomeMessage,
        systemPrompt,
        primaryColor,
        iconUrl,
        position,
        headerTitle,
        cornerStyle,
        geminiModel,
        geminiApiKey,
        language,
        knowledgeCollections,
      },
      create: {
        shop: session.shop,
        enabled,
        welcomeMessage,
        systemPrompt,
        primaryColor,
        iconUrl,
        position,
        headerTitle,
        cornerStyle,
        geminiModel,
        geminiApiKey,
        language,
        knowledgeCollections,
      },
    });

    return { settings };
  } catch {
    return { error: "Couldn't save your widget settings. Please try again." };
  }
};

export default function SettingsPage() {
  const { settings, addToThemeUrl, isProPlan, telegram, headless } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const shopify = useAppBridge();

  const [form, setForm] = useState(settings);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [iconUploadError, setIconUploadError] = useState<string | null>(null);

  const saveError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;

  // The save bar owns the in-flight state, so a successful save just needs
  // confirming — previously this was an info banner that sat in the page for
  // the duration of the request, which isn't the pattern for a transient save.
  const wasSaving = useRef(false);
  useEffect(() => {
    const isSaving = fetcher.state !== "idle";
    if (wasSaving.current && !isSaving && fetcher.data && !("error" in fetcher.data)) {
      shopify.toast.show("Settings saved");
    }
    wasSaving.current = isSaving;
  }, [fetcher.state, fetcher.data, shopify]);

  const update = <K extends keyof WidgetSettings>(
    key: K,
    value: WidgetSettings[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const uploadIcon = async (file: File) => {
    setIconUploadError(null);
    setIsUploadingIcon(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/app/chat-widget/icon-upload", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setIconUploadError(data.error || "Could not upload icon.");
        return;
      }
      update("iconUrl", data.url as WidgetSettings["iconUrl"]);
    } catch (err) {
      setIconUploadError("Could not upload icon.");
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const removeIcon = () => {
    setIconUploadError(null);
    update("iconUrl", null as WidgetSettings["iconUrl"]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    fetcher.submit(JSON.stringify(form), {
      method: "POST",
      encType: "application/json",
    });
  };

  // The App Bridge save bar dispatches a native `reset` event on the form
  // when the merchant clicks Discard — bring local state back in line with
  // what the loader gave us so the form (and the save bar itself) go quiet.
  const handleReset = () => {
    setForm(settings);
    setIconUploadError(null);
  };

  return (
    <s-page heading="Settings">
      <s-link slot="breadcrumb-actions" href="/app">
        Home
      </s-link>
      <s-button
        slot="secondary-actions"
        href={addToThemeUrl}
        target="_blank"
        icon="theme"
      >
        Add to theme
      </s-button>

      {saveError ? (
        <s-banner tone="critical" heading="Couldn't save settings">
          <s-paragraph>{saveError}</s-paragraph>
        </s-banner>
      ) : null}

      <form data-save-bar onSubmit={handleSubmit} onReset={handleReset}>
        {/* The icon is updated via file upload — not a native input the
            browser fires change events on — so without a hidden input
            reflecting its current value, data-save-bar's dirty-state
            detection (which diffs the form's FormData against its initial
            snapshot) never notices an icon-only change, and the Save
            button never appears. This exists purely so that snapshot
            includes it. */}
        <input type="hidden" name="iconUrl" value={form.iconUrl ?? ""} readOnly />
        {/* <s-page> only auto-spaces <s-section> elements that are its own
            direct children. Wrapping them in this <form> (required so
            data-save-bar can track every field in one form) breaks that
            direct-child relationship, so the gap has to be added back
            explicitly here. */}
        <s-stack direction="block" gap="large">
          <WidgetSection
            enabled={form.enabled}
            welcomeMessage={form.welcomeMessage}
            systemPrompt={form.systemPrompt}
            geminiModel={form.geminiModel}
            onChange={update}
          />

          <AppearanceSection
            primaryColor={form.primaryColor}
            iconUrl={form.iconUrl}
            position={form.position}
            headerTitle={form.headerTitle}
            cornerStyle={form.cornerStyle}
            isUploadingIcon={isUploadingIcon}
            iconUploadError={iconUploadError}
            onUploadIcon={uploadIcon}
            onRemoveIcon={removeIcon}
            onChange={update}
          />

          <AiModelSection
            geminiModel={form.geminiModel}
            language={form.language}
            geminiApiKey={form.geminiApiKey}
            isProPlan={isProPlan}
            onChange={update}
          />

        </s-stack>
      </form>

      {/* Both of these are deliberately outside the <form data-save-bar>
          above: they save through their own fetchers, and any field inside
          that form gets pulled into the save bar's dirty-state snapshot. */}
      <HeadlessSection
        embed={headless.embed}
        storefrontOrigins={headless.storefrontOrigins}
        detectedPlatform={headless.detectedPlatform}
      />

      <TelegramSection
        link={telegram.link}
        botUsername={telegram.botUsername}
        isConfigured={telegram.isConfigured}
      />

      {/* Must be a direct child of <s-page> (not nested inside the <form>
          above) — slot assignment for web components only picks up
          slot="aside" on direct children of the shadow host. */}
      <s-section slot="aside" heading="Setup">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Click &ldquo;Add to theme&rdquo; above to open the theme editor with the AI
            Chat Widget block ready to enable on your storefront. On a headless
            storefront (Hydrogen, Oxygen, or your own framework) use the
            &ldquo;Headless storefront&rdquo; card instead — the theme editor
            has nothing to add the widget to.
          </s-paragraph>
          <s-paragraph>
            The Gemini API key is configured via the{" "}
            <s-text type="strong">GEMINI_API_KEY</s-text> environment
            variable, not here — it&rsquo;s never exposed to shoppers.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
