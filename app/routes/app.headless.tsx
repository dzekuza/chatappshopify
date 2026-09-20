import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseOriginsInput, parseStorefrontOrigins } from "../cors.server";
import type { StorefrontPlatform } from "../storefront.server";
import { buildHeadlessEmbed } from "../headless-embed.server";
import { HeadlessSection } from "../components/settings/headless-section";

// Saves the headless-storefront origin allowlist. Kept out of
// app.settings.tsx's action for the same reason app.telegram.tsx is: that one
// saves the whole widget-settings form as a single JSON payload behind the
// App Bridge save bar, and this card saves on its own.

const MAX_ORIGINS = 10;

// The dedicated "Install on headless" page — the same card Settings embeds,
// opened by default and reachable from the nav and Home, so a Hydrogen
// merchant doesn't have to know to look inside Settings for it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, catalogSync] = await Promise.all([
    prisma.widgetSettings.findUnique({
      where: { shop: session.shop },
      select: { storefrontOrigins: true },
    }),
    prisma.catalogSync.findUnique({
      where: { shop: session.shop },
      select: { platform: true },
    }),
  ]);

  const detectedPlatform: StorefrontPlatform =
    catalogSync?.platform === "headless" ||
    catalogSync?.platform === "online-store"
      ? catalogSync.platform
      : "unknown";
  return {
    embed: buildHeadlessEmbed(session.shop, process.env.SHOPIFY_APP_URL ?? ""),
    storefrontOrigins: parseStorefrontOrigins(settings?.storefrontOrigins),
    detectedPlatform,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const origins = parseOriginsInput(
    String(formData.get("storefrontOrigins") ?? ""),
  ).slice(0, MAX_ORIGINS);

  await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: { storefrontOrigins: origins },
    create: { shop: session.shop, storefrontOrigins: origins },
  });

  return Response.json({ ok: true, origins });
};

export default function InstallOnHeadless() {
  const { embed, storefrontOrigins, detectedPlatform } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Install on headless">
      <s-link slot="breadcrumb-actions" href="/app">
        Home
      </s-link>
      <HeadlessSection
        embed={embed}
        storefrontOrigins={storefrontOrigins}
        detectedPlatform={detectedPlatform}
        defaultExpanded
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
