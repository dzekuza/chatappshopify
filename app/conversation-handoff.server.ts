import prisma from "./db.server";

// Called whenever a human agent sends a message into a conversation — from
// the admin reply form (app.activity_.$conversationId.tsx) or a Telegram
// reply (telegram.webhook.tsx). Pauses the AI so it stops answering this
// shopper once a real person has taken over; apps.chat-widget.chat.tsx
// checks the flag and skips the model call while it's set. It's never
// cleared automatically — only the merchant's explicit "Resume AI" action
// turns it back on, since the agent may keep replying over several messages.
export async function markHumanTookOver(shop: string, conversationId: string) {
  await prisma.conversation.update({
    where: { shop_conversationId: { shop, conversationId } },
    data: { needsHuman: false, aiPaused: true },
  });
}
