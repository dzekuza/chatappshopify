import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>AI Chat Widget</h1>
        <p className={styles.text}>
          A Gemini-powered shopping assistant for your storefront — answers
          questions using your real product data, no coding required.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Product-aware answers</strong>. The assistant looks up
            your store's actual products, prices, and stock instead of
            guessing.
          </li>
          <li>
            <strong>On-brand widget</strong>. Match your storefront with a
            custom color, position, and welcome message.
          </li>
          <li>
            <strong>Drop-in setup</strong>. Add the "AI Chat Widget" block in
            your theme editor — no code changes needed.
          </li>
        </ul>
      </div>
    </div>
  );
}
