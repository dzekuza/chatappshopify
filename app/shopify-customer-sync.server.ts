import { waitUntil } from "@vercel/functions";

// Keeps a Shopify Customer record in sync with the contact details a
// shopper gives the chat widget to start a conversation (apps.chat-widget.chat.tsx
// already requires name + a valid email before it creates a Conversation row
// — see its "Name and a valid email address are required" gate). Needs the
// write_customers scope (see shopify.app.*.toml).
//
// This is never worth failing or slowing down a shopper's chat over — same
// reasoning and pattern as telegram.server.ts's `background()` helper, kept
// local here rather than shared since each caller's error-logging prefix
// differs and there's only two of these in the codebase so far.
function background(task: Promise<unknown>) {
  const swallowed = task.catch((error) => {
    console.error("Shopify customer sync failed:", error);
  });
  try {
    waitUntil(swallowed);
  } catch {
    // Not running on Vercel (local dev, or outside a request context) — the
    // promise still settles, it just isn't tracked.
  }
}

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CustomerContact = {
  name: string;
  email: string;
  phone: string | null;
};

type CustomerUserError = { field?: string[] | null; message: string };

function splitName(fullName: string): { firstName: string; lastName?: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1),
  };
}

function phoneFieldRejected(userErrors: CustomerUserError[]): boolean {
  return userErrors.some((e) =>
    (e.field ?? []).some((f) => f.toLowerCase().includes("phone")),
  );
}

async function findCustomerIdByEmail(
  admin: AdminGraphqlClient,
  email: string,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
      query FindCustomerByEmail($query: String!) {
        customers(first: 1, query: $query) {
          nodes { id }
        }
      }`,
    { variables: { query: `email:${JSON.stringify(email)}` } },
  );
  const json = await response.json();
  return json?.data?.customers?.nodes?.[0]?.id ?? null;
}

async function createCustomer(
  admin: AdminGraphqlClient,
  contact: CustomerContact,
  includePhone: boolean,
): Promise<{ id: string | null; userErrors: CustomerUserError[] }> {
  const { firstName, lastName } = splitName(contact.name);
  const response = await admin.graphql(
    `#graphql
      mutation CreateChatWidgetCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        input: {
          firstName,
          lastName,
          email: contact.email,
          phone: includePhone ? contact.phone : null,
          tags: ["AI Chat Widget"],
        },
      },
    },
  );
  const json = await response.json();
  return {
    id: json?.data?.customerCreate?.customer?.id ?? null,
    userErrors: json?.data?.customerCreate?.userErrors ?? [],
  };
}

/**
 * Create a Shopify Customer for the shopper who just started a chat
 * conversation, tagged "AI Chat Widget" so a merchant can tell these apart
 * from customers created any other way. Runs in the background (see
 * `background()` above) — never awaited by the chat route, never blocks or
 * fails a shopper's reply.
 *
 * Deliberately CREATE-ONLY, never update: the widget is an unauthenticated
 * storefront endpoint (authenticate.public.appProxy verifies the request
 * came from this shop's storefront, not who's typing into it) — anyone can
 * type any name/phone alongside a real customer's email with no proof they
 * own it. Looked up by email first only to skip silently when a customer
 * already exists, never to overwrite their name/phone with unverified
 * widget input (security review, 2026-11-03 — see decisions-log ADR-0003).
 */
export function syncShopifyCustomer(
  admin: AdminGraphqlClient,
  contact: CustomerContact,
) {
  background(
    (async () => {
      const existingId = await findCustomerIdByEmail(admin, contact.email);
      // Also skip (rather than attempt a create that'll just collide) if the
      // lookup itself failed and we can't tell — `findCustomerIdByEmail`
      // only returns null for "confirmed not found" vs. a thrown error,
      // which propagates to `background()`'s own catch instead.
      if (existingId) return;

      let { id, userErrors } = await createCustomer(admin, contact, true);
      if (!id && userErrors.length > 0 && phoneFieldRejected(userErrors) && contact.phone) {
        ({ id, userErrors } = await createCustomer(admin, contact, false));
      }
      if (!id && userErrors.length > 0) {
        console.error("customerCreate userErrors:", userErrors);
      }
    })(),
  );
}
