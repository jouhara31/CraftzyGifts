import { useEffect } from "react";

const scrollToCurrentHash = () => {
  if (typeof window === "undefined") return;
  const hash = String(window.location.hash || "").trim();
  if (!hash) return;

  const targetId = decodeURIComponent(hash.slice(1));
  if (!targetId) return;

  window.requestAnimationFrame(() => {
    const target =
      document.getElementById(targetId) ||
      document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
};

export default function useHashScroll() {
  useEffect(() => {
    scrollToCurrentHash();
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => window.removeEventListener("hashchange", scrollToCurrentHash);
  }, []);
}
