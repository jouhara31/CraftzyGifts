const asText = (value) => String(value ?? "").trim();

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getCustomizationMode = (customization = {}) =>
  asText(customization?.mode).toLowerCase();

export const getCustomizationSelectedItems = (customization = {}) =>
  (Array.isArray(customization?.selectedItems) ? customization.selectedItems : [])
    .map((item) => ({
      ...item,
      id: asText(item?.id),
      name: asText(item?.name),
      mainItem: asText(item?.mainItem),
      subItem: asText(item?.subItem),
      category: asText(item?.category),
      type: asText(item?.type).toLowerCase(),
      size: asText(item?.size),
      quantity: Math.max(0, Number.parseInt(item?.quantity, 10) || 0),
      price: asNumber(item?.price, 0),
      image: asText(item?.image),
    }))
    .filter((item) => item.quantity > 0 || item.name || item.mainItem);

export const getCustomizationBaseItems = (customization = {}) =>
  getCustomizationSelectedItems(customization).filter((item) => item.type === "base");

export const getCustomizationAddonItems = (customization = {}) =>
  getCustomizationSelectedItems(customization).filter((item) => item.type !== "base");

const normalizeBulkBaseSelection = (entry = {}) => {
  const quantity = Math.max(0, Number.parseInt(entry?.quantity, 10) || 0);
  const id = asText(entry?.id);
  const name = asText(entry?.name);
  const mainItem = asText(entry?.mainItem || entry?.categoryName);
  const subItem = asText(entry?.subItem);
  const category = asText(entry?.category || entry?.categoryName || entry?.mainItem);
  const size = asText(entry?.size);
  const image = asText(entry?.image);
  const price = asNumber(entry?.price, 0);

  if ((!id && !name && !subItem) || quantity < 1) return null;

  return {
    id,
    name: name || [mainItem, subItem].filter(Boolean).join(" - ") || "Base item",
    mainItem,
    subItem,
    category,
    categoryId: asText(entry?.categoryId),
    size,
    image,
    price,
    quantity,
  };
};

export const getBulkBaseSelections = (customization = {}) => {
  const savedSelections = Array.isArray(customization?.bulkPlan?.baseSelections)
    ? customization.bulkPlan.baseSelections
        .map((entry) => normalizeBulkBaseSelection(entry))
        .filter(Boolean)
    : [];

  if (savedSelections.length > 0) return savedSelections;

  return getCustomizationBaseItems(customization)
    .map((item) =>
      normalizeBulkBaseSelection({
        ...item,
        categoryName: item.category || item.mainItem,
      })
    )
    .filter(Boolean);
};

export const getBulkHamperCount = (customization = {}) => {
  const explicit = Number.parseInt(customization?.bulkPlan?.totalHampers, 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  return getBulkBaseSelections(customization).reduce(
    (sum, entry) => sum + Math.max(0, entry.quantity),
    0
  );
};

export const isBulkHamperCustomization = (customization = {}) => {
  if (getCustomizationMode(customization) === "build_bulk") return true;
  const bulkSelections = getBulkBaseSelections(customization);
  if (bulkSelections.length > 1) return true;
  return bulkSelections.some((entry) => entry.quantity > 1);
};

export const formatBaseSelectionLabel = (entry = {}) => {
  const primary = asText(entry?.subItem || entry?.name || entry?.mainItem || "Base");
  const meta = [
    asText(entry?.category || entry?.mainItem),
    asText(entry?.size),
  ].filter(Boolean);

  const filteredMeta = meta.filter((value) => value.toLowerCase() !== primary.toLowerCase());
  return filteredMeta.length > 0 ? `${primary} (${filteredMeta.join(" | ")})` : primary;
};

export const buildBaseSelectionSummary = (customization = {}, maxItems = 4) => {
  const selections = getBulkBaseSelections(customization);
  if (selections.length === 0) return "";

  const lines = selections.slice(0, maxItems).map(
    (entry) => `${formatBaseSelectionLabel(entry)} x${entry.quantity}`
  );
  if (selections.length > maxItems) {
    lines.push(`+${selections.length - maxItems} more`);
  }
  return lines.join(", ");
};

export const buildAddonItemSummary = (customization = {}, maxItems = 4) => {
  const items = getCustomizationAddonItems(customization);
  if (items.length === 0) return "";

  const lines = items.slice(0, maxItems).map((item) => {
    const label = asText(item?.subItem || item?.name || item?.mainItem || "Item");
    return `${label} x${Math.max(0, Number(item?.quantity || 0))}`;
  });
  if (items.length > maxItems) {
    lines.push(`+${items.length - maxItems} more`);
  }
  return lines.join(", ");
};
