const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// 🔥 CLOUDINARY
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

const app = express();

app.use(cors());
app.use(express.json());

/* ================== ✅ CLOUDINARY CONFIG ================== */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

/* ================== ✅ MULTER (MEMORY) ================== */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ================== ✅ MONGODB ================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log(err));

/* ================== ✅ MODELS ================== */
const User = mongoose.model("User", {
  name: String,
  email: String,
  password: String,
});

const Order = mongoose.model("Order", {
  orderId: String,
  paymentId: String,
  amount: Number,
  status: String,
  userId: String,
});

const Product = mongoose.model("Product", {
  name: String,
  price: Number,
  image: String,
  stock: Number,
  category: String,
  subcategory: String,
});

/* ================== ✅ TEST ================== */
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

/* ================== ✅ IMAGE UPLOAD ================== */
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "arvelo" },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({
      success: true,
      imageUrl: result.secure_url,
    });

  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ ADD PRODUCT ================== */
app.post("/add-product", upload.single("image"), async (req, res) => {
  try {
    let imageUrl = "";

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "arvelo" },
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      imageUrl = result.secure_url;
    }

    const { name, price, stock, category, subcategory } = req.body;

    const product = await Product.create({
      name,
      price,
      stock,
      category,
      subcategory,
      image: imageUrl,
    });

    res.json({ success: true, product });

  } catch (err) {
    console.log("ADD PRODUCT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ UPDATE PRODUCT ================== */
app.put("/update-product/:id", upload.single("image"), async (req, res) => {
  try {
    let imageUrl = req.body.image;

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "arvelo" },
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      imageUrl = result.secure_url;
    }

    const { name, price, stock, category, subcategory } = req.body;

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, stock, category, subcategory, image: imageUrl },
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

/* ================== ✅ GET PRODUCTS ================== */
app.get("/products", async (req, res) => {
  try {
    const data = await Product.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.json([]);
  }
});

/* ================== ✅ ADMIN STATS ================== */
app.get("/admin-stats", async (req, res) => {
  try {
    const orders = await Order.find();

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalProducts = await Product.countDocuments();

    res.json({ totalOrders, totalRevenue, totalProducts });

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
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ LOGIN ================== */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "1d" }
    );

    res.json({ success: true, token, user });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================== ✅ RAZORPAY ================== */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
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

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ================== ✅ VERIFY PAYMENT ================== */
app.post("/verify-payment", (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  res.json({ success: expected === razorpay_signature });
});

/* ================== 🚀 START ================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT} 🚀`);
});