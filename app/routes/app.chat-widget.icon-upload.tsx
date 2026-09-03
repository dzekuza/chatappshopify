import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isFileUploadAccessDeniedError,
  uploadImageToShopifyFiles,
} from "../shopify-file-upload.server";

// Resource route the widget settings page posts a file to when the merchant
// uploads a custom launcher icon. See shopify-file-upload.server.ts for the
// staged upload -> fileCreate -> poll lifecycle this runs.
const MAX_ICON_BYTES = 2 * 1024 * 1024;

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
      { error: "Icon must be an image file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ICON_BYTES) {
    return Response.json(
      { error: "Icon must be smaller than 2MB." },
      { status: 400 },
    );
  }

  try {
    const result = await uploadImageToShopifyFiles(admin, file, "Chat widget icon");
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ url: result.url });
  } catch (error) {
    // Re-auth redirects and other framework responses must keep bubbling.
    if (error instanceof Response) throw error;
    if (isFileUploadAccessDeniedError(error)) {
      return Response.json({ error: REAUTH_MESSAGE }, { status: 403 });
    }
    console.error("Icon upload failed", error);
    return Response.json(
      { error: "Uploading the icon failed." },
      { status: 502 },
    );
  }
};
