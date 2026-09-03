import styles from "../../styles/chat-widget-preview.module.css";

export type ChatProduct = {
  title?: string;
  handle?: string;
  url?: string;
  price?: { amount?: string; currencyCode?: string } | null;
  image?: string | null;
  inStock?: boolean;
};

function formatPrice(price: ChatProduct["price"]) {
  if (!price?.amount) return null;
  const amount = Number(price.amount);
  if (Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: price.currencyCode || "USD",
    }).format(amount);
  } catch {
    return `${price.amount} ${price.currencyCode ?? ""}`.trim();
  }
}

export function ProductCardRow({ products }: { products: ChatProduct[] }) {
  if (products.length === 0) return null;

  return (
    <div className={styles.previewProductRow}>
      {products.map((product, index) => (
        <a
          key={product.handle ?? index}
          href={product.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className={styles.previewProductCard}
        >
          {product.image ? (
            <img
              src={product.image}
              alt={product.title ?? ""}
              className={styles.previewProductImage}
            />
          ) : (
            <div className={styles.previewProductImagePlaceholder} />
          )}
          <div className={styles.previewProductInfo}>
            <span className={styles.previewProductTitle}>{product.title}</span>
            <span className={styles.previewProductMeta}>
              {formatPrice(product.price) ? (
                <span className={styles.previewProductPrice}>
                  {formatPrice(product.price)}
                </span>
              ) : null}
              {!product.inStock ? (
                <span className={styles.previewProductOutOfStock}>
                  Out of stock
                </span>
              ) : null}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
