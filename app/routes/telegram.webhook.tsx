import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { generateLinkCode, sendTelegramMessage } from "../telegram.server";

// Public endpoint hit by Telegram — there is no Shopify session here. It is
// authenticated by the secret token Telegram echoes back in a header, which
// is set when the webhook is registered via setWebhook.
//
// Two jobs:
//   1. Linking — a merchant sends the code from Settings, and their chat id
//      is recorded against their shop.
//   2. Replying — a native swipe-reply to a message the bot posted is turned
//      into a `role: "agent"` ChatMessage, which is exactly what the admin
//      reply form writes (app.activity_.$conversationId.tsx) and what the
//      storefront widget already polls for (apps.chat-widget.messages.tsx).
//
// Telegram retries any non-2xx indefinitely, so failures are reported back
// into the chat and the request itself always succeeds.

const LINK_CODE_PATTERN = /\bORBY-[A-Z0-9]{10}\b/;

type TelegramUpdate = {
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; title?: string; username?: string };
    reply_to_message?: { message_id?: number };
  };
};

const HELP =
  "Send the link code from your Orby chat app settings to connect this chat.\n\n" +
  "Once connected, reply to any shopper message here and it goes straight back into their chat on your store.\n\n" +
  "/status — show which store this chat is connected to\n" +
  "/stop — pause notifications";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    request.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  if (!message || chatId === undefined || chatId === null) {
    return Response.json({ ok: true });
  }

  const chat = String(chatId);
  const text = String(message.text ?? "").trim();

  try {
    await handleMessage({
      chat,
      chatTitle: message.chat?.title ?? message.chat?.username ?? null,
      text,
      replyToMessageId: message.reply_to_message?.message_id,
    });
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    await sendTelegramMessage(
      chat,
      "Something went wrong handling that. Please try again.",
    ).catch(() => {});
  }

  return Response.json({ ok: true });
};

async function handleMessage(input: {
  chat: string;
  chatTitle: string | null;
  text: string;
  replyToMessageId?: number;
}) {
  const { chat, text } = input;

  if (text === "/status") {
    const link = await prisma.telegramLink.findFirst({ where: { chatId: chat } });
    await sendTelegramMessage(
      chat,
      link
        ? [
            link.enabled
              ? "✅ <b>Connected</b>"
              : "⏸ <b>Connected, notifications paused</b>",
            "",
            await storeSummary(link.shop),
          ].join("\n")
        : "This chat isn't connected to a store yet. Send the link code from the app's Settings page.",
    );
    return;
  }

  if (text === "/stop") {
    const updated = await prisma.telegramLink.updateMany({
      where: { chatId: chat },
      data: { enabled: false },
    });
    await sendTelegramMessage(
      chat,
      updated.count
        ? "Notifications paused. Turn them back on from the app's Settings page."
        : "This chat isn't connected to a store.",
    );
    return;
  }

  // A swipe-reply is the merchant answering a shopper.
  if (input.replyToMessageId) {
    await handleReply(chat, text, String(input.replyToMessageId));
    return;
  }

  const code = text.toUpperCase().match(LINK_CODE_PATTERN)?.[0];
  if (code) {
    await handleLink(chat, input.chatTitle, code);
    return;
  }

  const link = await prisma.telegramLink.findFirst({ where: { chatId: chat } });
  await sendTelegramMessage(
    chat,
    link
      ? "To answer a shopper, swipe-reply to their message above rather than sending a new one."
      : HELP,
  );
}

function scopeLabel(feedScope: string) {
  return feedScope === "alerts"
    ? "Only when a shopper asks for a human"
    : "Every message";
}

// What the merchant needs to confirm they've connected the right store, from
// data already in this app's own tables — no Admin API call, so it can't fail
// or stall the reply.
async function storeSummary(shop: string) {
  const [settings, link, conversations] = await Promise.all([
    prisma.widgetSettings.findUnique({ where: { shop } }),
    prisma.telegramLink.findUnique({ where: { shop } }),
    prisma.conversation.count({ where: { shop } }),
  ]);

  return [
    `🏪 Store: <b>${shop}</b>`,
    `💬 Widget: ${settings?.enabled === false ? "Turned off" : "Live"}`,
    `📣 Sending: ${scopeLabel(link?.feedScope ?? "all")}`,
    `🗂 Conversations so far: ${conversations}`,
  ].join("\n");
}

async function handleLink(
  chat: string,
  chatTitle: string | null,
  code: string,
) {
  const link = await prisma.telegramLink.findUnique({
    where: { linkCode: code },
  });

  // A code is only live inside its window. Redeeming one clears the expiry
  // (below), so this single check also rejects replaying a code against an
  // already-connected shop — which would otherwise repoint that store's
  // notifications at the sender's chat and hand them reply access.
  const isRedeemable =
    link?.linkCodeExpiresAt && link.linkCodeExpiresAt.getTime() > Date.now();

  if (!link || !isRedeemable) {
    await sendTelegramMessage(
      chat,
      "That code isn't valid or has expired. Generate a fresh one on the app's Settings page.",
    );
    return;
  }

  await prisma.telegramLink.update({
    where: { id: link.id },
    data: {
      chatId: chat,
      chatTitle,
      linkedAt: new Date(),
      enabled: true,
      // Burn it: rotate to a value never shown to anyone, so the code the
      // merchant just sent over Telegram can't be reused by whoever sees it.
      linkCode: generateLinkCode(),
      linkCodeExpiresAt: null,
    },
  });

  await sendTelegramMessage(
    chat,
    [
      "✅ <b>Code accepted</b> — this chat is now connected.",
      "",
      await storeSummary(link.shop),
      "",
      "Chat activity will start arriving here. To answer a shopper, swipe-reply to their message.",
      "",
      "Wrong store? Send /stop to pause, then disconnect from the app's Settings page.",
    ].join("\n"),
  );
}

async function handleReply(
  chat: string,
  text: string,
  replyToMessageId: string,
) {
  if (!text) {
    await sendTelegramMessage(chat, "Send some text to reply with.");
    return;
  }

  const ref = await prisma.telegramMessageRef.findUnique({
    where: {
      chatId_telegramMessageId: { chatId: chat, telegramMessageId: replyToMessageId },
    },
  });

  if (!ref) {
    await sendTelegramMessage(
      chat,
      "I can't tell which conversation that reply belongs to. Reply directly to one of the shopper messages I posted.",
    );
    return;
  }

  // The chat that received the message must still be the one linked to that
  // shop — a stale ref must never let one chat write into another's store.
  const link = await prisma.telegramLink.findUnique({
    where: { shop: ref.shop },
  });
  if (!link || link.chatId !== chat) {
    await sendTelegramMessage(chat, "This chat is no longer connected to that store.");
    return;
  }

  const conversation = await prisma.conversation.findUnique({
    where: {
      shop_conversationId: { shop: ref.shop, conversationId: ref.conversationId },
    },
  });

  if (!conversation) {
    await sendTelegramMessage(chat, "That conversation no longer exists.");
    return;
  }

  await prisma.chatMessage.create({
    data: {
      shop: ref.shop,
      conversationId: ref.conversationId,
      role: "agent",
      content: text,
    },
  });

  if (conversation.needsHuman) {
    await prisma.conversation.update({
      where: {
        shop_conversationId: { shop: ref.shop, conversationId: ref.conversationId },
      },
      data: { needsHuman: false },
    });
  }

  await sendTelegramMessage(
    chat,
    `✅ Sent to ${conversation.customerName}. They'll see it if their chat is still open, and it's saved to the conversation either way.`,
  );
}
