const { buildUploadedFileUrl } = require("../utils/uploadStorage");

exports.uploadMyImageAsset = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please choose an image file to upload." });
  }

  const relativeFolder = String(req.uploadRelativeFolder || "").trim();
  const fileName = String(req.file.filename || "").trim();
  if (!relativeFolder || !fileName) {
    return res.status(500).json({ message: "Uploaded file could not be resolved." });
  }

  return res.status(201).json({
    message: "Image uploaded successfully.",
    file: {
      url: buildUploadedFileUrl(relativeFolder, fileName),
      mimeType: req.file.mimetype,
      size: Number(req.file.size || 0),
      originalName: req.file.originalname || "",
    },
  });
};
