const {
  ensurePlatformSettings,
  toPublicPlatformSettingsPayload,
} = require("../utils/platformSettings");
const { handleControllerError } = require("../utils/apiError");

exports.getPublicPlatformSettings = async (_req, res) => {
  try {
    const settings = await ensurePlatformSettings();
    return res.json(toPublicPlatformSettingsPayload(settings));
  } catch (error) {
    return handleControllerError(res, error);
  }
};
