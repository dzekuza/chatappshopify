import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { VideoFile } from "./app.knowledge_.videos";
import type { ImageFile } from "./app.knowledge_.images";
import type { ProductOption } from "./app.knowledge_.products";

type EntryType = "freeform" | "product";
type MediaType = "" | "video" | "image";
type PickerMode = null | "video" | "image" | "product";

const EMPTY_FORM = {
  id: "",
  type: "freeform" as EntryType,
  question: "",
  productId: "",
  productTitle: "",
  productHandle: "",
  answer: "",
  mediaType: "" as MediaType,
  mediaId: "",
  mediaUrl: "",
  mediaName: "",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const entries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return { entries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = await request.json();
  const intent = String(payload.intent ?? "save");

  if (intent === "delete") {
    const id = String(payload.id ?? "");
    await prisma.knowledgeEntry.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true };
  }

  const type = payload.type === "product" ? "product" : "freeform";
  const answer = String(payload.answer ?? "").trim();
  const mediaType = String(payload.mediaType ?? "").trim() || null;
  const mediaId = String(payload.mediaId ?? "").trim() || null;
  const mediaUrl = String(payload.mediaUrl ?? "").trim() || null;
  const mediaName = String(payload.mediaName ?? "").trim() || null;

  if (!answer) {
    return { error: "Answer is required." };
  }

  let question: string | null = null;
  let productId: string | null = null;
  let productTitle: string | null = null;
  let productHandle: string | null = null;

  if (type === "freeform") {
    question = String(payload.question ?? "").trim();
    if (!question) {
      return { error: "Question is required for a free-form entry." };
    }
  } else {
    productId = String(payload.productId ?? "").trim();
    productTitle = String(payload.productTitle ?? "").trim();
    productHandle = String(payload.productHandle ?? "").trim() || null;
    if (!productId || !productTitle) {
      return { error: "Select a product for this entry." };
    }
  }

  const data = {
    type,
    question,
    answer,
    productId,
    productTitle,
    productHandle,
    mediaType,
    mediaId,
    mediaUrl,
    mediaName,
  };

  const id = String(payload.id ?? "").trim();

  if (id) {
    const existing = await prisma.knowledgeEntry.findUnique({
      where: { id },
    });
    if (!existing || existing.shop !== session.shop) {
      return { error: "That entry no longer exists." };
    }
    const entry = await prisma.knowledgeEntry.update({
      where: { id },
      data,
    });
    return { entry };
  }

  const entry = await prisma.knowledgeEntry.create({
    data: { shop: session.shop, ...data },
  });
  return { entry };
};

function mediaBadgeLabel(mediaType: string | null) {
  if (mediaType === "video") return "Video attached";
  if (mediaType === "image") return "Image attached";
  return null;
}

