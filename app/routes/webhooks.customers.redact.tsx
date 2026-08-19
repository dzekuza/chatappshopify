import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  const customer = payload.customer as { email?: string; phone?: string } | undefined;
  const email = customer?.email;
  const phone = customer?.phone;

  if (email || phone) {
    const conversations = await db.conversation.findMany({
      where: {
        shop,
        OR: [
          email ? { customerEmail: email } : undefined,
          phone ? { customerPhone: phone } : undefined,
        ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
      },
      select: { conversationId: true },
    });

    const conversationIds = conversations.map((c) => c.conversationId);

    if (conversationIds.length > 0) {
      await db.chatMessage.deleteMany({
        where: { shop, conversationId: { in: conversationIds } },
      });
      await db.conversation.deleteMany({
        where: { shop, conversationId: { in: conversationIds } },
      });
    }
  }

  return new Response();
};
