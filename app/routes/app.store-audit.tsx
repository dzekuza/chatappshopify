import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runStoreAudit } from "../store-audit.server";

// Resource route backing the "Refresh store audit" button in Settings.
// Runs synchronously (unlike the install-time afterAuth hook) since this is
// a merchant-initiated click that can show its own loading state, so there's
// no need for waitUntil here.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  await runStoreAudit(session.shop, admin);

  const audit = await prisma.storeAudit.findUnique({
    where: { shop: session.shop },
  });

  return { audit };
};
