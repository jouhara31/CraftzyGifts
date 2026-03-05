const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, storeName, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedRole = role === "seller" ? "seller" : "customer";
    const sellerStatus = normalizedRole === "seller" ? "pending" : "approved";

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: normalizedRole,
      sellerStatus,
      storeName,
      phone,
    });
    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: String(user._id || ""),
        name: user.name,
        email: user.email,
        role: user.role,
        sellerStatus: user.sellerStatus,
        storeName: user.storeName,
        phone: user.phone,
        supportEmail: user.supportEmail,
        profileImage: user.profileImage,
        storeCoverImage: user.storeCoverImage,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
