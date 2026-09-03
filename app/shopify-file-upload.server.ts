// Shared staged-upload -> fileCreate -> poll flow for pushing a browser-sent
// File into Shopify Files, used by both the admin icon uploader
// (app.chat-widget.icon-upload.tsx) and the storefront chat attachment
// uploader (apps.chat-widget.upload.tsx). Runs entirely server-side so each
// caller only ever deals with a plain multipart POST and a final CDN url.

type GraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 500;

// Uploading to Shopify Files needs write_files on top of the read_files the
// app has always asked for. A shop installed before that scope was added
// keeps the old grant until it re-authorizes, and the Admin API answers with
// a plain "Access denied for <field>" GraphQL error.
export function isFileUploadAccessDeniedError(error: unknown) {
  return error instanceof Error && /access denied/i.test(error.message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FileUploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

export async function uploadImageToShopifyFiles(
  admin: GraphqlClient,
  file: File,
  altText: string,
): Promise<FileUploadResult> {
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
            filename: file.name || "upload",
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
    return { ok: false, status: 400, error: userErrors[0].message };
  }
  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    return { ok: false, status: 502, error: "Could not start the upload." };
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
    return { ok: false, status: 502, error: "Uploading the file failed." };
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
            alt: altText,
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
    return { ok: false, status: 400, error: fileErrors[0].message };
  }
  const fileId = fileCreateJson?.data?.fileCreate?.files?.[0]?.id;
  if (!fileId) {
    return { ok: false, status: 502, error: "Could not save the uploaded file." };
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
      return { ok: true, url: node.image.url };
    }
    if (node?.fileStatus === "FAILED") {
      return { ok: false, status: 502, error: "Shopify couldn't process the uploaded file." };
    }
    await wait(POLL_INTERVAL_MS);
  }

  return {
    ok: false,
    status: 504,
    error: "The file is still processing — try again in a moment.",
  };
}
