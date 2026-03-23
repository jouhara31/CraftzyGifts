const normalizeText = (value = "") => String(value || "").trim();

export const buildPaymentStatusPath = ({
  paymentGroupId = "",
  orderId = "",
  outcome = "",
} = {}) => {
  const params = new URLSearchParams();
  const normalizedPaymentGroupId = normalizeText(paymentGroupId);
  const normalizedOrderId = normalizeText(orderId);
  const normalizedOutcome = normalizeText(outcome);

  if (normalizedPaymentGroupId) {
    params.set("paymentGroupId", normalizedPaymentGroupId);
  }
  if (normalizedOrderId) {
    params.set("orderId", normalizedOrderId);
  }
  if (normalizedOutcome) {
    params.set("outcome", normalizedOutcome);
  }

  const query = params.toString();
  return query ? `/payment-status?${query}` : "/payment-status";
};
