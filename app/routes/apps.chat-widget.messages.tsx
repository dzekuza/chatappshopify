import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveStorefrontCorsOrigin, withCors } from "../cors.server";

// Polled by the storefront widget while a chat panel is open so a merchant's
// admin reply (see app.activity.$conversationId.tsx) shows up for the
// shopper without them needing to refresh. Returns "agent" messages — the
// shopper's own messages and the AI's replies are already rendered
// client-side as they're sent — plus the conversation's current
// needsHuman/aiPaused state, so the widget's "connecting you with a team
// member" / "a team member has joined" status (see
// conversation-handoff.server.ts) stays in sync even across a page reload,
// not just from the one-off AICW_HANDOFF sentinel on the reply that
// requested it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const corsOrigin = await resolveStorefrontCorsOrigin(request, session.shop);

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId")?.trim();
  const sinceParam = url.searchParams.get("since");

  if (!conversationId) {
    return withCors(
      Response.json({ messages: [], needsHuman: false, aiPaused: false }),
      corsOrigin,
    );
  }

  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  const [messages, conversation] = await Promise.all([
    prisma.chatMessage.findMany({
      where: {
        shop: session.shop,
        conversationId,
        role: "agent",
        createdAt: { gt: isNaN(since.getTime()) ? new Date(0) : since },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.conversation.findUnique({
      where: { shop_conversationId: { shop: session.shop, conversationId } },
      select: { needsHuman: true, aiPaused: true },
    }),
  ]);

  return withCors(
    Response.json({
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
      })),
      needsHuman: conversation?.needsHuman ?? false,
      aiPaused: conversation?.aiPaused ?? false,
    }),
    corsOrigin,
  );
};
