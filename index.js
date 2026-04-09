const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

// ✅ ADD THESE
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

/* ================== ✅ MONGODB CONNECT ================== */
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zyro")
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

/* ================== ✅ TEST ROUTE ================== */
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

/* ================== ✅ PRODUCTS (FIXED IMAGE) ================== */
const products = [
  {
    id: 1,
    name: "Black Hoodie",
    price: 1999,
    image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7"
  },
  {
    id: 2,
    name: "White T-Shirt",
    price: 999,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab"
  }
];

app.get("/products", (req, res) => {
  res.json(products);
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

/* ================== ✅ VERIFY PAYMENT (FIXED) ================== */
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

    console.log("EXPECTED:", expectedSignature);
    console.log("RECEIVED:", razorpay_signature);

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