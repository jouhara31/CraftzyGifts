import { resolveMessagingImage } from "../utils/messaging";

export default function SupportAvatar({
  name = "",
  image = "",
  size = "md",
  className = "",
}) {
  const safeName = String(name || "").trim();
  const initial = safeName.charAt(0).toUpperCase() || "?";
  const resolvedImage = resolveMessagingImage(image);

  return (
    <span className={`support-avatar ${size} ${className}`.trim()} aria-hidden="true">
      {resolvedImage ? <img src={resolvedImage} alt="" /> : initial}
    </span>
  );
}
