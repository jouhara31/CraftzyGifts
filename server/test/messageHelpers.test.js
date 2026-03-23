const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_MESSAGE_LENGTH,
  buildMessagePreview,
  validateMessageText,
} = require("../utils/messageHelpers");

test("validateMessageText trims and accepts a normal message", () => {
  const result = validateMessageText("  Hello   admin team  ");

  assert.equal(result.error, "");
  assert.equal(result.value, "Hello admin team");
});

test("validateMessageText rejects empty or oversized messages", () => {
  const empty = validateMessageText("   ");
  const oversized = validateMessageText("a".repeat(MAX_MESSAGE_LENGTH + 1));

  assert.match(empty.error, /cannot be empty/i);
  assert.match(oversized.error, /cannot exceed/i);
});

test("buildMessagePreview shortens long copy safely", () => {
  const preview = buildMessagePreview("A".repeat(140), 40);

  assert.equal(preview.length <= 40, true);
  assert.match(preview, /\.\.\.$/);
});
