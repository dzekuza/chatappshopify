-- Origins allowed to call the app-proxy chat endpoints cross-origin from a
-- headless (Hydrogen/Oxygen or custom) storefront. Empty for Online Store
-- shops, where the widget runs same-origin.
ALTER TABLE "chat_widget"."WidgetSettings"
  ADD COLUMN "storefrontOrigins" JSONB NOT NULL DEFAULT '[]';
