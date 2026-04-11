const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

// ✅ ADD THESE
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// 🔥 NEW (UPLOAD)
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

/* ================== ✅ CREATE UPLOAD FOLDER ================== */
const uploadPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

/* ================== ✅ STATIC FILE SERVE ================== */
app.use("/uploads", express.static(uploadPath));

/* ================== ✅ MULTER CONFIG ================== */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

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

/* ================== ✅ PRODUCT SCHEMA ================== */
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  stock: Number
});

const Product = mongoose.model("Product", productSchema);

/* ================== ✅ TEST ROUTE ================== */
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

/* ================== ✅ IMAGE UPLOAD ================== */
app.post("/upload", upload.single("image"), (req, res) => {
  try {
    const imageUrl = `https://zyro-backend-7jyw.onrender.com/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ PRODUCTS ================== */
app.get("/products", async (req, res) => {
  try {
    const data = await Product.find().sort({ _id: -1 });

    if (data.length === 0) {
      return res.json([]);
    }

    res.json(data);
  } catch {
    res.json([]);
  }
});

/* ================== ✅ ADD PRODUCT ================== */
app.post("/add-product", async (req, res) => {
  try {
    const { name, price, image, stock } = req.body;

    const newProduct = await Product.create({
      name,
      price,
      image,
      stock
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
    const { name, price, image, stock } = req.body;

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, image, stock },
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

/* ================== ✅ START SERVER ================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});