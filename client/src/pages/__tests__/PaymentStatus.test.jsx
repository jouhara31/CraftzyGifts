import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PaymentStatus from "../PaymentStatus";

vi.mock("../../components/Header", () => ({
  default: () => <div data-testid="header" />,
}));

const renderPaymentStatus = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PaymentStatus />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  window.sessionStorage.clear();
  localStorage.setItem("token", "token-123");
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

it("shows confirmed payment details when the gateway has marked the order as paid", async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue([
      {
        _id: "order-1",
        paymentGroupId: "pg_paid",
        paymentStatus: "paid",
        status: "placed",
        total: 1499,
        product: { name: "Gift Box" },
      },
    ]),
  });

  renderPaymentStatus("/payment-status?paymentGroupId=pg_paid");

  expect(
    await screen.findByRole("heading", { level: 3, name: /payment confirmed/i })
  ).toBeInTheDocument();
  expect(screen.getByText(/gift box/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry from orders/i })).not.toBeInTheDocument();
});

it("shows retry guidance when the payment sheet was cancelled", async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue([
      {
        _id: "order-2",
        paymentGroupId: "pg_cancelled",
        paymentStatus: "pending",
        status: "pending_payment",
        total: 899,
        product: { name: "Custom Hamper" },
      },
    ]),
  });

  renderPaymentStatus({
    pathname: "/payment-status?paymentGroupId=pg_cancelled&outcome=cancelled",
    state: {
      paymentGroupId: "pg_cancelled",
      outcome: "cancelled",
      notice: "Payment cancelled by the user.",
    },
  });

  expect(
    await screen.findByRole("heading", { level: 3, name: /payment was cancelled/i })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /retry from orders/i })).toBeInTheDocument();
});
