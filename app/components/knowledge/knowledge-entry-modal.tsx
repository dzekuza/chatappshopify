import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { FetcherWithComponents } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { VideoFile } from "../../routes/app.knowledge_.videos";
import type { ImageFile } from "../../routes/app.knowledge_.images";
import type { ProductOption } from "../../routes/app.knowledge_.products";
import { VideoTimestampFields } from "./video-timestamp-fields";
import { formatTimestamp } from "../../media-timestamp";

type EntryType = "freeform" | "product";
type MediaType = "" | "video" | "image";
type PickerMode = null | "video" | "image" | "product";

export type KnowledgeEntryForEdit = {
  id: string;
  type: string;
  question: string | null;
  productId: string | null;
  productTitle: string | null;
  productHandle: string | null;
  answer: string;
  mediaType: string | null;
  mediaId: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaStartSeconds: number | null;
  mediaEndSeconds: number | null;
};

type FormState = {
  id: string;
  type: EntryType;
  question: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  answer: string;
  mediaType: MediaType;
  mediaId: string;
  mediaUrl: string;
  mediaName: string;
  mediaStart: string;
  mediaEnd: string;
  fromQueryLog: boolean;
};

const EMPTY_FORM: FormState = {
  id: "",
  type: "freeform",
  question: "",
  productId: "",
  productTitle: "",
  productHandle: "",
  answer: "",
  mediaType: "",
  mediaId: "",
  mediaUrl: "",
  mediaName: "",
  mediaStart: "",
  mediaEnd: "",
  fromQueryLog: false,
};

export type KnowledgeEntryModalHandle = {
  openNew: () => void;
  openEdit: (entry: KnowledgeEntryForEdit) => void;
  openFromQuery: (question: string) => void;
};

// The route's fetcher is shared across three action intents (save, delete,
// sync-collections), so its `data` type is a union that includes shapes this
// component never reads (`ok`, `knowledgeCollections`). Declaring those
// fields here (even though unused) keeps this prop type structurally
// compatible with `typeof action`'s real return type — narrowing to just
// `entry`/`error` trips TS's "no properties in common" weak-type check
// against the other intents' return shapes.
export type KnowledgeEntryModalFetcher = FetcherWithComponents<
  | {
      entry?: unknown;
      error?: string;
      ok?: boolean;
      knowledgeCollections?: unknown;
    }
  | undefined
>;

export const KnowledgeEntryModal = forwardRef<
  KnowledgeEntryModalHandle,
  { fetcher: KnowledgeEntryModalFetcher }
>(function KnowledgeEntryModal({ fetcher }, ref) {
  const shopify = useAppBridge();
  const videoFetcher = useFetcher<{ videos: VideoFile[] }>();
  const imageFetcher = useFetcher<{ images: ImageFile[] }>();
  const productFetcher = useFetcher<{ products: ProductOption[] }>();

  const [form, setForm] = useState(EMPTY_FORM);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [productQuery, setProductQuery] = useState("");
  const modalRef = useRef<{ hideOverlay: () => void; showOverlay: () => void }>(
    null,
  );

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

  useImperativeHandle(ref, () => ({
    openNew: () => {
      setForm(EMPTY_FORM);
      setPickerMode(null);
    },
    openEdit: (entry) => {
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
        mediaStart:
          entry.mediaStartSeconds === null
            ? ""
            : formatTimestamp(entry.mediaStartSeconds),
        mediaEnd:
          entry.mediaEndSeconds === null
            ? ""
            : formatTimestamp(entry.mediaEndSeconds),
        fromQueryLog: false,
      });
      setPickerMode(null);
    },
    openFromQuery: (question) => {
      setForm({ ...EMPTY_FORM, question, fromQueryLog: true });
      setPickerMode(null);
      modalRef.current?.showOverlay();
    },
  }));

  const handleSave = () => {
    fetcher.submit(JSON.stringify({ intent: "save", ...form }), {
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
      mediaStart: "",
      mediaEnd: "",
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
      mediaStart: "",
      mediaEnd: "",
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
    // @shopify/polaris-types doesn't export the s-modal element class, so
    // there's no non-`any` type to ref it against.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            onChange={(event: Event) =>
              runProductSearch((event.currentTarget as HTMLInputElement).value)
            }
          />
          {isLoadingProducts ? (
            <s-paragraph>Loading products…</s-paragraph>
          ) : products.length === 0 ? (
            <s-paragraph tone="neutral" color="subdued">
              No products found.
            </s-paragraph>
          ) : (
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {products.map((product) => {
                const isOnSale =
                  product.compareAtPrice !== null &&
                  product.price !== null &&
                  parseFloat(product.compareAtPrice.replace(/[^0-9.]/g, "")) >
                    parseFloat(product.price.replace(/[^0-9.]/g, ""));
                return (
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
                          aspectRatio="1/1"
                          objectFit="cover"
                        />
                      ) : null}
                      <s-text>{product.title}</s-text>
                      {product.price ? (
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <s-text>{product.price}</s-text>
                          {isOnSale ? <s-badge tone="critical">Sale</s-badge> : null}
                        </s-stack>
                      ) : null}
                    </s-stack>
                  </s-clickable>
                );
              })}
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
              onChange={(event: Event) => {
                const value = (event.currentTarget as HTMLInputElement).value;
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
            onChange={(event: Event) => {
              const value = (event.currentTarget as HTMLTextAreaElement).value;
              setForm((prev) => ({ ...prev, answer: value }));
            }}
          />

          {form.mediaName ? (
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                {form.mediaType === "image" && form.mediaUrl ? (
                  <>
                    <s-thumbnail src={form.mediaUrl} alt={form.mediaName} size="base" />
                    <s-text>{form.mediaName}</s-text>
                  </>
                ) : (
                  <s-badge tone="info">
                    {form.mediaType === "image" ? "Image: " : "Video: "}
                    {form.mediaName}
                  </s-badge>
                )}
                <s-button variant="tertiary" onClick={removeMedia}>
                  Remove
                </s-button>
              </s-stack>
              {form.mediaType === "video" ? (
                <VideoTimestampFields
                  start={form.mediaStart}
                  end={form.mediaEnd}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      mediaStart: next.start ?? prev.mediaStart,
                      mediaEnd: next.end ?? prev.mediaEnd,
                    }))
                  }
                />
              ) : null}
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
          <s-button slot="secondary-actions" commandFor="knowledge-modal" command="--hide">
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
  );
});
