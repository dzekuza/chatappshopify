// Builds the copy-paste embed for a storefront that can't run the theme app
// extension.
//
// The Online Store gets the widget from chat_widget.liquid, which the merchant
// enables from the theme editor in one click. A headless storefront (Hydrogen
// on Oxygen, or any custom framework) never renders app embed blocks at all,
// so the equivalent one-click step is "copy this and paste it into your
// storefront's root layout" — that's what this generates, pre-filled with the
// shop's own proxy path so nothing has to be hand-substituted.

export type HeadlessEmbed = {
  /** Where the widget's JS/CSS are served from — the app itself, not a theme. */
  scriptUrl: string;
  stylesheetUrl: string;
  /** The shop's app-proxy base. */
  proxyBase: string;
  /** Framework-agnostic HTML. */
  htmlSnippet: string;
  /** The same thing as JSX, for a Hydrogen `app/root.tsx`. */
  hydrogenSnippet: string;
  /** The directives a Hydrogen CSP needs for the snippet to load at all. */
  cspSnippet: string;
};

const ENDPOINTS = [
  ["chat", "chat"],
  ["settings", "settings"],
  ["messages", "messages"],
  ["history", "history"],
  ["upload", "upload"],
] as const;

function dataAttributes(proxyBase: string, indent: string) {
  return ENDPOINTS.map(
    ([name, path]) => `${indent}data-${name}-endpoint="${proxyBase}/${path}"`,
  ).join("\n");
}

export function buildHeadlessEmbed(shop: string, appUrl: string): HeadlessEmbed {
  const base = appUrl.replace(/\/$/, "");
  const scriptUrl = `${base}/widget/ai-chat-widget.js`;
  const stylesheetUrl = `${base}/widget/ai-chat-widget.css`;
  // Deliberately the .myshopify.com domain and not the shop's primary domain:
  // on a headless store the primary domain resolves to the storefront build,
  // which serves no /apps/* proxy. The .myshopify.com domain always does.
  const proxyBase = `https://${shop}/apps/chat-widget`;

  const htmlSnippet = `<link rel="stylesheet" href="${stylesheetUrl}" />
<div
  id="ai-chat-widget-root"
${dataAttributes(proxyBase, "  ")}
></div>
<script src="${scriptUrl}" defer></script>`;

  const hydrogenSnippet = `{/* Orby AI Chat Widget */}
<link rel="stylesheet" href="${stylesheetUrl}" />
<div
  id="ai-chat-widget-root"
${dataAttributes(proxyBase, "  ")}
/>
<script src="${scriptUrl}" defer />`;

  const cspSnippet = `const {nonce, header, NonceProvider} = createContentSecurityPolicy({
  scriptSrc: ["'self'", '${base}'],
  styleSrc: ["'self'", '${base}'],
  connectSrc: ["'self'", 'https://${shop}'],
});`;

  return {
    scriptUrl,
    stylesheetUrl,
    proxyBase,
    htmlSnippet,
    hydrogenSnippet,
    cspSnippet,
  };
}
