const Database = require("better-sqlite3");
const db = new Database("indexchecker.db");

// ✅ Create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS url_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    is_indexed INTEGER,
    checked_at TEXT,
    source TEXT,
    user_ip TEXT
  )
`);

function insertResult(url, isIndexed, source = "manual", userIP = "unknown") {
  const timestamp = new Date().toISOString();
  const query = `INSERT INTO url_checks (url, is_indexed, checked_at, source, user_ip)
                 VALUES (?, ?, ?, ?, ?)`;

  db.run(query, [url, isIndexed ? 1 : 0, timestamp, source, userIP]);
}

module.exports = { insertResult };
