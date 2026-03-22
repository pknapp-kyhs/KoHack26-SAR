const fs = require("fs");
const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "minyan-man.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS minyanim (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    location TEXT NOT NULL,
    organizer_name TEXT,
    organizer_phone TEXT,
    map TEXT,
    notes TEXT NOT NULL,
    google_place_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minyan_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    contact TEXT,
    response TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(minyan_id, client_id),
    FOREIGN KEY(minyan_id) REFERENCES minyanim(id) ON DELETE CASCADE
  );
`);

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/minyanim", (_request, response) => {
  const minyanRows = db.prepare(`
    SELECT
      id,
      date,
      time,
      location,
      organizer_name AS organizerName,
      organizer_phone AS organizerPhone,
      map,
      notes,
      google_place_id AS googlePlaceId
    FROM minyanim
    ORDER BY datetime(date || ' ' || time) ASC
  `).all();

  const participantRows = db.prepare(`
    SELECT
      id,
      minyan_id AS minyanId,
      client_id AS clientId,
      name,
      contact,
      response
    FROM participants
    ORDER BY datetime(updated_at) DESC
  `).all();

  const groupedParticipants = new Map();

  participantRows.forEach((participant) => {
    const key = String(participant.minyanId);
    const list = groupedParticipants.get(key) || [];
    list.push(participant);
    groupedParticipants.set(key, list);
  });

  response.json(
    minyanRows.map((minyan) => ({
      ...minyan,
      participants: groupedParticipants.get(String(minyan.id)) || [],
    }))
  );
});

app.post("/api/minyanim", (request, response) => {
  const { date, time, location, organizerName, organizerPhone, map, notes, googlePlaceId } = request.body || {};

  if (!date || !time || !location || !notes) {
    response.status(400).json({ error: "Missing required fields." });
    return;
  }

  const result = db.prepare(`
    INSERT INTO minyanim (
      date,
      time,
      location,
      organizer_name,
      organizer_phone,
      map,
      notes,
      google_place_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date,
    time,
    location,
    organizerName || "",
    organizerPhone || "",
    map || "",
    notes,
    googlePlaceId || ""
  );

  response.status(201).json({ id: String(result.lastInsertRowid) });
});

app.put("/api/minyanim/:minyanId/participants", (request, response) => {
  const { minyanId } = request.params;
  const { clientId, name, contact, response: attendanceResponse } = request.body || {};

  if (!clientId || !name || !attendanceResponse) {
    response.status(400).json({ error: "Missing participant fields." });
    return;
  }

  db.prepare(`
    INSERT INTO participants (
      minyan_id,
      client_id,
      name,
      contact,
      response,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(minyan_id, client_id) DO UPDATE SET
      name = excluded.name,
      contact = excluded.contact,
      response = excluded.response,
      updated_at = CURRENT_TIMESTAMP
  `).run(minyanId, clientId, name, contact || "", attendanceResponse);

  response.json({ ok: true });
});

app.listen(port, host, () => {
  console.log(`Minyan-Man server running at http://${host}:${port}`);
});
