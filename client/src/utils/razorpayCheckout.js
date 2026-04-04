const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let razorpayScriptPromise;

export const readStoredUserProfile = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return { name: "", email: "", contact: "" };
    const parsed = JSON.parse(raw);
    return {
      name: String(parsed?.name || "").trim(),
      email: String(parsed?.email || "").trim(),
      contact: String(parsed?.phone || "").trim(),
    };
  } catch {
    return { name: "", email: "", contact: "" };
  }
};

export const loadRazorpayScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Payment checkout is only available in the browser."));
  }
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load payment checkout. Please try again.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Unable to load payment checkout. Please try again."));
    document.body.appendChild(script);
  }).catch((error) => {
    razorpayScriptPromise = undefined;
    throw error;
  });

  return razorpayScriptPromise;
};

export const openRazorpayCheckout = async ({
  checkout,
  prefill,
  notes,
  onSuccess,
  onDismiss,
  onFailure,
}) => {
  const Razorpay = await loadRazorpayScript();
  if (!Razorpay) {
    throw new Error("Payment checkout is unavailable right now.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    const resolveOnce = finish(resolve);
    const rejectOnce = finish(reject);

    const instance = new Razorpay({
      key: checkout?.keyId,
      amount: checkout?.amount,
      currency: checkout?.currency || "INR",
      order_id: checkout?.orderId,
      name: String(checkout?.platformName || "CraftzyGifts").trim() || "CraftzyGifts",
      description: "Secure order payment",
      prefill: {
        name: String(prefill?.name || "").trim(),
        email: String(prefill?.email || "").trim(),
        contact: String(prefill?.contact || "").trim(),
      },
      notes: notes && typeof notes === "object" ? notes : {},
      theme: {
        color: "#7b1c26",
      },
      retry: {
        enabled: true,
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          onDismiss?.();
          resolveOnce({ dismissed: true });
        },
      },
      handler: async (response) => {
        try {
          const result = await onSuccess?.(response);
          resolveOnce(result || response);
        } catch (error) {
          rejectOnce(error);
        }
      },
    });

    instance.on("payment.failed", (event) => {
      const errorDetails = event?.error || {};
      const message = String(
        errorDetails?.description || errorDetails?.reason || "Payment failed. Please try again."
      ).trim();
      const paymentError = new Error(message);
      paymentError.details = {
        ...errorDetails,
        razorpay_order_id: String(
          errorDetails?.metadata?.order_id || checkout?.orderId || ""
        ).trim(),
        razorpay_payment_id: String(errorDetails?.metadata?.payment_id || "").trim(),
      };
      Promise.resolve(onFailure?.(paymentError, event))
        .catch(() => null)
        .finally(() => rejectOnce(paymentError));
    });

    instance.open();
  });
};
