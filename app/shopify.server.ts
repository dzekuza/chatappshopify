import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const MONTHLY_PLAN = "Monthly Plan";
export const PRO_PLAN = "Pro Plan";

// Test charges instead of real ones. NODE_ENV is always "production" on Vercel,
// so it can't tell the dev deployment from the live one — a dev store can only
// complete a test charge, and without this the dev app strands the merchant on
// /app/plans. Set SHOPIFY_BILLING_TEST=true on the dev project only.
export const isTestBilling =
  process.env.SHOPIFY_BILLING_TEST === "true" ||
  process.env.NODE_ENV !== "production";

// The dev app (Orby Chat DEV) uses custom distribution, and Shopify blocks the
// Billing API outright for custom apps — appSubscriptionCreate answers "Custom
// apps cannot use the Billing API", and distribution can't be changed after it
// is chosen. So the gate has to be off there or the app is unusable. Set
// SHOPIFY_BILLING_ENABLED=false on the dev project; prod leaves it unset.
// https://shopify.dev/docs/apps/launch/distribution
export const isBillingEnabled = process.env.SHOPIFY_BILLING_ENABLED !== "false";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      trialDays: 7,
      lineItems: [
        {
          amount: 4.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PRO_PLAN]: {
      trialDays: 7,
      lineItems: [
        {
          amount: 12.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
