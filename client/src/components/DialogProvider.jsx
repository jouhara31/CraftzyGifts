import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DialogContext } from "./dialogContext";

const resolveDialogTone = (tone = "") => {
  const normalized = String(tone || "").trim().toLowerCase();
  if (normalized === "danger" || normalized === "success") {
    return normalized;
  }
  return "info";
};

const buildDialogConfig = (options = {}) => {
  const kind = options.kind === "confirm" ? "confirm" : "alert";
  const tone = resolveDialogTone(options.tone);

  return {
    kind,
    tone,
    title:
      String(options.title || "").trim() ||
      (kind === "confirm" ? "Confirm this action" : "Heads up"),
    message: String(options.message || "").trim(),
    confirmLabel:
      String(options.confirmLabel || "").trim() ||
      (kind === "confirm" ? "Confirm" : "Okay"),
    cancelLabel: kind === "confirm" ? String(options.cancelLabel || "").trim() || "Cancel" : "",
    eyebrow:
      String(options.eyebrow || "").trim() ||
      (tone === "success"
        ? "All set"
        : tone === "danger"
          ? "Sensitive action"
          : kind === "confirm"
            ? "Please confirm"
            : "Notice"),
  };
};

function DialogGlyph({ tone, kind }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="m8.7 12.2 2.1 2.1 4.7-5.1" />
      </svg>
    );
  }

  if (tone === "danger") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.5 20 18H4z" />
        <path d="M12 9.2v3.9" />
        <circle cx="12" cy="15.7" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (kind === "confirm") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Z" />
        <path d="M12 8.8v3.8" />
        <circle cx="12" cy="15.6" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10.2v5" />
      <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const queueRef = useRef([]);
  const previouslyFocusedRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const showDialog = useCallback((options = {}) => {
    const nextDialog = buildDialogConfig(options);
    return new Promise((resolve) => {
      if (resolverRef.current) {
        queueRef.current.push({ dialog: nextDialog, resolve });
        return;
      }
      resolverRef.current = resolve;
      setDialog(nextDialog);
    });
  }, []);

  const settleDialog = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);

    const next = queueRef.current.shift();
    if (next) {
      resolverRef.current = next.resolve;
      setDialog(next.dialog);
      return;
    }

    setDialog(null);
  }, []);

  const showAlert = useCallback(
    (options = {}) =>
      showDialog({
        ...options,
        kind: "alert",
      }),
    [showDialog]
  );

  const showConfirm = useCallback(
    (options = {}) =>
      showDialog({
        ...options,
        kind: "confirm",
      }),
    [showDialog]
  );

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      settleDialog(dialog.kind === "confirm" ? false : true);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      const focusTarget = previouslyFocusedRef.current;
      if (focusTarget && typeof focusTarget.focus === "function") {
        window.setTimeout(() => {
          focusTarget.focus();
        }, 0);
      }
    };
  }, [dialog, settleDialog]);

  const contextValue = useMemo(
    () => ({
      showAlert,
      showConfirm,
    }),
    [showAlert, showConfirm]
  );

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {dialog ? (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            settleDialog(dialog.kind === "confirm" ? false : true);
          }}
        >
          <div
            className={`app-dialog-card is-${dialog.tone}`.trim()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={dialog.message ? descriptionId : undefined}
          >
            <div className="app-dialog-aura" aria-hidden="true" />
            <div className="app-dialog-topline" aria-hidden="true" />
            <div className="app-dialog-body">
              <div className={`app-dialog-mark is-${dialog.tone}`.trim()} aria-hidden="true">
                <DialogGlyph tone={dialog.tone} kind={dialog.kind} />
              </div>
              <div className="app-dialog-copy">
                <p className="app-dialog-eyebrow">{dialog.eyebrow}</p>
                <h3 id={titleId} className="app-dialog-title">
                  {dialog.title}
                </h3>
                {dialog.message ? (
                  <p id={descriptionId} className="app-dialog-message">
                    {dialog.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="app-dialog-actions">
              {dialog.kind === "confirm" ? (
                <button
                  className="btn ghost app-dialog-action"
                  type="button"
                  onClick={() => settleDialog(false)}
                >
                  {dialog.cancelLabel}
                </button>
              ) : null}
              <button
                className={`btn primary app-dialog-action app-dialog-confirm ${
                  dialog.tone === "danger" ? "is-danger" : ""
                }`.trim()}
                type="button"
                autoFocus
                onClick={() => settleDialog(true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}
