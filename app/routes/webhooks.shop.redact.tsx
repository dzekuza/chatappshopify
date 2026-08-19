import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  // Sent ~48h after uninstall. Erase all shop-scoped data.
  await db.chatMessage.deleteMany({ where: { shop } });
  await db.conversation.deleteMany({ where: { shop } });
  await db.knowledgeEntry.deleteMany({ where: { shop } });
  await db.widgetSettings.deleteMany({ where: { shop } });

  return new Response();
};
