import { useState, type CSSProperties, type ReactNode } from "react";
import styles from "../../styles/chat-widget-preview.module.css";
import type { KnowledgeCollection } from "./knowledge-sync-section";

type PreviewMessage = { role: "user" | "assistant"; content: string };

export type ChatPreviewProps = {
  position: string;
  primaryColor: string;
  welcomeMessage: string;
  iconUrl: string | null;
  headerTitle: string;
  cornerStyle: string;
  shopName: string;
  systemPrompt: string;
  geminiModel: string;
  language: string;
  knowledgeCollections: KnowledgeCollection[];
};

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

function contrastColor(hex: string) {
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
}

export function ChatPreview({
  position,
  primaryColor,
  welcomeMessage,
  iconUrl,
  headerTitle,
  cornerStyle,
  shopName,
  systemPrompt,
  geminiModel,
  language,
  knowledgeCollections,
}: ChatPreviewProps) {
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isPreviewSending, setIsPreviewSending] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
          systemPrompt,
          geminiModel,
          language,
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

      for (;;) {
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

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Live preview</s-text>
      <s-paragraph>
        This mirrors exactly what a shopper sees on your storefront —
        click the bubble to open it.
      </s-paragraph>
      <div
        className={
          position === "bottom-left"
            ? `${styles.previewStage} ${styles.previewStageLeft}`
            : styles.previewStage
        }
        style={
          {
            "--aicw-preview-color": primaryColor || "#1a1a1a",
            "--aicw-preview-color-contrast": contrastColor(primaryColor),
            "--aicw-preview-radius": cornerStyle === "square" ? "8px" : "20px",
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
              <p className={styles.previewHeaderTitle}>
                {headerTitle || "Chat with us"}
              </p>
              <p className={styles.previewHeaderSubtitle}>
                {welcomeMessage || "How can I help you today?"}
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
                    Ask a question below to see how your assistant responds.
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
                        : isPreviewSending && index === previewMessages.length - 1
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
                onChange={(event) => setPreviewInput(event.currentTarget.value)}
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
            <BubbleIcon iconUrl={iconUrl} />
          </button>
        </div>
      <p className={styles.previewFooter}>
        Preview only — nothing here is saved or shown to shoppers.
      </p>
    </s-stack>
  );
}
