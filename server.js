const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "minyan-man.json");

fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify({ lastMinyanId: 0, lastParticipantId: 0, minyanim: [], participants: [] }, null, 2)
  );
}

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/minyanim", (_request, response) => {
  const data = readData();
  response.json(buildMinyanimResponse(data));
});

app.post("/api/minyanim", (request, response) => {
  const { date, time, location, organizerName, organizerPhone, map, notes, googlePlaceId } = request.body || {};

  if (!date || !time || !location || !notes) {
    response.status(400).json({ error: "Missing required fields." });
    return;
  }

  const data = readData();
  const nextId = data.lastMinyanId + 1;

  data.lastMinyanId = nextId;
  data.minyanim.push({
    id: String(nextId),
    date,
    time,
    location,
    organizerName: organizerName || "",
    organizerPhone: organizerPhone || "",
    map: map || "",
    notes,
    googlePlaceId: googlePlaceId || "",
    createdAt: new Date().toISOString(),
  });

  writeData(data);
  response.status(201).json({ id: String(nextId) });
});

app.put("/api/minyanim/:minyanId/participants", (request, response) => {
  const { minyanId } = request.params;
  const { clientId, name, contact, response: attendanceResponse } = request.body || {};

  if (!clientId || !name || !attendanceResponse) {
    response.status(400).json({ error: "Missing participant fields." });
    return;
  }

  const data = readData();
  const minyanExists = data.minyanim.some((minyan) => minyan.id === String(minyanId));

  if (!minyanExists) {
    response.status(404).json({ error: "Minyan not found." });
    return;
  }

  const existingParticipant = data.participants.find((participant) => {
    return participant.minyanId === String(minyanId) && participant.clientId === String(clientId);
  });

  if (existingParticipant) {
    existingParticipant.name = name;
    existingParticipant.contact = contact || "";
    existingParticipant.response = attendanceResponse;
    existingParticipant.updatedAt = new Date().toISOString();
  } else {
    const nextParticipantId = data.lastParticipantId + 1;
    data.lastParticipantId = nextParticipantId;
    data.participants.push({
      id: String(nextParticipantId),
      minyanId: String(minyanId),
      clientId: String(clientId),
      name,
      contact: contact || "",
      response: attendanceResponse,
      updatedAt: new Date().toISOString(),
    });
  }

  writeData(data);
  response.json({ ok: true });
});

app.listen(port, host, () => {
  console.log(`Minyan-Man server running at http://${host}:${port}`);
});

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function buildMinyanimResponse(data) {
  const groupedParticipants = new Map();

  data.participants.forEach((participant) => {
    const list = groupedParticipants.get(participant.minyanId) || [];
    list.push(participant);
    groupedParticipants.set(participant.minyanId, list);
  });

  return [...data.minyanim]
    .sort((first, second) => {
      return new Date(`${first.date}T${first.time}`) - new Date(`${second.date}T${second.time}`);
    })
    .map((minyan) => ({
      ...minyan,
      participants: groupedParticipants.get(minyan.id) || [],
    }));
}
