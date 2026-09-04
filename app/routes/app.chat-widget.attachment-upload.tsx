import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isFileUploadAccessDeniedError,
  uploadImageToShopifyFiles,
} from "../shopify-file-upload.server";

// Admin-side twin of apps.chat-widget.upload.tsx. The storefront widget
// uploads a shopper's image through the app proxy; the settings-page preview
// can't use that route (different auth — see CLAUDE.md's "two chat backends"
// note), so it posts here under authenticate.admin instead. Same underlying
// staged-upload lifecycle either way.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const REAUTH_MESSAGE =
  "This app needs permission to manage files. Reinstall or update the app's permissions in your Shopify admin, then try uploading again.";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json(
      { error: "Attachments must be an image file." },
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
      "Chat preview attachment",
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ url: result.url });
  } catch (error) {
    if (isFileUploadAccessDeniedError(error)) {
      return Response.json({ error: REAUTH_MESSAGE }, { status: 403 });
    }
    throw error;
  }
};
