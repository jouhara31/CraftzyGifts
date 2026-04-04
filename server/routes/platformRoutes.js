const express = require("express");
const router = express.Router();
const { getPublicPlatformSettings } = require("../controllers/platformController");

router.get("/settings", getPublicPlatformSettings);

module.exports = router;
