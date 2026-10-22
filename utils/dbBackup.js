/**
 * One-off DB backup utility.
 *
 * Connects using MONGODB_URI (same var config/db.js uses) and dumps every
 * collection in the database to a JSON file. Not mongodump-format (no
 * mongodump binary on this machine) — plain JSON per collection, with
 * EJSON-safe handling of ObjectId/Date/etc via JSON.stringify + a custom
 * replacer, so it can be inspected/restored with a small script if needed.
 *
 * Usage: node utils/dbBackup.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("No MONGODB_URI / MONGO_URI found in environment (.env).");
  process.exit(1);
}

function replacer(_key, value) {
  if (value && value._bsontype === "ObjectID") return { $oid: value.toString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  return value;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(); // uses the db name embedded in the URI ("test")
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "..", "backups", `${db.databaseName}-${timestamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  console.log(`Backing up database "${db.databaseName}" (${collections.length} collections) -> ${outDir}`);

  const summary = [];
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(outDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, replacer, 2));
    summary.push({ collection: name, documents: docs.length });
    console.log(`  ${name}: ${docs.length} documents`);
  }

  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify(
      {
        database: db.databaseName,
        createdAt: new Date().toISOString(),
        collections: summary,
      },
      null,
      2
    )
  );

  await client.close();
  console.log("Backup complete:", outDir);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
