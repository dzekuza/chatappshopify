import styles from "./styles.module.css";

const LAST_UPDATED = "August 20, 2026";
const SUPPORT_EMAIL = "dzekuza@gmail.com";

export default function Privacy() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Privacy Policy — AI Chat Widget</h1>
        <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

        <p>
          AI Chat Widget ("the App") is a Shopify app that adds an
          AI-powered shopping assistant to a merchant's storefront. This
          policy explains what data the App collects, how it's used, and how
          it's handled when a shopper or merchant asks for it to be removed.
        </p>

        <h2>Who this applies to</h2>
        <p>
          This policy covers two groups: <strong>merchants</strong> who
          install the App in their Shopify admin, and{" "}
          <strong>shoppers</strong> who chat with the widget on a merchant's
          storefront.
        </p>

        <h2>Information we collect</h2>
        <h3>From shoppers, when they start a conversation</h3>
        <ul>
          <li>Name, and an email address or phone number (required to start a chat)</li>
          <li>The content of messages sent to and received from the assistant</li>
          <li>An order number, if the shopper asks about an order's status</li>
        </ul>
        <h3>From merchants</h3>
        <ul>
          <li>
            Store information provided by Shopify during installation (shop
            domain, access token, granted scopes)
          </li>
          <li>
            Widget configuration the merchant sets: welcome message, system
            prompt, brand color, selected collections, and any optional
            knowledge-base entries or their own AI provider API key
          </li>
        </ul>
        <p>
          The App does not collect payment card details, and does not
          request a myshopify.com domain be typed in manually — installation
          happens entirely through Shopify's standard OAuth flow.
        </p>

        <h2>How we use this information</h2>
        <ul>
          <li>
            To generate the assistant's replies — shopper messages are sent
            to Google's Gemini API (or, on the Pro plan, the merchant's own
            Gemini API key) along with relevant product data looked up live
            from the merchant's store
          </li>
          <li>To look up order status when a shopper asks about an order</li>
          <li>
            To let the merchant see conversation history and shopper contact
            details in their Shopify admin, and to notify the merchant when
            a shopper asks to speak with a person
          </li>
          <li>To operate and secure the App itself (e.g. billing, support)</li>
        </ul>
        <p>
          The assistant is instructed to only describe real products and
          prices retrieved from the merchant's store — it does not have
          access to any other merchant's data.
        </p>

        <h2>Who we share it with</h2>
        <ul>
          <li>
            <strong>Google (Gemini API)</strong> — processes shopper message
            content to generate assistant replies, per{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              Google's Gemini API terms
            </a>
          </li>
          <li>
            <strong>Shopify</strong> — product, order, and store data is read
            through Shopify's Admin API under the scopes the merchant
            approved at install
          </li>
          <li>
            <strong>Our infrastructure providers</strong> — data is stored on
            Supabase (PostgreSQL) and the App runs on Vercel
          </li>
        </ul>
        <p>We do not sell shopper or merchant data.</p>

        <h2>How long we keep it</h2>
        <p>
          Conversations and messages are kept for as long as the merchant has
          the App installed, so they remain visible in the merchant's
          Activity page. When a merchant uninstalls the App, all of that
          shop's data — conversations, messages, widget settings, and
          knowledge-base entries — is permanently deleted within 48 hours.
        </p>

        <h2>Your rights</h2>
        <p>
          A shopper can ask the merchant they chatted with to request a copy
          of their data, or to have it deleted. The App supports both
          requests directly from Shopify (the{" "}
          <code>customers/data_request</code> and{" "}
          <code>customers/redact</code> webhooks), and will remove a
          shopper's stored conversations and messages on request.
        </p>

        <h2>Security</h2>
        <p>
          All traffic to and from the App is encrypted with TLS. Application
          data lives in a dedicated, isolated database schema, accessible
          only through the App's own server — never through a public API or
          shared database access.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
