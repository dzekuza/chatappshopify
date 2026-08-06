import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Fetched once by the storefront widget when it opens with a conversationId
// already in sessionStorage, so a page reload mid-chat resumes the visible
// conversation instead of silently starting over — the backend already kept
// every message, only the client-side render/history array was ephemeral.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();

  if (!conversationId) {
    return Response.json({ messages: [] });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { shop: session.shop, conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return Response.json({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
};
