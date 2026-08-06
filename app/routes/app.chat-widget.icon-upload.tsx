import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Resource route the widget settings page posts a file to when the merchant
// uploads a custom launcher icon. Runs the full Shopify Files upload
// lifecycle (staged upload -> fileCreate -> poll until processed) server-side
// so the client only ever deals with a plain multipart POST and a final URL.
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 500;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        input: [
          {
            filename: file.name || "widget-icon",
            mimeType: file.type,
            httpMethod: "POST",
            resource: "FILE",
          },
        ],
      },
    },
  );
  const stagedJson = await stagedResponse.json();
  const userErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return Response.json({ error: userErrors[0].message }, { status: 400 });
  }
  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    return Response.json(
      { error: "Could not start the upload." },
      { status: 502 },
    );
  }

  const uploadForm = new FormData();
  for (const param of target.parameters as { name: string; value: string }[]) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });
  if (!uploadResponse.ok) {
    return Response.json(
      { error: "Uploading the icon failed." },
      { status: 502 },
    );
  }

  const fileCreateResponse = await admin.graphql(
    `#graphql
      mutation FileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        files: [
          {
            alt: "Chat widget icon",
            contentType: "IMAGE",
            originalSource: target.resourceUrl,
          },
        ],
      },
    },
  );
  const fileCreateJson = await fileCreateResponse.json();
  const fileErrors = fileCreateJson?.data?.fileCreate?.userErrors ?? [];
  if (fileErrors.length > 0) {
    return Response.json({ error: fileErrors[0].message }, { status: 400 });
  }
  const fileId = fileCreateJson?.data?.fileCreate?.files?.[0]?.id;
  if (!fileId) {
    return Response.json(
      { error: "Could not save the uploaded icon." },
      { status: 502 },
    );
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const nodeResponse = await admin.graphql(
      `#graphql
        query FileStatus($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image {
                url
              }
            }
          }
        }`,
      { variables: { id: fileId } },
    );
    const nodeJson = await nodeResponse.json();
    const node = nodeJson?.data?.node;
    if (node?.fileStatus === "READY" && node?.image?.url) {
      return Response.json({ url: node.image.url });
    }
    if (node?.fileStatus === "FAILED") {
      return Response.json(
        { error: "Shopify couldn't process the uploaded icon." },
        { status: 502 },
      );
    }
    await wait(POLL_INTERVAL_MS);
  }

  return Response.json(
    { error: "The icon is still processing — try again in a moment." },
    { status: 504 },
  );
};
