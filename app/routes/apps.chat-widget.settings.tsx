import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveStorefrontCorsOrigin, withCors } from "../cors.server";
import { publicProactiveRules } from "../proactive";
import { parseQuestions, publicWorkflow } from "../workflows";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });

  // Reuses the row already loaded above, so a headless storefront's settings
  // fetch costs no extra query to work out whether its origin is allowed.
  const corsOrigin = await resolveStorefrontCorsOrigin(
    request,
    session.shop,
    settings?.storefrontOrigins,
  );

  if (!settings) {
    return withCors(Response.json({ enabled: false }), corsOrigin);
  }

  const workflows = await prisma.workflow.findMany({
    where: { shop: session.shop, enabled: true },
    orderBy: { position: "asc" },
  });

  return withCors(
    Response.json({
    enabled: settings.enabled,
    welcomeMessage: settings.welcomeMessage,
    primaryColor: settings.primaryColor,
    position: settings.position,
    iconUrl: settings.iconUrl,
    headerTitle: settings.headerTitle,
      cornerStyle: settings.cornerStyle,
      // Disabled rules are stripped server-side — merchant copy for a rule
      // that is switched off shouldn't be readable in the page source.
      proactiveEnabled: settings.proactiveEnabled,
      proactiveRules: settings.proactiveEnabled
        ? publicProactiveRules(settings.proactiveRules)
        : [],
      workflows: workflows.map((w) =>
        publicWorkflow({
          id: w.id,
          title: w.title,
          topicLabel: w.topicLabel,
          description: w.description,
          enabled: w.enabled,
          position: w.position,
          questions: parseQuestions(w.questions),
        }),
      ),
    }),
    corsOrigin,
  );
};
