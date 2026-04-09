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

/* ================== ✅ MONGODB CONNECT (FIXED) ================== */
mongoose.connect(
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zyro",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
)
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB ERROR ❌:", err));

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

/* ================== ✅ PRODUCTS ================== */
const products = [
  { id: 1, name: "Black Hoodie", price: 1999 },
  { id: 2, name: "White T-Shirt", price: 999 }
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
  console.log("🔥 CREATE ORDER HIT");

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

/* ================== ✅ VERIFY PAYMENT + SAVE ================== */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      userId
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", "N688DkfL8jvqT4LMJThp0h78")
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {

      // ✅ SAFE DB SAVE (won’t crash even if DB slow)
      try {
        await Order.create({
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          amount: amount || 0,
          status: "paid",
          userId: userId || null,
        });
        console.log("✅ ORDER SAVED");
      } catch (dbErr) {
        console.log("⚠️ DB SAVE FAILED:", dbErr);
      }

      return res.json({ success: true });

    } else {
      console.log("❌ SIGNATURE MISMATCH");
      return res.status(400).json({ success: false });
    }

  } catch (err) {
    console.log("❌ VERIFY ERROR:", err);
    return res.status(500).json({ success: false });
  }
});

/* ================== ✅ GET ALL ORDERS ================== */
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ _id: -1 });
    res.json(orders || []);
  } catch (err) {
    console.log("ORDERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ================== ✅ GET USER ORDERS ================== */
app.get("/my-orders/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId });
    res.json(orders || []);
  } catch (err) {
    console.log("MY ORDERS ERROR:", err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ================== ✅ START SERVER ================== */
app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});