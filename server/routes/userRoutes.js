const express = require("express");
const router = express.Router();
const {
  getMe,
  updateMe,
  changeMyPassword,
  deleteMe,
  submitSellerContactRequest,
  listMyContactRequests,
  listMyNotifications,
  markMyNotificationsRead,
} = require("../controllers/userController");
const { auth, optionalAuth, requireApprovedSeller } = require("../middleware/auth");

router.get("/me", auth, getMe);
router.patch("/me", auth, updateMe);
router.patch("/me/password", auth, changeMyPassword);
router.delete("/me", auth, deleteMe);
router.get("/me/contact-requests", auth, requireApprovedSeller, listMyContactRequests);
router.get("/me/notifications", auth, listMyNotifications);
router.patch("/me/notifications/read", auth, markMyNotificationsRead);
router.post("/sellers/:sellerId/contact", optionalAuth, submitSellerContactRequest);

module.exports = router;
