import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Without this, anything thrown outside the /app subtree (which has its own
// boundary via boundary.error) falls through to React Router's built-in
// boundary, which renders a bare "Application Error" stack dump. Root
// boundaries replace the whole tree, so this has to render the document shell
// itself.
export function ErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{message}</title>
        <Meta />
        <Links />
      </head>
      <body>
        <main>
          <h1>{message}</h1>
          <p>
            The app could not load this page. Try reloading, and if it keeps
            happening reopen the app from your Shopify admin.
          </p>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