export default function Knowledge() {
  const { entries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const videoFetcher = useFetcher<{ videos: VideoFile[] }>();
  const imageFetcher = useFetcher<{ images: ImageFile[] }>();
  const productFetcher = useFetcher<{ products: ProductOption[] }>();
  const shopify = useAppBridge();

  const [form, setForm] = useState(EMPTY_FORM);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [productQuery, setProductQuery] = useState("");
  const modalRef = useRef<{ hideOverlay: () => void }>(null);

  const isSaving = fetcher.state !== "idle";
  const videos = videoFetcher.data?.videos ?? [];
  const isLoadingVideos = videoFetcher.state !== "idle";
  const images = imageFetcher.data?.images ?? [];
  const isLoadingImages = imageFetcher.state !== "idle";
  const products = productFetcher.data?.products ?? [];
  const isLoadingProducts = productFetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "entry" in fetcher.data) {
      shopify.toast.show("Question saved");
      modalRef.current?.hideOverlay();
      setForm(EMPTY_FORM);
    }
    if (fetcher.state === "idle" && fetcher.data && "error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);

  const openNewEntry = () => {
    setForm(EMPTY_FORM);
    setPickerMode(null);
  };

  const openEditEntry = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setForm({
      id: entry.id,
      type: entry.type === "product" ? "product" : "freeform",
      question: entry.question ?? "",
      productId: entry.productId ?? "",
      productTitle: entry.productTitle ?? "",
      productHandle: entry.productHandle ?? "",
      answer: entry.answer,
      mediaType: (entry.mediaType as MediaType) ?? "",
      mediaId: entry.mediaId ?? "",
      mediaUrl: entry.mediaUrl ?? "",
      mediaName: entry.mediaName ?? "",
    });
    setPickerMode(null);
  };

  const handleSave = () => {
    fetcher.submit(JSON.stringify({ intent: "save", ...form }), {
      method: "POST",
      encType: "application/json",
    });
  };

  const handleDelete = (id: string) => {
    fetcher.submit(JSON.stringify({ intent: "delete", id }), {
      method: "POST",
      encType: "application/json",
    });
  };

  const openVideoPicker = () => {
    videoFetcher.load("/app/knowledge/videos");
    setPickerMode("video");
  };

  const openImagePicker = () => {
    imageFetcher.load("/app/knowledge/images");
    setPickerMode("image");
  };

  const openProductPicker = () => {
    setProductQuery("");
    productFetcher.load("/app/knowledge/products?query=");
    setPickerMode("product");
  };

  const closePicker = () => {
    setPickerMode(null);
  };

  const selectVideo = (video: VideoFile) => {
    setForm((prev) => ({
      ...prev,
      mediaType: "video",
      mediaId: video.id,
      mediaUrl: video.url,
      mediaName: video.filename,
    }));
    setPickerMode(null);
  };

  const selectImage = (image: ImageFile) => {
    setForm((prev) => ({
      ...prev,
      mediaType: "image",
      mediaId: image.id,
      mediaUrl: image.url,
      mediaName: image.filename,
    }));
    setPickerMode(null);
  };

  const selectProduct = (product: ProductOption) => {
    setForm((prev) => ({
      ...prev,
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
    }));
    setPickerMode(null);
  };

  const removeMedia = () => {
    setForm((prev) => ({
      ...prev,
      mediaType: "",
      mediaId: "",
      mediaUrl: "",
      mediaName: "",
    }));
  };

  const runProductSearch = (value: string) => {
    setProductQuery(value);
    productFetcher.load(`/app/knowledge/products?query=${encodeURIComponent(value)}`);
  };

  const modalHeading =
    pickerMode === "video"
      ? "Select a video"
      : pickerMode === "image"
        ? "Select an image"
        : pickerMode === "product"
          ? "Select a product"
          : "Custom question";

  return (
    <s-page heading="Knowledge">
      <s-button
        slot="primary-action"
        commandFor="knowledge-modal"
        onClick={openNewEntry}
      >
        Add question
      </s-button>

      <s-section heading="Custom questions & answers">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Give the assistant exact answers for questions you want handled a
            specific way, or attach extra info to a specific product — with
            an optional video or image, e.g. a how-to clip or size chart.
            When a shopper asks something close to one of these (or the
            assistant discusses that product), it uses your answer instead
            of guessing.
          </s-paragraph>

          {entries.length === 0 ? (
            <s-paragraph tone="neutral" color="subdued">
              No custom questions yet.
            </s-paragraph>
          ) : null}
        </s-stack>
      </s-section>

      {entries.length > 0 ? (
        <s-section padding="none">
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Question</s-table-header>
              <s-table-header listSlot="secondary">Answer</s-table-header>
              <s-table-header listSlot="inline">Media</s-table-header>
              <s-table-header listSlot="labeled" />
            </s-table-header-row>
            <s-table-body>
              {entries.map((entry) => {
                const editLinkId = `edit-${entry.id}`;
                const mediaLabel = mediaBadgeLabel(entry.mediaType);
                return (
                  <s-table-row key={entry.id} clickDelegate={editLinkId}>
                    <s-table-cell>
                      <s-link
                        id={editLinkId}
                        commandFor="knowledge-modal"
                        command="--show"
                        onClick={() => openEditEntry(entry.id)}
                      >
                        {entry.type === "product"
                          ? `Product: ${entry.productTitle}`
                          : entry.question}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {entry.answer.length > 100
                        ? `${entry.answer.slice(0, 100)}…`
                        : entry.answer}
                    </s-table-cell>
                    <s-table-cell>
                      {mediaLabel ? (
                        <s-badge tone="info">{mediaLabel}</s-badge>
                      ) : (
                        <s-text color="subdued">None</s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Delete "${
                          entry.type === "product"
                            ? entry.productTitle
                            : entry.question
                        }"`}
                        {...(isSaving ? { loading: true } : {})}
                        onClick={() => handleDelete(entry.id)}
                      />
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      ) : null}

      <s-modal ref={modalRef as any} id="knowledge-modal" heading={modalHeading}>
        {pickerMode === "video" ? (
          isLoadingVideos ? (
            <s-paragraph>Loading videos…</s-paragraph>
          ) : videos.length === 0 ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                No videos found in your store&apos;s media library.
              </s-paragraph>
              <s-paragraph tone="neutral" color="subdued">
                Upload one under Content → Files in Shopify admin, then come
                back here.
              </s-paragraph>
            </s-stack>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {videos.map((video) => (
                <s-clickable
                  key={video.id}
                  padding="base"
                  background="subdued"
                  onClick={() => selectVideo(video)}
                >
                  <s-stack direction="block" gap="small-200">
                    {video.thumbnailUrl ? (
                      <s-image
                        src={video.thumbnailUrl}
                        alt={video.filename}
                        aspectRatio="16/9"
                        objectFit="cover"
                      />
                    ) : null}
                    <s-text>{video.filename}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          )
        ) : pickerMode === "image" ? (
          isLoadingImages ? (
            <s-paragraph>Loading images…</s-paragraph>
          ) : images.length === 0 ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                No images found in your store&apos;s media library.
              </s-paragraph>
              <s-paragraph tone="neutral" color="subdued">
                Upload one under Content → Files in Shopify admin, then come
                back here.
              </s-paragraph>
            </s-stack>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {images.map((image) => (
                <s-clickable
                  key={image.id}
                  padding="base"
                  background="subdued"
                  onClick={() => selectImage(image)}
                >
                  <s-stack direction="block" gap="small-200">
                    <s-image
                      src={image.url}
                      alt={image.filename}
                      aspectRatio="16/9"
                      objectFit="cover"
                    />
                    <s-text>{image.filename}</s-text>
                  </s-stack>
                </s-clickable>
              ))}
            </s-grid>
          )
        ) : pickerMode === "product" ? (
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Search products"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search by product title…"
              value={productQuery}
              onChange={(event: any) => runProductSearch(event.currentTarget.value)}
            />
            {isLoadingProducts ? (
              <s-paragraph>Loading products…</s-paragraph>
            ) : products.length === 0 ? (
              <s-paragraph tone="neutral" color="subdued">
                No products found.
              </s-paragraph>
            ) : (
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {products.map((product) => (
                  <s-clickable
                    key={product.id}
                    padding="base"
                    background="subdued"
                    onClick={() => selectProduct(product)}
                  >
                    <s-stack direction="block" gap="small-200">
                      {product.imageUrl ? (
                        <s-image
                          src={product.imageUrl}
                          alt={product.title}
                          aspectRatio="16/9"
                          objectFit="cover"
                        />
                      ) : null}
                      <s-text>{product.title}</s-text>
                    </s-stack>
                  </s-clickable>
                ))}
              </s-grid>
            )}
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Question type</s-text>
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant={form.type === "freeform" ? "primary" : "secondary"}
                  onClick={() => setForm((prev) => ({ ...prev, type: "freeform" }))}
                >
                  Free-form question
                </s-button>
                <s-button
                  variant={form.type === "product" ? "primary" : "secondary"}
                  onClick={() => setForm((prev) => ({ ...prev, type: "product" }))}
                >
                  Specific product
                </s-button>
              </s-stack>
            </s-stack>

            {form.type === "freeform" ? (
              <s-text-field
                label="Question"
                value={form.question}
                details="How a shopper might phrase it — the assistant matches similar wording too."
                onChange={(event: any) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, question: value }));
                }}
              />
            ) : form.productTitle ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone="info">{form.productTitle}</s-badge>
                <s-button variant="tertiary" onClick={openProductPicker}>
                  Change product
                </s-button>
              </s-stack>
            ) : (
              <s-button variant="secondary" onClick={openProductPicker}>
                Select product
              </s-button>
            )}

            <s-text-area
              label="Answer"
              value={form.answer}
              rows={4}
              onChange={(event: any) => {
                const value = event.currentTarget.value;
                setForm((prev) => ({ ...prev, answer: value }));
              }}
            />

            {form.mediaName ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone="info">
                  {form.mediaType === "image" ? "Image: " : "Video: "}
                  {form.mediaName}
                </s-badge>
                <s-button variant="tertiary" onClick={removeMedia}>
                  Remove
                </s-button>
              </s-stack>
            ) : (
              <s-stack direction="inline" gap="small-200">
                <s-button variant="secondary" onClick={openVideoPicker}>
                  Attach video
                </s-button>
                <s-button variant="secondary" onClick={openImagePicker}>
                  Attach image
                </s-button>
              </s-stack>
            )}
          </s-stack>
        )}

        {pickerMode ? (
          <s-button slot="secondary-actions" onClick={closePicker}>
            Back
          </s-button>
        ) : (
          <>
            <s-button
              slot="secondary-actions"
              commandFor="knowledge-modal"
              command="--hide"
            >
              Cancel
            </s-button>
            <s-button
              slot="primary-action"
              variant="primary"
              onClick={handleSave}
              {...(isSaving ? { loading: true } : {})}
            >
              Save
            </s-button>
          </>
        )}
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
