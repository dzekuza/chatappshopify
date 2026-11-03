import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useNavigation,
  useFetcher,
  Form,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { markHumanTookOver } from "../conversation-handoff.server";
import { TimestampedVideo } from "../components/timestamped-video";
import { ChatMessageBody } from "../components/chat-message-body";

function formatTime(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roleLabel(role: string) {
  if (role === "assistant") return "AI";
  if (role === "agent") return "You";
  return "Shopper";
}

function roleTone(role: string) {
  if (role === "assistant") return "info";
  if (role === "agent") return "success";
  return "auto";
}

const URL_PATTERN = /https?:\/\/\S+/g;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

function mediaTypeForUrl(url: string): "image" | "video" | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return "video";
  return null;
}

// Knowledge-entry answers can embed a Shopify CDN media URL straight in the
// AI's reply text (see KnowledgeEntry.mediaUrl) — surface it as an actual
// preview instead of a raw link, and drop it from the displayed text so it
// isn't shown twice.
function splitMessageMedia(content: string) {
  const urls = content.match(URL_PATTERN) ?? [];
  const media = urls
    .map((url) => ({ url, type: mediaTypeForUrl(url) }))
    .filter((m): m is { url: string; type: "image" | "video" } => m.type !== null);

  let text = content;
  for (const m of media) {
    text = text.replace(m.url, "");
  }
  text = text.replace(/\s+/g, " ").trim();

  return { text, media };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId as string;

  const [conversation, messages] = await Promise.all([
    prisma.conversation.findUnique({
      where: { shop_conversationId: { shop: session.shop, conversationId } },
    }),
    prisma.chatMessage.findMany({
      where: { shop: session.shop, conversationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { conversationId, conversation, messages };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId as string;

  const conversation = await prisma.conversation.findUnique({
    where: { shop_conversationId: { shop: session.shop, conversationId } },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const formData = await request.formData();

  if (formData.get("intent") === "resumeAi") {
    await prisma.conversation.update({
      where: { shop_conversationId: { shop: session.shop, conversationId } },
      data: { aiPaused: false },
    });
    return Response.json({ ok: true });
  }

  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return Response.json({ error: "Reply can't be empty" }, { status: 400 });
  }

  await prisma.chatMessage.create({
    data: {
      shop: session.shop,
      conversationId,
      role: "agent",
      content,
    },
  });

  // A human has now joined this conversation — the AI stops answering it
  // until the merchant explicitly resumes it above.
  await markHumanTookOver(session.shop, conversationId);

  return Response.json({ ok: true });
};

export default function ActivityThread() {
  const { conversationId, conversation, messages } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const resumeAiFetcher = useFetcher();
  const isResumingAi = resumeAiFetcher.state !== "idle";
  const isReplying =
    navigation.state === "submitting" &&
    navigation.formAction?.endsWith(`/app/activity/${conversationId}`);

  // No polling here — app.activity.tsx's poll already revalidates this
  // route's loader too, since it's always mounted alongside this one as
  // its <Outlet /> child.

  // Content only — this route nests under app.activity.tsx's <Outlet />,
  // which already owns the <s-page> and the conversation list in the left
  // column, so this is just the right-hand chat panel.
  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="block" gap="small-200">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text type="strong">
            {conversation?.customerName || "Conversation"}
          </s-text>
          {conversation?.customerEmail ? (
            <s-link href={`mailto:${conversation.customerEmail}`}>
              {conversation.customerEmail}
            </s-link>
          ) : null}
          {conversation?.customerPhone ? (
            <s-text color="subdued">{conversation.customerPhone}</s-text>
          ) : null}
        </s-stack>
        <s-text color="subdued">{conversationId}</s-text>
      </s-stack>

      {conversation?.needsHuman ? (
        <s-banner heading="Needs attention" tone="warning">
          This shopper asked to talk to a human. Reply below to resolve it.
        </s-banner>
      ) : null}

      {conversation?.aiPaused ? (
        <s-banner heading="AI replies paused" tone="info">
          <s-stack direction="block" gap="small">
            <s-paragraph>
              A team member has joined this conversation, so the AI won&apos;t
              reply to this shopper until you resume it.
            </s-paragraph>
            <resumeAiFetcher.Form method="post">
              <input type="hidden" name="intent" value="resumeAi" />
              <s-button
                type="submit"
                disabled={isResumingAi}
                {...(isResumingAi ? { loading: true } : {})}
              >
                {isResumingAi ? "Resuming…" : "Resume AI"}
              </s-button>
            </resumeAiFetcher.Form>
          </s-stack>
        </s-banner>
      ) : null}

      {messages.length === 0 ? (
        <s-paragraph>This conversation could not be found.</s-paragraph>
      ) : (
        <s-scroll-box
          maxBlockSize="480px"
          accessibilityLabel="Messages"
          accessibilityRole="region"
        >
          <s-stack direction="block" gap="base">
            {messages.map((m) => {
              const { text, media } = splitMessageMedia(m.content);
              return (
                <s-box
                  key={m.id}
                  padding="base"
                  border="base"
                  borderRadius="base"
                  {...(m.role !== "user" ? { background: "subdued" } : {})}
                >
                  <s-stack direction="block" gap="small">
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-badge tone={roleTone(m.role)}>{roleLabel(m.role)}</s-badge>
                      <s-text color="subdued">{formatTime(m.createdAt)}</s-text>
                    </s-stack>
                    {text ? <ChatMessageBody text={text} /> : null}
                    {media.map((m2) =>
                      m2.type === "image" ? (
                        <s-box
                          key={m2.url}
                          maxInlineSize="240px"
                          borderRadius="base"
                          overflow="hidden"
                        >
                          <s-image src={m2.url} alt="" inlineSize="fill" />
                        </s-box>
                      ) : (
                        <TimestampedVideo key={m2.url} src={m2.url} width={240} />
                      ),
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        </s-scroll-box>
      )}

      <Form method="post" key={messages.length}>
        <s-stack direction="block" gap="base">
          <s-text-area
            name="content"
            label="Message"
            labelAccessibilityVisibility="exclusive"
            placeholder="Reply to this shopper — they'll see it in the chat widget."
            rows={3}
            disabled={isReplying}
          />
          <s-button
            type="submit"
            variant="primary"
            icon="send"
            disabled={isReplying}
            {...(isReplying ? { loading: true } : {})}
          >
            {isReplying ? "Sending…" : "Send reply"}
          </s-button>
        </s-stack>
      </Form>
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
