const express = require("express");
const axios = require("axios");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// ✅ 1. CREATE DATABASE AND TWO TABLES
const dbPath = path.join(__dirname, "indexchecker.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to DB:", err.message);
  } else {
    console.log("✅ Connected to SQLite DB");
  }
});

const createTable = `
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT
);`;

const createCsvTable = `
CREATE TABLE IF NOT EXISTS csv_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT,
  batch_id TEXT
);`;

db.run(createTable);
db.run(createCsvTable);

// ✅ 2. GOOGLE API SETUP
const apiKeys = [
  "AIzaSyBNATfIa-YUip4r6i32qeRPKH6S_wGj6HI",
  "AIzaSyDMJFETzeas9VqkXhqWlbTjiSIthE0P2I0"
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
      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: { key, cx, q: `site:${url}` },
      });
      return response.data.items && response.data.items.length > 0;
    } catch (err) {
      attempts++;
      console.warn(`⚠️ Key failed: ${key}`);
    }
  }
  return false;
}

// ✅ 3. ENDPOINT: /check — FOR SINGLE URL
app.post("/check", async (req, res) => {
  const { url } = req.body;
  try {
    const indexed = await isIndexed(url);
    const status = indexed ? "Indexed" : "Not Indexed";
    const checked_at = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

    db.run(
      `INSERT INTO checks (url, status, checked_at) VALUES (?, ?, ?)`,
      [url, status, checked_at],
      function (err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ id: this.lastID, url, indexed, status, checked_at });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Indexing error" });
  }
});

// ✅ 4. ENDPOINT: /bulk-check — FOR JSON ARRAY (Used by script.js)
app.post("/bulk-check", async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Invalid or empty URLs list" });
  }

  const checked_at = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
  const results = [];

  for (const url of urls) {
    try {
      const indexed = await isIndexed(url);
      const status = indexed ? "Indexed" : "Not Indexed";

      db.run(
        `INSERT INTO csv_checks (url, status, checked_at, batch_id) VALUES (?, ?, ?, ?)`,
        [url, status, checked_at, "bulk-check"]
      );

      results.push({ url, indexed });
    } catch (err) {
      results.push({ url, indexed: false, error: err.message });
    }
  }

  res.json({ results });
});

// ✅ 5. ENDPOINT: /csv-upload — FOR FORM UPLOAD (admin-only)
app.post("/csv-upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const batch_id = Date.now().toString();
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      if (row.url) results.push(row.url.trim());
    })
    .on("end", async () => {
      for (const url of results) {
        const indexed = await isIndexed(url);
        const status = indexed ? "Indexed" : "Not Indexed";
        const checked_at = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

        db.run(
          `INSERT INTO csv_checks (url, status, checked_at, batch_id) VALUES (?, ?, ?, ?)`,
          [url, status, checked_at, batch_id]
        );
      }
      fs.unlinkSync(filePath); // Delete uploaded CSV
      res.json({ message: "✅ CSV processed successfully", batch_id });
    });
});

// ✅ 6. START SERVER
app.listen(5000, () => console.log("🚀 API running on http://localhost:5000"));
