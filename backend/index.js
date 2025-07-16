const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// ✅ Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ✅ DB Setup
const db = new Database(path.join(__dirname, "indexchecker.db"));
console.log("✅ SQLite (better-sqlite3) connected");

// ✅ Table Setup
const createTables = [
  `CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    checked_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS csv_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    checked_at TEXT,
    batch_id TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    password TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    verify_token TEXT,
    created_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    login_time TEXT,
    ip_address TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token TEXT,
    created_at TEXT,
    is_verified INTEGER DEFAULT 0
  );`,
];
createTables.forEach((q) => db.prepare(q).run());

// ✅ Google API Keys
const apiKeys = [
  "AIzaSyCtNMOqdpwBUkMP7A_F42B0gKZSqInTeaw",
  "AIzaSyCdq8z-x1Wxrp18fpxwieAyyg_kSJzVL0o",
  "AIzaSyABYTe0XGeNosaz7S9fRbehVia18BPMy1s",
  "AIzaSyCOhvjUY8YSOfFRmOcSsu2KXoIsfrmMsU4",
  "AIzaSyDYo3P31HA0uhuuOwWHhbtULdArm-U0p9U",
];
let keyIndex = 0;
const cx = "3165d7296377e4016";

function getNextApiKey() {
  keyIndex = (keyIndex + 1) % apiKeys.length;
  return apiKeys[keyIndex];
}

async function isIndexed(url) {
  let attempts = 0;
  while (attempts < apiKeys.length) {
    const key = getNextApiKey();
    try {
      const res = await axios.get(
        "https://www.googleapis.com/customsearch/v1",
        {
          params: { key, cx, q: `site:${url}` },
        },
      );
      return res.data.items?.length > 0;
    } catch (err) {
      attempts++;
    }
  }
  return false;
}

// ✅ Email Transport
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: "your.email@gmail.com",
    pass: "your_app_password_here",
  },
});

// ✅ Signup
app.post("/signup", async (req, res) => {
  const { email, first_name, last_name, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing fields" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const created_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO users (email, first_name, last_name, password, verified, created_at) 
              VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(email, first_name, last_name, hashedPassword, created_at);

  res.json({ message: "Signup successful (no email verification)" });
});

// ✅ Verify
app.get("/verify/:token", (req, res) => {
  const { token } = req.params;
  const result = db
    .prepare(
      `UPDATE users SET verified = 1, verify_token = NULL WHERE verify_token = ?`,
    )
    .run(token);
  if (result.changes === 0)
    return res.status(400).send("Invalid or expired token.");
  res.redirect("/signin.html");
});

// ✅ Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

  if (!user) return res.status(401).json({ error: "Invalid email" });
  if (!user.verified)
    return res.status(403).json({ error: "Verify your email first" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Wrong password" });

  const login_time = new Date().toISOString();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  db.prepare(
    `INSERT INTO logins (user_id, login_time, ip_address) VALUES (?, ?, ?)`,
  ).run(user.id, login_time, ip);

  res.json({ message: "Login successful", redirect: "/index.html" });
});

// ✅ Single Check
app.post("/check", async (req, res) => {
  const { url } = req.body;
  const indexed = await isIndexed(url);
  const status = indexed ? "Indexed" : "Not Indexed";
  const checked_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO checks (url, status, checked_at) VALUES (?, ?, ?)`,
  ).run(url, status, checked_at);
  res.json({ url, indexed, status, checked_at });
});

// ✅ Bulk Check
app.post("/bulk-check", async (req, res) => {
  const { urls, isCSV } = req.body;
  const checked_at = new Date().toISOString();
  const batch_id = isCSV ? "csv-" + Date.now() : null;
  const results = [];

  for (const url of urls) {
    const indexed = await isIndexed(url);
    const status = indexed ? "Indexed" : "Not Indexed";

    if (isCSV) {
      db.prepare(
        `INSERT INTO csv_checks (url, status, checked_at, batch_id) VALUES (?, ?, ?, ?)`,
      ).run(url, status, checked_at, batch_id);
    } else {
      db.prepare(
        `INSERT INTO checks (url, status, checked_at) VALUES (?, ?, ?)`,
      ).run(url, status, checked_at);
    }

    results.push({ url, indexed });
  }

  res.json({ results });
});

// ✅ CSV Upload
app.post("/csv-upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const batch_id = "csv-" + Date.now();
  const urls = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      if (row.url) urls.push(row.url);
    })
    .on("end", async () => {
      for (const url of urls) {
        const indexed = await isIndexed(url);
        const status = indexed ? "Indexed" : "Not Indexed";
        const checked_at = new Date().toISOString();
        db.prepare(
          `INSERT INTO csv_checks (url, status, checked_at, batch_id) VALUES (?, ?, ?, ?)`,
        ).run(url, status, checked_at, batch_id);
      }
      fs.unlinkSync(filePath);
      res.json({ message: "CSV uploaded and processed", batch_id });
    });
});

// ✅ Start Server
app.listen(5000, () => {
  console.log("🚀 Server running at http://localhost:5000");
});
