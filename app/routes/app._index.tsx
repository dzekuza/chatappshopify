import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
import styles from "../styles/chat-widget-preview.module.css";

const GEMINI_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, low cost)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (higher quality)" },
];

const POSITIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

const LANGUAGES = [
  { value: "auto", label: "Match the shopper's language" },
  { value: "en", label: "English" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "et", label: "Estonian" },
  { value: "pl", label: "Polish" },
  { value: "de", label: "German" },
  { value: "ru", label: "Russian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
];

type KnowledgeCollection = { id: string; title: string; handle: string };

// uid from extensions/ai-chat-widget/shopify.extension.toml + the block's
// filename (without .liquid), used to deep-link into the theme editor.
const THEME_EXTENSION_UID = "45c51f62-01cb-9718-b977-78f5108db8351ae77f7a";
const THEME_BLOCK_HANDLE = "chat_widget";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const settings = await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  const { appSubscriptions } = await billing.check({
    plans: [MONTHLY_PLAN, PRO_PLAN],
  });
  const isProPlan = appSubscriptions.some((sub) => sub.name === PRO_PLAN);

  const addToThemeUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${THEME_EXTENSION_UID}/${THEME_BLOCK_HANDLE}`;
  const shopName = session.shop.replace(/\.myshopify\.com$/, "");

  return { settings, addToThemeUrl, shopName, isProPlan };
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
  const geminiModel = String(payload.geminiModel ?? "gemini-2.5-flash");
  // Bring-your-own API key is a Pro plan feature — silently ignore it for
  // other plans rather than trusting the client-side gate.
  const geminiApiKey = isProPlan
    ? String(payload.geminiApiKey ?? "").trim() || null
    : null;
  const language = LANGUAGES.some((l) => l.value === payload.language)
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

  const settings = await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: {
      enabled,
      welcomeMessage,
      systemPrompt,
      primaryColor,
      iconUrl,
      position,
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
      geminiModel,
      geminiApiKey,
      language,
      knowledgeCollections,
    },
  });

  return { settings };
};

type PreviewMessage = { role: "user" | "assistant"; content: string };

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
      <path
        d="M20 11a8 8 0 10-2.34 5.66M20 5v6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
      <path
        d="M12 19V5m0 0l-6 6m6-6l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
      <path
        d="M4 4h16v12H7l-3 3V4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeDasharray="3 3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BubbleIcon({ iconUrl }: { iconUrl?: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className={styles.previewBubbleIcon} />;
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" width="26" height="26" aria-hidden="true">
      <path
        d="M4 4h16v12H7l-3 3V4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

// Matches a "Video: <url>" / "Image: <url>" line whole (as the knowledge
// base prompt instructs the model to emit) so the label doesn't leak into
// the rendered text — the model doesn't always drop the label even though
// it's only supposed to echo the bare URL.
const LABELED_MEDIA_LINE_REGEX = /^[ \t]*(?:Video|Image)[ \t]*:[ \t]*(https?:\/\/\S+)[ \t]*$/im;
const VIDEO_EXT_REGEX = /\.(?:mp4|mov|webm|m3u8)(?:\?|$)/i;
const IMAGE_EXT_REGEX = /\.(?:jpe?g|png|gif|webp|svg)(?:\?|$)/i;
const VIDEO_URL_REGEX = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)(?:\?\S*)?/i;
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpe?g|png|gif|webp|svg)(?:\?\S*)?/i;

type ExtractedMedia = {
  url: string;
  isVideo: boolean;
  matchText: string;
  index: number;
};

function extractMedia(text: string): ExtractedMedia | null {
  const labeled = text.match(LABELED_MEDIA_LINE_REGEX);
  if (labeled) {
    const url = labeled[1];
    const isVideo = VIDEO_EXT_REGEX.test(url);
    const isImage = !isVideo && IMAGE_EXT_REGEX.test(url);
    if (isVideo || isImage) {
      return { url, isVideo, matchText: labeled[0], index: labeled.index ?? 0 };
    }
  }
  const video = text.match(VIDEO_URL_REGEX);
  if (video) {
    return { url: video[0], isVideo: true, matchText: video[0], index: video.index ?? 0 };
  }
  const image = text.match(IMAGE_URL_REGEX);
  if (image) {
    return { url: image[0], isVideo: false, matchText: image[0], index: image.index ?? 0 };
  }
  return null;
}

// Minimal **bold** support, applied within a single line/paragraph.
function renderInlineFormatted(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.slice(0, 2) === "**" && part.slice(-2) === "**" && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}

// Minimal markdown: paragraphs plus "* "/"- " bullet lists, each line
// supporting **bold**.
function renderFormattedBlock(text: string): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          <li key={key++}>{renderInlineFormatted(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>,
        );
        i++;
      }
      nodes.push(
        <ul key={key++} className={styles.previewMessageList}>
          {items}
        </ul>,
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      nodes.push(
        <p key={key++} className={styles.previewMessageParagraph}>
          {renderInlineFormatted(line)}
        </p>,
      );
      i++;
    }
  }
  return nodes;
}

function renderMessageBody(content: string) {
  const media = extractMedia(content);
  if (!media) return renderFormattedBlock(content);

  const remainder = (
    content.slice(0, media.index) + content.slice(media.index + media.matchText.length)
  ).trim();

  return (
    <>
      {remainder ? <div>{renderFormattedBlock(remainder)}</div> : null}
      {media.isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- merchant-uploaded videos have no caption track
        <video
          src={media.url}
          controls
          playsInline
          className={styles.previewMessageVideo}
        />
      ) : (
        <img src={media.url} alt="" className={styles.previewMessageImage} />
      )}
    </>
  );
}

export default function Index() {
  const { settings, addToThemeUrl, shopName, isProPlan } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [form, setForm] = useState(settings);
  const isSaving = fetcher.state !== "idle";
  const [isSyncingCollections, setIsSyncingCollections] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [iconUploadError, setIconUploadError] = useState<string | null>(null);

  const knowledgeCollections: KnowledgeCollection[] = Array.isArray(
    form.knowledgeCollections,
  )
    ? (form.knowledgeCollections as unknown as KnowledgeCollection[])
    : [];

  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isPreviewSending, setIsPreviewSending] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const contrastColor = (hex: string) => {
    let value = (hex || "").replace("#", "");
    if (value.length === 3) {
      value = value
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (value.length !== 6) return "#ffffff";
    const r = parseInt(value.substring(0, 2), 16);
    const g = parseInt(value.substring(2, 4), 16);
    const b = parseInt(value.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  };

  const resetPreview = () => {
    setPreviewMessages([]);
  };

  const sendPreviewMessage = async () => {
    const text = previewInput.trim();
    if (!text || isPreviewSending) return;

    const nextHistory: PreviewMessage[] = [
      ...previewMessages,
      { role: "user", content: text },
    ];
    setPreviewMessages(nextHistory);
    setPreviewInput("");
    setIsPreviewSending(true);
    setPreviewMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/app/chat-widget/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory,
          systemPrompt: form.systemPrompt,
          geminiModel: form.geminiModel,
          language: form.language,
          knowledgeCollections,
        }),
      });

      if (!response.ok || !response.body) {
        const errorText = (await response.text()) || "Something went wrong.";
        setPreviewMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: errorText };
          return copy;
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        full += decoder.decode(chunk.value, { stream: true });
        const textSoFar = full;
        setPreviewMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: textSoFar };
          return copy;
        });
      }
    } catch (err) {
      setPreviewMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        };
        return copy;
      });
    } finally {
      setIsPreviewSending(false);
    }
  };

  useEffect(() => {
    if (fetcher.data?.settings && fetcher.state === "idle") {
      shopify.toast.show("Settings saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const syncCollections = async () => {
    setIsSyncingCollections(true);
    try {
      const selected = await shopify.resourcePicker({
        type: "collection",
        action: "select",
        multiple: true,
        selectionIds: knowledgeCollections.map((c) => ({ id: c.id })),
      });
      if (!selected) return;
      const next: KnowledgeCollection[] = selected.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
      }));
      update("knowledgeCollections", next as unknown as typeof form.knowledgeCollections);
    } finally {
      setIsSyncingCollections(false);
    }
  };

  const removeCollection = (id: string) => {
    update(
      "knowledgeCollections",
      knowledgeCollections.filter((c) => c.id !== id) as unknown as typeof form.knowledgeCollections,
    );
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
      update("iconUrl", data.url as typeof form.iconUrl);
    } catch (err) {
      setIconUploadError("Could not upload icon.");
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const removeIcon = () => {
    setIconUploadError(null);
    update("iconUrl", null as unknown as typeof form.iconUrl);
  };

  const handleSave = () => {
    fetcher.submit(JSON.stringify(form), {
      method: "POST",
      encType: "application/json",
    });
  };

  return (
    <s-page heading="AI Chat Widget">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isSaving ? { loading: true } : {})}
      >
        Save
      </s-button>
      <s-button slot="secondary-actions" href={addToThemeUrl} target="_blank">
        Add to theme
      </s-button>

      <s-section heading="Widget">
        <s-stack direction="block" gap="base">
          <s-switch
            label="Enable chat widget on storefront"
            {...(form.enabled ? { checked: true } : {})}
            onChange={(event: any) =>
              update("enabled", event.currentTarget.checked)
            }
          />
          <s-text-field
            label="Welcome message"
            value={form.welcomeMessage}
            details="Shown when a shopper first opens the widget."
            onChange={(event: any) =>
              update("welcomeMessage", event.currentTarget.value)
            }
          />
          <s-text-area
            label="Assistant persona / instructions"
            value={form.systemPrompt}
            rows={5}
            details="Tells the AI how to behave. It can also look up real product data from your store."
            onChange={(event: any) =>
              update("systemPrompt", event.currentTarget.value)
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Appearance">
        <s-stack direction="block" gap="base">
          <s-color-field
            label="Brand color"
            value={form.primaryColor}
            onChange={(event: any) =>
              update("primaryColor", event.currentTarget.value)
            }
          />
          <s-stack direction="block" gap="small-200">
            <s-text color="subdued">Launcher icon</s-text>
            {form.iconUrl ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-thumbnail src={form.iconUrl} alt="Widget icon" size="small" />
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={removeIcon}
                  {...(isUploadingIcon ? { disabled: true } : {})}
                >
                  Remove icon
                </s-button>
              </s-stack>
            ) : (
              <s-drop-zone
                accept="image/*"
                label="Upload icon"
                accessibilityLabel="Upload a custom launcher icon"
                {...(isUploadingIcon ? { disabled: true } : {})}
                onChange={(event: any) => {
                  const file = event.currentTarget.files?.[0];
                  if (file instanceof File) uploadIcon(file);
                }}
              />
            )}
            {isUploadingIcon ? (
              <s-paragraph tone="neutral" color="subdued">
                Uploading…
              </s-paragraph>
            ) : null}
            {iconUploadError ? (
              <s-paragraph tone="critical">{iconUploadError}</s-paragraph>
            ) : (
              <s-paragraph tone="neutral" color="subdued">
                Replaces the default chat-bubble icon on the launcher button.
                PNG or SVG recommended, up to 2MB.
              </s-paragraph>
            )}
          </s-stack>
          <s-select
            label="Position"
            value={form.position}
            onChange={(event: any) =>
              update("position", event.currentTarget.value)
            }
          >
            {POSITIONS.map((p) => (
              <s-option key={p.value} value={p.value}>
                {p.label}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="AI model">
        <s-stack direction="block" gap="base">
          <s-select
            label="Gemini model"
            value={form.geminiModel}
            onChange={(event: any) =>
              update("geminiModel", event.currentTarget.value)
            }
          >
            {GEMINI_MODELS.map((m) => (
              <s-option key={m.value} value={m.value}>
                {m.label}
              </s-option>
            ))}
          </s-select>
          <s-select
            label="Reply language"
            value={form.language}
            details="Controls what language the assistant replies in, regardless of the storefront's default language."
            onChange={(event: any) =>
              update("language", event.currentTarget.value)
            }
          >
            {LANGUAGES.map((l) => (
              <s-option key={l.value} value={l.value}>
                {l.label}
              </s-option>
            ))}
          </s-select>
          {isProPlan ? (
            <s-text-field
              label="Your own Gemini API key (Pro plan)"
              details="Requests use your own Gemini quota instead of the app's shared key. Leave blank to fall back to the shared key."
              value={form.geminiApiKey ?? ""}
              onChange={(event: any) =>
                update("geminiApiKey", event.currentTarget.value)
              }
            />
          ) : (
            <s-banner tone="info" heading="Bring your own Gemini API key">
              <s-paragraph>
                Upgrade to the Pro plan to use your own Gemini API key instead
                of the app's shared key.
              </s-paragraph>
              <s-button slot="secondary-actions" href="/app/plans">
                View plans
              </s-button>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Knowledge">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Sync specific collections so the assistant only recommends
            products from them. Leave empty to search your entire catalog.
          </s-paragraph>
          <s-button
            onClick={syncCollections}
            {...(isSyncingCollections ? { loading: true } : {})}
          >
            Sync collections
          </s-button>
          {knowledgeCollections.length > 0 ? (
            <s-stack direction="inline" gap="small-200">
              {knowledgeCollections.map((c) => (
                <s-clickable-chip
                  key={c.id}
                  removable
                  accessibilityLabel={`Remove ${c.title}`}
                  onRemove={() => removeCollection(c.id)}
                >
                  {c.title}
                </s-clickable-chip>
              ))}
            </s-stack>
          ) : (
            <s-paragraph tone="neutral" color="subdued">
              No collections synced — the assistant can recommend from any
              product in your store.
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Test widget">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            This mirrors exactly what a shopper sees on your storefront —
            click the bubble to open it.
          </s-paragraph>
          <div
            className={
              form.position === "bottom-left"
                ? `${styles.previewStage} ${styles.previewStageLeft}`
                : styles.previewStage
            }
            style={
              {
                "--aicw-preview-color": form.primaryColor || "#1a1a1a",
                "--aicw-preview-color-contrast": contrastColor(
                  form.primaryColor,
                ),
              } as CSSProperties
            }
          >
            <div
              className={
                isPreviewOpen
                  ? `${styles.previewPanel} ${styles.previewPanelOpen}`
                  : styles.previewPanel
              }
            >
              <div className={styles.previewHeader}>
                <div>
                  <p className={styles.previewHeaderTitle}>Chat with us</p>
                  <p className={styles.previewHeaderSubtitle}>
                    {form.welcomeMessage || "How can I help you today?"}
                  </p>
                </div>
                <div className={styles.previewHeaderActions}>
                  <button
                    type="button"
                    className={styles.previewIconButton}
                    onClick={resetPreview}
                    disabled={isPreviewSending || previewMessages.length === 0}
                    aria-label="Reset conversation"
                    title="Reset conversation"
                  >
                    <RefreshIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.previewIconButton}
                    onClick={() => setIsPreviewOpen(false)}
                    aria-label="Close chat"
                    title="Close chat"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <div className={styles.previewBody}>
                {previewMessages.length === 0 ? (
                  <div className={styles.previewEmptyState}>
                    <div className={styles.previewEmptyIcon}>
                      <EmptyChatIcon />
                    </div>
                    <p className={styles.previewEmptyTitle}>
                      {greetingForNow()}, {shopName}!
                    </p>
                    <p className={styles.previewEmptySubtitle}>
                      Ask a question below to see how your assistant
                      responds.
                    </p>
                  </div>
                ) : (
                  <div className={styles.previewMessages}>
                    {previewMessages.map((message, index) => (
                      <div
                        key={index}
                        className={
                          message.role === "user"
                            ? `${styles.previewMessage} ${styles.previewMessageUser}`
                            : `${styles.previewMessage} ${styles.previewMessageAssistant}`
                        }
                      >
                        {message.content
                          ? renderMessageBody(message.content)
                          : isPreviewSending &&
                              index === previewMessages.length - 1
                            ? "…"
                            : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form
                className={styles.previewInputArea}
                onSubmit={(event) => {
                  event.preventDefault();
                  sendPreviewMessage();
                }}
              >
                <textarea
                  className={styles.previewTextarea}
                  rows={1}
                  value={previewInput}
                  placeholder="Type a message..."
                  disabled={isPreviewSending}
                  onChange={(event) =>
                    setPreviewInput(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendPreviewMessage();
                    }
                  }}
                />
                <div className={styles.previewInputActions}>
                  <button
                    type="button"
                    className={styles.previewIconButton}
                    disabled
                    aria-label="Attachments not available in preview"
                    title="Attachments not available in preview"
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="submit"
                    className={styles.previewSendButton}
                    disabled={isPreviewSending || !previewInput.trim()}
                    aria-label="Send message"
                  >
                    <ArrowUpIcon />
                  </button>
                </div>
              </form>
            </div>

            <button
              type="button"
              className={styles.previewBubble}
              onClick={() => setIsPreviewOpen((open) => !open)}
              aria-label={isPreviewOpen ? "Close chat" : "Open chat"}
            >
              <BubbleIcon iconUrl={form.iconUrl} />
            </button>
          </div>
          <p className={styles.previewFooter}>
            Preview only — nothing here is saved or shown to shoppers.
          </p>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Setup">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Click "Add to theme" above to open the theme editor with the AI
            Chat Widget block ready to enable on your storefront.
          </s-paragraph>
          <s-paragraph>
            The Gemini API key is configured via the{" "}
            <s-text type="strong">GEMINI_API_KEY</s-text> environment
            variable, not here — it's never exposed to shoppers.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
