import { useEffect, useMemo, useState } from "react";
import { getProductImages } from "../utils/productMedia";

const DEFAULT_INTERVAL_MS = 1200;

export default function ProductHoverImage({
  product,
  alt,
  className = "",
  loading = "lazy",
  intervalMs = DEFAULT_INTERVAL_MS,
  initialIndex = 0,
  swapOnHover = true,
  onMouseEnter,
  onMouseLeave,
  ...imgProps
}) {
  const images = useMemo(() => getProductImages(product), [product]);
  const fallbackIndex = images.length > 0 ? Math.min(initialIndex, images.length - 1) : 0;
  const [activeIndex, setActiveIndex] = useState(fallbackIndex);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    setActiveIndex(fallbackIndex);
  }, [fallbackIndex]);

  useEffect(() => {
    if (!swapOnHover || !isHovering || images.length <= 1) return undefined;

    const timerId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, intervalMs);

    return () => window.clearInterval(timerId);
  }, [images.length, intervalMs, isHovering, swapOnHover]);

  const activeImage = images[activeIndex] || images[0] || "";

  return (
    <img
      {...imgProps}
      className={className}
      src={activeImage}
      alt={alt}
      loading={loading}
      onMouseEnter={(event) => {
        if (swapOnHover) {
          setIsHovering(true);
        }
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        if (swapOnHover) {
          setIsHovering(false);
          setActiveIndex(fallbackIndex);
        }
        onMouseLeave?.(event);
      }}
    />
  );
}
