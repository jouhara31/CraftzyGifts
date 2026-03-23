const isImageReference = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    text.startsWith("data:image/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  );
};

const readFilesAsDataUrls = async (files = []) => {
  const selected = Array.from(files || []).slice(0, 3);
  if (selected.length === 0) return [];

  const urls = await Promise.all(
    selected.map(
      (file) =>
        new Promise((resolve) => {
          if (!file || !String(file.type || "").startsWith("image/")) {
            resolve("");
            return;
          }

          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        })
    )
  );

  return urls.filter(Boolean).slice(0, 3);
};

export default function CustomizationPanel({ value, onChange }) {
  const referenceImages = Array.isArray(value?.referenceImageUrls)
    ? value.referenceImageUrls.slice(0, 3)
    : value?.referenceImageUrl
      ? [value.referenceImageUrl]
      : [];
  const imageReferences = referenceImages.filter(isImageReference);
  const textReferences = referenceImages.filter(
    (reference) => !isImageReference(reference)
  );

  const updateValue = (patch) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div>
      <div className="field">
        <label htmlFor="wishCardText">Wish/message card</label>
        <textarea
          id="wishCardText"
          placeholder="Happy Birthday, with love from..."
          value={value?.wishCardText || ""}
          onChange={(event) => updateValue({ wishCardText: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="specialNote">Packaging note</label>
        <input
          id="specialNote"
          type="text"
          placeholder="Any special handling instructions?"
          value={value?.specialNote || ""}
          onChange={(event) => updateValue({ specialNote: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="ideaDescription">Description (optional)</label>
        <textarea
          id="ideaDescription"
          placeholder="Describe your idea, style, color, or arrangement..."
          value={value?.ideaDescription || ""}
          onChange={(event) =>
            updateValue({ ideaDescription: event.target.value })
          }
        />
      </div>

      <div className="field">
        <label htmlFor="referenceImage">Reference images (max 3)</label>
        <div className="upload">
          <input
            id="referenceImage"
            type="file"
            accept="image/*"
            multiple
            onChange={async (event) => {
              const references = await readFilesAsDataUrls(event.target.files || []);
              updateValue({
                referenceImageUrls: references,
                referenceImageUrl: references[0] || "",
              });
            }}
          />
        </div>
        <p className="field-hint">
          Upload style references, hamper layout ideas, or color inspiration
          (up to 3).
        </p>
        <p className="field-hint">
          Personalized image needed? Upload it here before checkout.
        </p>
        {imageReferences.length > 0 && (
          <div className="reference-preview-grid">
            {imageReferences.map((source, index) => (
              <img
                key={`${source.slice(0, 32)}-${index}`}
                src={source}
                alt={`Reference ${index + 1}`}
                className="reference-preview-thumb"
              />
            ))}
          </div>
        )}
        {textReferences.length > 0 && <p className="field-hint">{textReferences.join(" | ")}</p>}
      </div>

      <div className="field">
        <label className="catalog-check">
          <input
            type="checkbox"
            checked={Boolean(value?.addGiftWrap)}
            onChange={(event) =>
              updateValue({ addGiftWrap: event.target.checked })
            }
          />
          Add premium gift wrap
        </label>
      </div>
    </div>
  );
}
