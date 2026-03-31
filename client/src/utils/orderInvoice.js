const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDocumentLoadingHtml = (title = "Preparing document", message = "Preparing PDF...") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #eef2f6;
        color: #17202a;
        font: 600 15px/1.5 "Segoe UI", "Aptos", sans-serif;
      }

      .loader {
        padding: 1rem 1.25rem;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(17, 24, 39, 0.12);
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
      }
    </style>
  </head>
  <body>
    <div class="loader">${escapeHtml(message)}</div>
  </body>
</html>`;

const buildDocumentViewerHtml = (
  pdfUrl,
  fileName,
  subtitle = "Backend-generated PDF document"
) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fileName)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #17202a;
        --muted: #5b6672;
        --line: #d7dde5;
        --surface: #f3f6fa;
        --card: rgba(255, 255, 255, 0.96);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        height: 100%;
      }

      body {
        display: grid;
        grid-template-rows: auto 1fr;
        background: linear-gradient(180deg, #eef3f8 0%, #e7edf4 100%);
        color: var(--ink);
        font: 14px/1.4 "Segoe UI", "Aptos", sans-serif;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--line);
        background: var(--card);
        backdrop-filter: blur(10px);
      }

      .title {
        min-width: 0;
      }

      .title strong,
      .title span {
        display: block;
      }

      .title strong {
        font-size: 14px;
      }

      .title span {
        color: var(--muted);
        font-size: 12px;
      }

      .actions {
        display: flex;
        gap: 8px;
      }

      .button {
        border: 1px solid #c7d0da;
        background: #ffffff;
        color: var(--ink);
        padding: 8px 12px;
        border-radius: 999px;
        text-decoration: none;
        font: 600 12px/1 "Segoe UI", "Aptos", sans-serif;
      }

      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: var(--surface);
      }
    </style>
  </head>
  <body>
    <header class="toolbar">
      <div class="title">
        <strong>${escapeHtml(fileName)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <div class="actions">
        <a class="button" href="${escapeHtml(pdfUrl)}" download="${escapeHtml(fileName)}">Download PDF</a>
      </div>
    </header>
    <iframe src="${escapeHtml(pdfUrl)}#toolbar=1&navpanes=0"></iframe>
  </body>
</html>`;

const renderInvoiceInWindow = (targetWindow, html) => {
  try {
    if (!targetWindow || targetWindow.closed) return false;
    targetWindow.document.open();
    targetWindow.document.write(html);
    targetWindow.document.close();
    return true;
  } catch {
    return false;
  }
};

const fallbackDownloadBlob = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = String(fileName || "invoice.pdf").trim() || "invoice.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const getInvoiceDocumentFileName = (response) => {
  const disposition = String(response?.headers?.get("content-disposition") || "").trim();
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = disposition.match(/filename="?([^\";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return "invoice.pdf";
};

export const prepareInvoiceDocumentWindow = () => {
  return preparePdfDocumentWindow({
    title: "Preparing invoice",
    message: "Preparing invoice PDF...",
  });
};

export const preparePdfDocumentWindow = ({
  title = "Preparing document",
  message = "Preparing PDF...",
} = {}) => {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return null;
  popup.document.open();
  popup.document.write(buildDocumentLoadingHtml(title, message));
  popup.document.close();
  return popup;
};

export const downloadInvoiceDocument = async (response, targetWindow = null) => {
  return downloadPdfDocument(response, targetWindow, {
    subtitle: "Backend-generated PDF invoice",
  });
};

export const downloadPdfDocument = async (
  response,
  targetWindow = null,
  { subtitle = "Backend-generated PDF document" } = {}
) => {
  const blob = await response.blob();
  const fileName = getInvoiceDocumentFileName(response);
  const objectUrl = URL.createObjectURL(blob);
  const html = buildDocumentViewerHtml(objectUrl, fileName, subtitle);

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30 * 60 * 1000);

  if (renderInvoiceInWindow(targetWindow, html)) {
    return;
  }

  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (renderInvoiceInWindow(popup, html)) {
    return;
  }

  fallbackDownloadBlob(blob, fileName);
};
