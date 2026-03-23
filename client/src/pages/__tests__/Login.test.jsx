import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import Login from "../Login";

vi.mock("../../components/Header", () => ({
  default: () => <div data-testid="header" />,
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const renderLogin = (entry = "/login") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Login />
      <LocationDisplay />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

it("shows notice passed through navigation state", async () => {
  renderLogin({
    pathname: "/login",
    state: { notice: "Session expired. Please login again." },
  });

  expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
});

it("shows inline error on failed login and clears on input change", async () => {
  const user = userEvent.setup();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: vi.fn().mockResolvedValue({ message: "Invalid credentials" }),
  });

  renderLogin();

  await user.type(screen.getByLabelText(/email/i), "user@example.com");
  await user.type(screen.getByLabelText(/password/i, { selector: "input" }), "wrongpass");
  await user.click(screen.getByRole("button", { name: /login/i }));

  expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();

  await user.type(screen.getByLabelText(/password/i, { selector: "input" }), "a");
  await waitFor(() =>
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument()
  );
});

it("stores session and navigates to customer home on success", async () => {
  const user = userEvent.setup();
  const dispatchSpy = vi.spyOn(window, "dispatchEvent");
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      token: "token-123",
      user: {
        name: "Customer",
        role: "customer",
        profileImage: "avatar.png",
      },
    }),
  });

  renderLogin();

  await user.type(screen.getByLabelText(/email/i), "customer@example.com");
  await user.type(screen.getByLabelText(/password/i, { selector: "input" }), "secret");
  await user.click(screen.getByRole("button", { name: /login/i }));

  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/")
  );

  expect(localStorage.getItem("token")).toBe("token-123");
  expect(localStorage.getItem("user_profile_image")).toBe("avatar.png");
  expect(JSON.parse(localStorage.getItem("user")).role).toBe("customer");
  expect(dispatchSpy).toHaveBeenCalled();
});

it("navigates to seller dashboard on seller login", async () => {
  const user = userEvent.setup();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      token: "token-456",
      user: {
        name: "Seller",
        role: "seller",
        sellerStatus: "approved",
      },
    }),
  });

  renderLogin();

  await user.type(screen.getByLabelText(/email/i), "seller@example.com");
  await user.type(screen.getByLabelText(/password/i, { selector: "input" }), "secret");
  await user.click(screen.getByRole("button", { name: /login/i }));

  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/seller/dashboard")
  );
});

it("navigates pending sellers to the approval page", async () => {
  const user = userEvent.setup();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      token: "token-789",
      user: {
        name: "Pending seller",
        role: "seller",
        sellerStatus: "pending",
      },
    }),
  });

  renderLogin();

  await user.type(screen.getByLabelText(/email/i), "pending@example.com");
  await user.type(screen.getByLabelText(/password/i, { selector: "input" }), "secret");
  await user.click(screen.getByRole("button", { name: /login/i }));

  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/seller/pending")
  );
});
