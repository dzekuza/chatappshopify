import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  // Mandatory GDPR webhook. This app stores shopper name/email/phone and chat
  // messages tied to a shop + conversationId (see Conversation/ChatMessage in
  // prisma/schema.prisma) — respond to data requests via support, no
  // automated export exists yet.

  return new Response();
};
