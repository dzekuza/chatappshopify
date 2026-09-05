import { waitUntil } from "@vercel/functions";
import prisma from "./db.server";

// Telegram is this app's push channel. It exists because Shopify's mobile
// admin app has no notification for chat-widget conversations, so a merchant
// otherwise has no way to know a shopper is waiting.
//
// One shared bot serves every shop: a merchant generates a link code in
// Settings, sends it to the bot, and the webhook records their chat id. All
// routing is therefore chat-id-based — see routes/telegram.webhook.tsx.

const API_BASE = "https://api.telegram.org/bot";

export const TELEGRAM_SCOPES = ["all", "alerts"] as const;
export type TelegramScope = (typeof TELEGRAM_SCOPES)[number];

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function telegramBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME ?? null;
}

/**
 * Telegram sends are never worth failing a shopper's chat request over, and
 * on Vercel a bare floating promise can be killed the moment the response
 * finishes. `waitUntil` keeps the function alive for it; outside a Vercel
 * request context it isn't available, so fall back to a plain catch.
 */
function background(task: Promise<unknown>) {
  const swallowed = task.catch((error) => {
    console.error("Telegram notification failed:", error);
  });
  try {
    waitUntil(swallowed);
  } catch {
    // Not running on Vercel (local dev, or outside a request) — the promise
    // still settles, it just isn't tracked.
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(value: string, max = 900) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const response = await fetch(`${API_BASE}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: { message_id?: number };
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown"}`);
  }

  return data.result;
}

export async function sendTelegramMessage(chatId: string, html: string) {
  const result = await callTelegram("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return result?.message_id ? String(result.message_id) : null;
}

async function activeLink(shop: string) {
  const link = await prisma.telegramLink.findUnique({ where: { shop } });
  if (!link || !link.chatId || !link.enabled) return null;
  return link;
}

/**
 * Posts to the shop's linked chat and remembers which conversation the
 * message belongs to, so a swipe-reply can be routed back.
 */
async function post(
  shop: string,
  chatId: string,
  conversationId: string,
  html: string,
) {
  const messageId = await sendTelegramMessage(chatId, html);
  if (!messageId) return;

  await prisma.telegramMessageRef.upsert({
    where: { chatId_telegramMessageId: { chatId, telegramMessageId: messageId } },
    update: { conversationId, shop },
    create: { shop, chatId, telegramMessageId: messageId, conversationId },
  });
}

export function notifyShopperMessage(input: {
  shop: string;
  conversationId: string;
  customerName: string;
  content: string;
  isNewConversation: boolean;
}) {
  if (!isTelegramConfigured()) return;

  background(
    (async () => {
      const link = await activeLink(input.shop);
      // "alerts" scope is handoffs only — the transcript is skipped.
      if (!link || link.feedScope !== "all") return;

      const heading = input.isNewConversation
        ? `💬 <b>New chat</b> — ${escapeHtml(input.customerName)}`
        : `👤 <b>${escapeHtml(input.customerName)}</b>`;

      await post(
        input.shop,
        link.chatId as string,
        input.conversationId,
        `${heading}\n${escapeHtml(truncate(input.content))}\n\n<i>Reply to this message to answer the shopper.</i>`,
      );
    })(),
  );
}

export function notifyAssistantMessage(input: {
  shop: string;
  conversationId: string;
  content: string;
}) {
  if (!isTelegramConfigured()) return;

  background(
    (async () => {
      const link = await activeLink(input.shop);
      if (!link || link.feedScope !== "all") return;

      await post(
        input.shop,
        link.chatId as string,
        input.conversationId,
        `🤖 <b>AI</b>\n${escapeHtml(truncate(input.content))}`,
      );
    })(),
  );
}

/**
 * The one notification that matters most: the shopper has explicitly asked
 * for a person. Sent regardless of feed scope.
 */
export function notifyHandoffRequested(input: {
  shop: string;
  conversationId: string;
  customerName: string;
  reason: string | null;
}) {
  if (!isTelegramConfigured()) return;

  background(
    (async () => {
      const link = await activeLink(input.shop);
      if (!link) return;

      const reason = input.reason
        ? `\n<i>${escapeHtml(truncate(input.reason, 200))}</i>`
        : "";

      await post(
        input.shop,
        link.chatId as string,
        input.conversationId,
        `🔔 <b>${escapeHtml(input.customerName)} asked for a human</b>${reason}\n\n<i>Reply to this message to answer them.</i>`,
      );
    })(),
  );
}
