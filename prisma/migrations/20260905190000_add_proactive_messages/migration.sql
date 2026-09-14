-- Proactive in-widget messages. Rules live on the settings row (not their own
-- table) so the per-page-load settings fetch costs no extra query, matching
-- knowledgeCollections/storefrontOrigins. Off by default: an existing shop
-- must opt in before anything is shown to its shoppers.
ALTER TABLE "chat_widget"."WidgetSettings"
  ADD COLUMN "proactiveEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proactiveRules" JSONB NOT NULL DEFAULT '[]';

-- Attribution: which rule opened the conversation. Null when the shopper
-- started the chat themselves.
ALTER TABLE "chat_widget"."Conversation"
  ADD COLUMN "proactiveRuleId" TEXT;
