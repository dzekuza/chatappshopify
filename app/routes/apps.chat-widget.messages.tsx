import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Polled by the storefront widget while a chat panel is open so a merchant's
// admin reply (see app.activity_.$conversationId.tsx) shows up for the
// shopper without them needing to refresh. Only ever returns "agent"
// messages — the shopper's own messages and the AI's replies are already
// rendered client-side as they're sent.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();
  const sinceParam = url.searchParams.get("since");

  if (!conversationId) {
    return Response.json({ messages: [] });
  }

  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  const messages = await prisma.chatMessage.findMany({
    where: {
      shop: session.shop,
      conversationId,
      role: "agent",
      createdAt: { gt: isNaN(since.getTime()) ? new Date(0) : since },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return Response.json({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
};
