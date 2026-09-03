import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isFileUploadAccessDeniedError,
  uploadImageToShopifyFiles,
} from "../shopify-file-upload.server";

// Posted to by the storefront widget's attachment button (see
// ai-chat-widget.js) when a shopper attaches an image to the chat. The
// resulting Shopify Files CDN url is embedded as a bare-URL line in the
// shopper's message content — the same convention knowledgeBasePrompt uses
// for media — so it persists, renders inline client-side, and reaches
// Gemini as vision input (see apps.chat-widget.chat.tsx) without any schema
// change.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json(
      { error: "Only image attachments are supported." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      { error: "Image must be smaller than 5MB." },
      { status: 400 },
    );
  }

  try {
    const result = await uploadImageToShopifyFiles(
      admin,
      file,
      "Shopper chat attachment",
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ url: result.url });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (isFileUploadAccessDeniedError(error)) {
      return Response.json(
        { error: "Attachments aren't available for this store right now." },
        { status: 403 },
      );
    }
    console.error("Chat attachment upload failed", error);
    return Response.json(
      { error: "Uploading the image failed." },
      { status: 502 },
    );
  }
};
