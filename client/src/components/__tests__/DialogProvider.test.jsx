import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DialogProvider } from "../DialogProvider";
import { useDialog } from "../../hooks/useDialog";

function DialogHarness() {
  const { showAlert, showConfirm } = useDialog();
  const [result, setResult] = useState("idle");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await showConfirm({
            tone: "danger",
            title: "Delete this item?",
            message: "This action cannot be undone.",
            confirmLabel: "Delete",
            cancelLabel: "Keep",
          });
          setResult(`confirm:${confirmed}`);
        }}
      >
        Open confirm
      </button>
      <button
        type="button"
        onClick={async () => {
          await showAlert({
            tone: "success",
            title: "Saved",
            message: "Changes were applied successfully.",
            confirmLabel: "Nice",
          });
          setResult("alert:closed");
        }}
      >
        Open alert
      </button>
      <p>{result}</p>
    </>
  );
}

test("renders shared confirm and alert dialogs and resolves their actions", async () => {
  const user = userEvent.setup();

  render(
    <DialogProvider>
      <DialogHarness />
    </DialogProvider>
  );

  await user.click(screen.getByRole("button", { name: "Open confirm" }));
  expect(screen.getByRole("alertdialog", { name: "Delete this item?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keep" }));
  expect(await screen.findByText("confirm:false")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Open alert" }));
  expect(screen.getByRole("alertdialog", { name: "Saved" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Nice" }));
  expect(await screen.findByText("alert:closed")).toBeInTheDocument();
});
