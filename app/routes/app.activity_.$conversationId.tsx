import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigation, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  if (conversation.needsHuman) {
    await prisma.conversation.update({
      where: { shop_conversationId: { shop: session.shop, conversationId } },
      data: { needsHuman: false },
    });
  }

  return Response.json({ ok: true });
};

export default function ActivityThread() {
  const { conversationId, conversation, messages } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isReplying =
    navigation.state === "submitting" &&
    navigation.formAction?.endsWith(`/app/activity/${conversationId}`);

  return (
    <s-page heading={conversation?.customerName || "Conversation"}>
      <s-link slot="breadcrumb-actions" href="/app/activity">
        Activity
      </s-link>

      {conversation?.needsHuman ? (
        <s-banner heading="Needs attention" tone="warning">
          This shopper asked to talk to a human. Reply below to resolve it.
        </s-banner>
      ) : null}

      <s-section heading="Messages">
        {messages.length === 0 ? (
          <s-paragraph>This conversation could not be found.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {messages.map((m) => (
              <s-box
                key={m.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                {...(m.role !== "user" ? { background: "subdued" } : {})}
              >
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-badge tone={roleTone(m.role)}>{roleLabel(m.role)}</s-badge>
                    <s-text color="subdued">{formatTime(m.createdAt)}</s-text>
                  </s-stack>
                  <s-paragraph>{m.content}</s-paragraph>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Reply">
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
            <s-button type="submit" variant="primary" disabled={isReplying}>
              {isReplying ? "Sending…" : "Send reply"}
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Contact">
        <s-stack direction="block" gap="base">
          {conversation?.customerName ? (
            <s-text type="strong">{conversation.customerName}</s-text>
          ) : (
            <s-paragraph>No contact details on file.</s-paragraph>
          )}
          {conversation?.customerEmail ? (
            <s-link href={`mailto:${conversation.customerEmail}`}>
              {conversation.customerEmail}
            </s-link>
          ) : null}
          {conversation?.customerPhone ? (
            <s-text>{conversation.customerPhone}</s-text>
          ) : null}
          <s-text color="subdued">{conversationId}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
