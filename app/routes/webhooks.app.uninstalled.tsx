import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    try {
      await db.session.deleteMany({ where: { shop } });
    } catch (error) {
      // A bare throw here surfaces as a 500 with no shop context, which is
      // what a run of failed deliveries for one shop looked like. Shopify
      // retries on 5xx and the delete is idempotent, so still fail the
      // delivery — but say which shop and why first. The usual cause is the
      // Supabase pooler refusing the connection (DATABASE_URL pins
      // connection_limit=1 and the pool is shared with another deployment).
      console.error(
        `Failed to delete sessions for ${shop} after ${topic}:`,
        error,
      );
      throw error;
    }
  }

  return new Response();
};
