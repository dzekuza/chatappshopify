import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { generateKnowledgeSuggestions } from "../knowledge-suggestions.server";

// Resource route behind the "Analyze conversations" button on the Knowledge
// page. It's an action rather than a loader because it costs an AI call —
// it should only run when a merchant explicitly asks for it.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return generateKnowledgeSuggestions(session.shop);
};
