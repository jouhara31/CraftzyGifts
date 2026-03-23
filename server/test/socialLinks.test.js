const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeInstagramUrl } = require("../utils/socialLinks");

test("normalizeInstagramUrl accepts and normalizes instagram profile links", () => {
  const result = normalizeInstagramUrl("instagram.com/CraftyStudio?utm_source=test");

  assert.equal(result.error, "");
  assert.equal(result.value, "https://www.instagram.com/CraftyStudio/");
});

test("normalizeInstagramUrl rejects non-profile or non-instagram links", () => {
  const badHost = normalizeInstagramUrl("https://example.com/crafty");
  const badPath = normalizeInstagramUrl("https://www.instagram.com/reel/abc123/");

  assert.match(badHost.error, /instagram/i);
  assert.match(badPath.error, /profile/i);
});
