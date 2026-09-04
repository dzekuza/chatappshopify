import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncCatalog } from "../catalog-sync.server";

// Resource route backing the "Sync catalogue" button on the Knowledge page.
// Runs synchronously — it's a merchant-initiated click with its own loading
// state — and syncCatalog records its own failure state, so a thrown error
// still leaves the row readable rather than stuck on "running".
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    await syncCatalog(session.shop, admin);
  } catch {
    // Swallowed deliberately: syncCatalog already wrote status "failed" and
    // lastError, which the UI renders. Rethrowing would surface a generic
    // route error boundary instead of the specific reason.
  }

  const catalogSync = await prisma.catalogSync.findUnique({
    where: { shop: session.shop },
  });

  return { catalogSync };
};
