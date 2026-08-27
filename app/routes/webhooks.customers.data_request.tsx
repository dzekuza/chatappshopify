import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

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
    });

    const conversationIds = conversations.map((c) => c.conversationId);
    const messages = conversationIds.length
      ? await db.chatMessage.findMany({
          where: { shop, conversationId: { in: conversationIds } },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // Mandatory GDPR webhook: gather every record this app holds for the
    // requested customer so support can deliver it to the store owner
    // within the 30-day window. No automated delivery channel exists yet —
    // this structured payload is the retrievable export until one does.
    console.log(
      `[GDPR data_request] shop=${shop} conversations=${conversationIds.length} messages=${messages.length}`,
      JSON.stringify({ conversations, messages }),
    );
  } else {
    console.log(`[GDPR data_request] shop=${shop}: no email/phone on payload, nothing to export`);
  }

  return new Response();
};
