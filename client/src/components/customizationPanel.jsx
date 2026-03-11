const OPTION_GROUPS = [
  { key: "giftBoxes", label: "Gift box" },
  { key: "chocolates", label: "Chocolates" },
  { key: "frames", label: "Frame style" },
  { key: "perfumes", label: "Perfume" },
  { key: "cards", label: "Card type" },
];
const EXCLUDED_CATALOG_GROUP_IDS = new Set(["custom_hamper_items"]);
const EXCLUDED_CATALOG_GROUP_NAMES = new Set(["custom hamper items"]);

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

export default function CustomizationPanel({ product, value, onChange }) {
  const selectedOptions = value?.selectedOptions || {};
  const referenceImages = Array.isArray(value?.referenceImageUrls)
    ? value.referenceImageUrls.slice(0, 3)
    : value?.referenceImageUrl
      ? [value.referenceImageUrl]
      : [];
  const imageReferences = referenceImages.filter(isImageReference);
  const textReferences = referenceImages.filter(
    (reference) => !isImageReference(reference)
  );
  const availableGroups = OPTION_GROUPS.filter((group) => {
    const options = product?.customizationOptions?.[group.key];
    return Array.isArray(options) && options.length > 0;
  });
  const sellerCatalogGroups = (Array.isArray(product?.customizationCatalog)
    ? product.customizationCatalog
    : []
  )
    .filter((category) => {
      const id = String(category?.id || "").trim().toLowerCase();
      const name = String(category?.name || "").trim().toLowerCase();
      return (
        !EXCLUDED_CATALOG_GROUP_IDS.has(id) &&
        !EXCLUDED_CATALOG_GROUP_NAMES.has(name)
      );
    })
    .map((category) => ({
      id: String(category?.id || ""),
      name: String(category?.name || "").trim(),
      items: (Array.isArray(category?.items) ? category.items : [])
        .filter((item) => item?.active !== false)
        .map((item) => ({
          id: String(item?.id || ""),
          name: String(item?.name || "").trim(),
          stock: Number(item?.stock || 0),
          price: Number(item?.price || 0),
        }))
        .filter((item) => item.id && item.name),
    }))
    .filter((category) => category.id && category.name && category.items.length > 0);

  const updateValue = (patch) => {
    onChange({ ...value, ...patch });
  };

  const updateSelection = (key, option) => {
    const nextSelections = { ...selectedOptions };
    if (!option) {
      delete nextSelections[key];
    } else {
      nextSelections[key] = option;
    }

    updateValue({
      selectedOptions: nextSelections,
    });
  };

  const getCatalogSelectionValue = (group) => {
    const selected = selectedOptions[group.id];
    if (!selected) return "";

    const selectedText = String(selected).trim();
    if (!selectedText) return "";

    const direct = group.items.find((item) => item.id === selectedText);
    if (direct) return direct.id;

    const byName = group.items.find(
      (item) => item.name.toLowerCase() === selectedText.toLowerCase()
    );
    return byName?.id || "";
  };

  return (
    <div>
      {sellerCatalogGroups.length > 0 ? (
        <div className="field-row">
          {sellerCatalogGroups.map((group) => (
            <div className="field" key={group.id}>
              <label htmlFor={`catalog-${group.id}`}>{group.name}</label>
              <select
                id={`catalog-${group.id}`}
                value={getCatalogSelectionValue(group)}
                onChange={(event) => updateSelection(group.id, event.target.value)}
              >
                <option value="">No selection</option>
                {group.items.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.stock <= 0}
                  >
                    {item.name}
                    {item.price > 0 ? ` (+₹${item.price})` : ""}
                    {item.stock <= 0 ? " - Out of stock" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : availableGroups.length === 0 ? (
        <p className="field-hint">
          Seller has not added preset options yet. You can still add a message
          and reference images.
        </p>
      ) : (
        <div className="field-row">
          {availableGroups.map((group) => (
            <div className="field" key={group.key}>
              <label htmlFor={group.key}>{group.label}</label>
              <select
                id={group.key}
                value={selectedOptions[group.key] || ""}
                onChange={(event) =>
                  updateSelection(group.key, event.target.value)
                }
              >
                <option value="">No selection</option>
                {product.customizationOptions[group.key].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

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
