const express = require("express");
const router = express.Router();
const { getMe, updateMe, deleteMe } = require("../controllers/userController");
const { auth } = require("../middleware/auth");

router.get("/me", auth, getMe);
router.patch("/me", auth, updateMe);
router.delete("/me", auth, deleteMe);

module.exports = router;
