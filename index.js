const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

// ✅ AUTH
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ CLOUDINARY
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

app.use(cors());
app.use(express.json());

/* ================== ✅ CLOUDINARY CONFIG ================== */
cloudinary.config({
  cloud_name: "dom7vhjen",
  api_key: "727246957856766",
  api_secret: "GG8SWwESk2FLy5y8uzh-4M53vOY"
});

/* ================== ✅ MULTER CLOUD STORAGE ================== */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

/* ================== ✅ MONGODB CONNECT ================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log(err));

/* ================== ✅ USER ================== */
const User = mongoose.model("User", {
  name: String,
  email: String,
  password: String,
});

/* ================== ✅ ORDER ================== */
const orderSchema = new mongoose.Schema({
  orderId: String,
  paymentId: String,
  amount: Number,
  status: String,
  userId: String,
});
const Order = mongoose.model("Order", orderSchema);

/* ================== ✅ PRODUCT ================== */
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  stock: Number,
  category: String,
  subcategory: String
});
const Product = mongoose.model("Product", productSchema);

/* ================== ✅ TEST ================== */
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

/* ================== ✅ IMAGE UPLOAD (CLOUDINARY) ================== */
app.post("/upload", upload.single("image"), (req, res) => {
  try {
    res.json({
      success: true,
      image: req.file.path // 🔥 CLOUDINARY URL
    });
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ PRODUCTS ================== */
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

/* ================== ✅ ADD PRODUCT ================== */
app.post("/add-product", async (req, res) => {
  try {
    const { name, price, image, stock, category, subcategory } = req.body;

    const newProduct = await Product.create({
      name,
      price,
      image,
      stock,
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
  } catch {
    res.json({ success: false });
  }
});

/* ================== ✅ ADMIN STATS ================== */
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

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
    });

    res.json(order);

  } catch (err) {
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

    res.json({ success: expectedSignature === razorpay_signature });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ START SERVER ================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});