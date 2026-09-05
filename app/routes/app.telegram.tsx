import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  generateLinkCode,
  linkCodeExpiry,
  TELEGRAM_SCOPES,
  type TelegramScope,
} from "../telegram.server";

// Mutations for the Telegram notification card on the Settings page. Kept out
// of app.settings.tsx's action because that one saves the whole widget-settings
// form as a single JSON payload, and connecting a chat isn't a form field.

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "connect") {
    // Regenerating always issues a fresh code and drops any existing chat, so
    // a code that leaked can't be used to keep receiving a store's messages.
    const link = await prisma.telegramLink.upsert({
      where: { shop: session.shop },
      update: {
        linkCode: generateLinkCode(),
        linkCodeExpiresAt: linkCodeExpiry(),
        chatId: null,
        chatTitle: null,
        linkedAt: null,
        enabled: true,
      },
      create: {
        shop: session.shop,
        linkCode: generateLinkCode(),
        linkCodeExpiresAt: linkCodeExpiry(),
      },
    });
    return Response.json({ ok: true, linkCode: link.linkCode });
  }

  if (intent === "disconnect") {
    await prisma.telegramLink.deleteMany({ where: { shop: session.shop } });
    await prisma.telegramMessageRef.deleteMany({ where: { shop: session.shop } });
    return Response.json({ ok: true });
  }

  if (intent === "scope") {
    const value = String(formData.get("feedScope") ?? "");
    const feedScope: TelegramScope = (TELEGRAM_SCOPES as readonly string[]).includes(
      value,
    )
      ? (value as TelegramScope)
      : "all";
    await prisma.telegramLink.updateMany({
      where: { shop: session.shop },
      data: { feedScope },
    });
    return Response.json({ ok: true });
  }

  if (intent === "toggle") {
    await prisma.telegramLink.updateMany({
      where: { shop: session.shop },
      data: { enabled: formData.get("enabled") === "true" },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};
