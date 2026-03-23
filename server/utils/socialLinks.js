const INSTAGRAM_PROFILE_SEGMENT_BLOCKLIST = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

const normalizeInstagramUrl = (value, { allowEmpty = true } = {}) => {
  const raw = String(value || "").trim();
  if (!raw) {
    if (allowEmpty) {
      return { value: "", error: "" };
    }
    return { value: "", error: "Instagram profile link is required." };
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^@+/, "instagram.com/")}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { value: "", error: "Please enter a valid Instagram profile URL." };
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    return { value: "", error: "Please enter a valid Instagram profile URL." };
  }

  const hostname = String(url.hostname || "").trim().toLowerCase();
  if (!["instagram.com", "www.instagram.com", "m.instagram.com"].includes(hostname)) {
    return { value: "", error: "Only Instagram profile links are allowed." };
  }

  const pathSegments = String(url.pathname || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const profileSegment = String(pathSegments[0] || "").trim();

  if (!profileSegment || INSTAGRAM_PROFILE_SEGMENT_BLOCKLIST.has(profileSegment.toLowerCase())) {
    return { value: "", error: "Please enter a valid Instagram profile link." };
  }

  url.protocol = "https:";
  url.hostname = "www.instagram.com";
  url.pathname = `/${profileSegment.replace(/^@+/, "")}/`;
  url.search = "";
  url.hash = "";

  return { value: url.toString(), error: "" };
};

module.exports = {
  normalizeInstagramUrl,
};
