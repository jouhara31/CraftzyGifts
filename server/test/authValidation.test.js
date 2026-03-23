const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateRegistrationPayload,
  validateLoginPayload,
} = require("../utils/authValidation");

test("validateRegistrationPayload normalizes valid seller payloads", () => {
  const result = validateRegistrationPayload({
    name: "  Seller Name  ",
    email: " Seller@Example.com ",
    password: "supersecure123",
    role: "seller",
    storeName: "  Craft Studio ",
    phone: "+91 98765 43210",
  });

  assert.equal(result.error, "");
  assert.deepEqual(result.value, {
    name: "Seller Name",
    email: "seller@example.com",
    password: "supersecure123",
    role: "seller",
    storeName: "Craft Studio",
    phone: "+919876543210",
  });
});

test("validateRegistrationPayload rejects weak or malformed input", () => {
  const result = validateRegistrationPayload({
    name: "A",
    email: "not-an-email",
    password: "123",
  });

  assert.match(result.error, /name must be between/i);
});

test("validateLoginPayload accepts normalized email and password", () => {
  const result = validateLoginPayload({
    email: " User@Example.com ",
    password: "secret-value",
  });

  assert.equal(result.error, "");
  assert.deepEqual(result.value, {
    email: "user@example.com",
    password: "secret-value",
  });
});

test("validateLoginPayload rejects invalid login payloads", () => {
  const result = validateLoginPayload({
    email: "invalid-email",
    password: "",
  });

  assert.match(result.error, /valid email and password/i);
});
