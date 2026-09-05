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
  /**
   * The whole of step 2 as a brief for a coding agent, pre-filled with this
   * shop's real URLs. Most headless merchants have a developer who works
   * through Claude Code or Cursor — handing them one prompt is a shorter path
   * than three snippets and a paragraph about where each one goes.
   */
  aiPrompt: string;
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

  // Written as instructions to an agent working inside the storefront repo,
  // so it states the constraints that aren't obvious from the snippet alone:
  // the attributes are a contract, the .myshopify.com host is deliberate, and
  // the allowlist step lives outside the codebase entirely.
  const aiPrompt = `Add the Orby AI chat widget to this Hydrogen storefront.

The widget is a self-contained vanilla-JS bundle served by the Orby app. There is no npm package to install and nothing to build — it mounts itself into an empty div and reads every endpoint it needs from that div's data attributes.

Store: ${shop}
Widget script: ${scriptUrl}
Widget stylesheet: ${stylesheetUrl}

1. In app/root.tsx, render this inside <body>, after {children}:

${hydrogenSnippet}

Keep the id and every data-* attribute exactly as written. The script reads them off the element's dataset on load and does nothing at all if the div is missing or renamed. Don't move the <script> above the div, and don't put the markup in a component that re-renders.

2. Hydrogen ships a strict Content Security Policy that blocks both files by default. In app/entry.server.tsx, extend the existing createContentSecurityPolicy call to include these hosts:

${cspSnippet}

Merge them into the directives already there rather than replacing them.

3. Leave the endpoint URLs pointing at ${shop}. They are Shopify app-proxy routes, and only the .myshopify.com domain serves them — the storefront's own primary domain does not. Don't rewrite them to a relative path.

Things to know:
- These requests are cross-origin, so CORS applies. This storefront's origin has to be allowlisted in the Orby app's admin under Settings > Headless storefront. That can't be done from the codebase — if it hasn't been done, say so rather than trying to work around it.
- No environment variables, API keys or secrets belong on the storefront. The widget authenticates through the app proxy.
- Preview and branch domains each count as a separate origin and need allowlisting separately.`;

  return {
    scriptUrl,
    stylesheetUrl,
    proxyBase,
    htmlSnippet,
    hydrogenSnippet,
    cspSnippet,
    aiPrompt,
  };
}
