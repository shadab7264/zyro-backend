const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

// ✅ EXISTING
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ NEW (IMAGE UPLOAD)
const multer = require("multer");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

/* ================== ✅ IMAGE UPLOAD SETUP ================== */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// serve images
app.use("/uploads", express.static("uploads"));

/* ================== ✅ MONGODB CONNECT ================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log(err));

/* ================== ✅ USER SCHEMA ================== */
const User = mongoose.model("User", {
  name: String,
  email: String,
  password: String,
});

/* ================== ✅ ORDER SCHEMA ================== */
const orderSchema = new mongoose.Schema({
  orderId: String,
  paymentId: String,
  amount: Number,
  status: String,
  userId: String,
});

const Order = mongoose.model("Order", orderSchema);

/* ================== ✅ PRODUCT SCHEMA (UPGRADED) ================== */
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  stock: Number,
  category: String,      // 🔥 NEW
  subcategory: String    // 🔥 NEW
});

const Product = mongoose.model("Product", productSchema);

/* ================== ✅ TEST ROUTE ================== */
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

/* ================== ✅ GET PRODUCTS (FILTER SUPPORT) ================== */
app.get("/products", async (req, res) => {
  try {
    const { category, subcategory } = req.query;

    let filter = {};
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;

    const data = await Product.find(filter).sort({ _id: -1 });

    res.json(data);
  } catch {
    res.json([]);
  }
});

/* ================== ✅ ADD PRODUCT (WITH IMAGE UPLOAD) ================== */
app.post("/add-product", upload.single("image"), async (req, res) => {
  try {
    const { name, price, stock, category, subcategory } = req.body;

    const imageUrl = req.file
      ? `https://zyro-backend-7jyw.onrender.com/uploads/${req.file.filename}`
      : "";

    const newProduct = await Product.create({
      name,
      price,
      stock,
      image: imageUrl,
      category,
      subcategory
    });

    res.json({ success: true, product: newProduct });

  } catch (err) {
    console.log("ADD PRODUCT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ UPDATE PRODUCT ================== */
app.put("/update-product/:id", async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ success: true, product: updated });

  } catch (err) {
    console.log("UPDATE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ DELETE PRODUCT ================== */
app.delete("/delete-product/:id", async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

/* ================== ✅ ADMIN DASHBOARD (NEW) ================== */
app.get("/admin-stats", async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();

    const revenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalProducts = await Product.countDocuments();

    res.json({
      totalOrders,
      totalRevenue: revenue[0]?.total || 0,
      totalProducts
    });

  } catch {
    res.json({ totalOrders: 0, totalRevenue: 0, totalProducts: 0 });
  }
});

/* ================== ✅ SIGNUP ================== */
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.json({ success: true, user });

  } catch (err) {
    console.log("SIGNUP ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ LOGIN ================== */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "Wrong password" });
    }

    const token = jwt.sign(
      { id: user._id },
      "secret123",
      { expiresIn: "1d" }
    );

    res.json({ success: true, token, user });

  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ RAZORPAY ================== */
const razorpay = new Razorpay({
  key_id: "rzp_test_SauXSAhwsQllEv",
  key_secret: "N688DkfL8jvqT4LMJThp0h78",
});

/* ================== ✅ CREATE ORDER ================== */
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount required" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
    });

    res.json(order);

  } catch (err) {
    console.log("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================== ✅ VERIFY PAYMENT ================== */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", "N688DkfL8jvqT4LMJThp0h78")
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      return res.json({ success: true });
    } else {
      return res.json({ success: false });
    }

  } catch (err) {
    console.log("VERIFY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ GET ALL ORDERS ================== */
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ _id: -1 });
    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ================== ✅ GET USER ORDERS ================== */
app.get("/my-orders/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId });
    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

/* ================== ✅ START SERVER ================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});