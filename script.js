import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const TARGET_COUNT = 10;
const CLIENT_ID_KEY = "minyanManClientId";
const GOOGLE_MAPS_LIBRARIES = "places";

const appConfig = window.MINYAN_MAN_CONFIG || {};
const firebaseConfig = appConfig.firebase || {};
const googleMapsApiKey = appConfig.googleMapsApiKey || "";
const firebaseReady = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_"));
const googleMapsReadyForUse = Boolean(googleMapsApiKey && !googleMapsApiKey.startsWith("YOUR_"));

const clientId = getOrCreateClientId();
const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
const db = firebaseReady ? getFirestore(firebaseApp) : null;

let minyanim = [];
let participantCache = new Map();
let selectedMinyanId = null;
let selectedGooglePlace = null;
let toastTimer = null;
let googleMapsReady = false;
let locationAutocomplete = null;

const refs = {
  form: document.getElementById("create-minyan-form"),
  dateInput: document.getElementById("minyan-date"),
  timeInput: document.getElementById("minyan-time"),
  locationInput: document.getElementById("minyan-location"),
  organizerPhoneInput: document.getElementById("organizer-phone"),
  mapInput: document.getElementById("minyan-map"),
  minyanList: document.getElementById("minyan-list"),
  detailsContent: document.getElementById("details-content"),
  detailsStatus: document.getElementById("details-status"),
  listSummary: document.getElementById("list-summary"),
  summaryStrip: document.getElementById("summary-strip"),
  toast: document.getElementById("toast"),
  srStatus: document.getElementById("screen-reader-status"),
};

initializeUi();

function initializeUi() {
  setDefaultFormValues();
  bindEvents();
  renderApp();
  initializeGoogleMaps();
  if (firebaseReady) {
    subscribeToMinyanim();
    subscribeToParticipants();
    announceToScreenReader("Minyan-Man is ready. Shared online minyanim will appear automatically.");
  } else {
    showToast("Add Firebase keys in firebase-config.js to connect the live app.");
    announceToScreenReader("Add Firebase keys in firebase-config.js to connect the live app.");
  }
}

function bindEvents() {
  refs.form.addEventListener("submit", handleCreateMinyan);
  refs.locationInput.addEventListener("input", () => {
    selectedGooglePlace = null;
  });
}

function subscribeToMinyanim() {
  if (!db) {
    return;
  }

  const minyanimQuery = query(collection(db, "minyanim"), orderBy("startsAt", "asc"));

  onSnapshot(
    minyanimQuery,
    (snapshot) => {
      minyanim = snapshot.docs.map((snapshotDoc) => normalizeMinyan(snapshotDoc.id, snapshotDoc.data()));

      if (!selectedMinyanId || !minyanim.some((minyan) => minyan.id === selectedMinyanId)) {
        selectedMinyanId = minyanim[0]?.id || null;
      }

      renderApp();
    },
    () => {
      showToast("Could not load live minyanim from Firebase.");
    }
  );
}

function subscribeToParticipants() {
  if (!db) {
    return;
  }

  const participantsQuery = query(collectionGroup(db, "participants"), orderBy("updatedAt", "desc"));

  onSnapshot(
    participantsQuery,
    (snapshot) => {
      const nextCache = new Map();

      snapshot.docs.forEach((snapshotDoc) => {
        const participant = normalizeParticipant(snapshotDoc.id, snapshotDoc.data());
        const list = nextCache.get(participant.minyanId) || [];
        list.push(participant);
        nextCache.set(participant.minyanId, list);
      });

      participantCache = nextCache;
      renderApp();
    },
    () => {
      showToast("Could not load participant updates.");
    }
  );
}

function normalizeMinyan(id, data) {
  const startsAtDate = data.startsAt?.toDate ? data.startsAt.toDate() : new Date(`${data.date}T${data.time}`);

  return {
    id,
    date: String(data.date || startsAtDate.toISOString().slice(0, 10)),
    time: String(data.time || "09:00"),
    startsAt: startsAtDate,
    location: String(data.location || "Location to be announced"),
    organizerName: String(data.organizerName || ""),
    organizerPhone: String(data.organizerPhone || ""),
    map: String(data.map || ""),
    notes: String(data.notes || "No notes provided."),
    googlePlaceId: String(data.googlePlaceId || ""),
    participants: participantCache.get(id) || [],
  };
}

function normalizeParticipant(id, data) {
  return {
    id,
    name: String(data.name || ""),
    contact: String(data.contact || ""),
    response: String(data.response || "maybe"),
    clientId: String(data.clientId || ""),
    minyanId: String(data.minyanId || ""),
  };
}

function setDefaultFormValues() {
  const now = new Date();
  const minDate = now.toISOString().slice(0, 10);
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultTime = `${String(nextHour.getHours()).padStart(2, "0")}:00`;

  refs.dateInput.min = minDate;
  refs.locationInput.autocomplete = "off";

  if (!refs.dateInput.value) {
    refs.dateInput.value = minDate;
  }

  if (!refs.timeInput.value) {
    refs.timeInput.value = defaultTime;
  }
}

function renderApp() {
  const upcomingMinyanim = getUpcomingMinyanim();
  const selectedMinyan = getSelectedMinyan(upcomingMinyanim);

  renderSummary(upcomingMinyanim, selectedMinyan);
  renderMinyanList(upcomingMinyanim);
  renderDetails(selectedMinyan);
}

function getUpcomingMinyanim() {
  const now = new Date();
  return minyanim.filter((minyan) => minyan.startsAt >= now);
}

function renderSummary(upcomingMinyanim, selectedMinyan) {
  const confirmedCount = upcomingMinyanim.filter((minyan) => getConfirmedCount(minyan) >= TARGET_COUNT).length;
  const nextMinyan = upcomingMinyanim[0];
  const nextTime = nextMinyan
    ? `${formatDate(nextMinyan.date)} at ${formatTime(nextMinyan.time)}`
    : "No upcoming minyanim";

  refs.summaryStrip.innerHTML = `
    <article class="summary-card">
      <span class="summary-label">Upcoming Minyanim</span>
      <span class="summary-value">${upcomingMinyanim.length}</span>
    </article>
    <article class="summary-card">
      <span class="summary-label">Already Confirmed</span>
      <span class="summary-value">${confirmedCount}</span>
    </article>
    <article class="summary-card">
      <span class="summary-label">Selected Status</span>
      <span class="summary-value">${selectedMinyan ? escapeHtml(getStatusText(selectedMinyan)) : "Choose a minyan"}</span>
    </article>
    <article class="summary-card">
      <span class="summary-label">Realtime Backend</span>
      <span class="summary-value">${firebaseReady ? "Firebase Live" : "Add Firebase keys"}</span>
    </article>
    <article class="summary-card">
      <span class="summary-label">Next Minyan</span>
      <span class="summary-value">${escapeHtml(nextTime)}</span>
    </article>
  `;
}

function renderMinyanList(upcomingMinyanim) {
  if (!upcomingMinyanim.length) {
    refs.listSummary.textContent = "No upcoming minyanim yet.";
    refs.minyanList.innerHTML = `
      <section class="empty-state">
        <h3>No minyanim yet</h3>
        <p class="meta-text">Create the first online minyan using the form above.</p>
      </section>
    `;
    return;
  }

  refs.listSummary.textContent = `${upcomingMinyanim.length} upcoming minyanim available. Updates appear in real time.`;

  refs.minyanList.innerHTML = upcomingMinyanim
    .map((minyan) => {
      const confirmed = getConfirmedCount(minyan);
      const statusText = getStatusText(minyan);
      const preview = truncateText(minyan.notes, 110);
      const isSelected = minyan.id === selectedMinyanId;
      const myResponse = getMyResponse(minyan);

      return `
        <article class="minyan-card ${isSelected ? "is-selected" : ""}" role="listitem" aria-labelledby="card-title-${minyan.id}">
          <div class="card-topline">
            <div>
              <p class="card-title" id="card-title-${minyan.id}">${escapeHtml(formatDate(minyan.date))} at ${escapeHtml(formatTime(minyan.time))}</p>
              <p class="meta-text">${escapeHtml(minyan.location)}</p>
            </div>
            <span class="count-pill" aria-label="${confirmed} confirmed out of ${TARGET_COUNT} needed">
              ${confirmed}/${TARGET_COUNT}
            </span>
          </div>
          <p class="card-preview">${escapeHtml(preview)}</p>
          <p class="meta-text">${escapeHtml(statusText)}. ${escapeHtml(getResponseLabel(myResponse))}</p>
          <div class="card-actions">
            <button type="button" class="button button-primary" data-action="select" data-id="${escapeAttribute(minyan.id)}" aria-label="Join minyan at ${escapeAttribute(minyan.location)}">
              Join Minyan
            </button>
            <button type="button" class="button button-secondary" data-action="details" data-id="${escapeAttribute(minyan.id)}" aria-label="View details for minyan at ${escapeAttribute(minyan.location)}">
              View Details
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  refs.minyanList.querySelectorAll("[data-action='select'], [data-action='details']").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMinyanId = button.dataset.id;
      renderApp();
      document.getElementById("details-heading").focus();
    });
  });
}

function renderDetails(selectedMinyan) {
  if (!selectedMinyan) {
    refs.detailsStatus.textContent = "Open a minyan to review full details.";
    refs.detailsContent.innerHTML = `
      <section class="empty-state">
        <h3>No minyan selected</h3>
        <p class="meta-text">Choose a minyan from the list to see shared details, map location, and participants.</p>
      </section>
    `;
    return;
  }

  const participants = participantCache.get(selectedMinyan.id) || [];
  const minyan = { ...selectedMinyan, participants };
  const confirmed = getConfirmedCount(minyan);
  const maybe = getResponseCount(participants, "maybe");
  const cannotAttend = getResponseCount(participants, "cant");
  const confirmedStatus = confirmed >= TARGET_COUNT;
  const organizerPhone = minyan.organizerPhone || "No phone listed yet";
  const myResponse = getMyResponse(minyan);
  const myParticipant = getMyParticipant(participants);
  const accessibilityTags = extractAccessibilityTags(minyan.notes);

  refs.detailsStatus.textContent = confirmedStatus ? "Minyan confirmed." : `${TARGET_COUNT - confirmed} more people needed.`;

  refs.detailsContent.innerHTML = `
    <section class="status-banner ${confirmedStatus ? "confirmed" : ""}" aria-label="Confirmation status">
      <p class="status-message">${confirmedStatus ? "Minyan Confirmed" : `${TARGET_COUNT - confirmed} more people needed`}</p>
      <p class="meta-text">${confirmed}/${TARGET_COUNT} confirmed, ${maybe} maybe, ${cannotAttend} can't attend.</p>
    </section>

    <div class="details-grid">
      <article class="detail-card">
        <div class="detail-meta">
          <div>
            <h3>${escapeHtml(formatDate(minyan.date))} at ${escapeHtml(formatTime(minyan.time))}</h3>
            <p class="meta-text">${escapeHtml(minyan.location)}</p>
          </div>
          <span class="status-pill ${confirmedStatus ? "confirmed" : ""}">
            ${confirmedStatus ? "Confirmed" : "Still Gathering"}
          </span>
        </div>

        <p class="detail-copy"><strong>Full notes:</strong> ${escapeHtml(minyan.notes)}</p>
        <p class="detail-copy"><strong>Accessibility info:</strong> ${escapeHtml(extractAccessibilityText(accessibilityTags))}</p>
        <ul class="tag-list" aria-label="Accessibility highlights">
          ${accessibilityTags.map((tag) => `<li class="tag-chip">${escapeHtml(tag)}</li>`).join("")}
        </ul>
        <p class="detail-copy"><strong>Organizer:</strong> ${escapeHtml(minyan.organizerName || "Organizer not listed")}</p>
        <p class="detail-copy"><strong>Phone:</strong> ${escapeHtml(organizerPhone)}</p>
        <p class="detail-copy"><strong>Your response:</strong> ${escapeHtml(getResponseLabel(myResponse))}</p>

        <section class="join-panel" aria-labelledby="join-panel-heading">
          <h3 id="join-panel-heading">Join This Minyan</h3>
          <div class="field-grid">
            <div class="field">
              <label for="participant-name">Your Name</label>
              <input id="participant-name" type="text" placeholder="Your name" value="${escapeAttribute(myParticipant?.name || "")}">
            </div>
            <div class="field">
              <label for="participant-contact">Phone or Email</label>
              <input id="participant-contact" type="text" placeholder="you@example.com or (555) 010-1010" value="${escapeAttribute(myParticipant?.contact || "")}">
            </div>
          </div>
          <p class="helper-text">Your response is shared online right away with everyone viewing this minyan.</p>
        </section>

        <div class="response-grid" role="group" aria-label="Attendance options">
          <button type="button" class="button ${myResponse === "confirm" ? "button-primary" : "button-secondary"}" data-response="confirm">Confirm</button>
          <button type="button" class="button button-secondary ${myResponse === "maybe" ? "is-active" : ""}" data-response="maybe">Maybe</button>
          <button type="button" class="button button-danger ${myResponse === "cant" ? "is-active" : ""}" data-response="cant">Can't Attend</button>
          <button type="button" class="button button-secondary" id="call-organizer-btn" aria-label="Call organizer for this minyan">Call Organizer</button>
        </div>
      </article>

      <aside class="map-card">
        <div class="map-placeholder" aria-label="Map placeholder for ${escapeAttribute(minyan.location)}">
          <p class="map-title">Location and Map</p>
          ${
            buildMapEmbedHref(minyan)
              ? `<iframe class="map-frame" title="Google Maps location for ${escapeAttribute(minyan.location)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeAttribute(buildMapEmbedHref(minyan))}"></iframe>`
              : `<p class="detail-copy">Add your Google Maps API key in the Firebase config file to enable the embedded map.</p>`
          }
          <p class="detail-copy">${escapeHtml(getMapText(minyan))}</p>
          <p class="detail-copy"><strong>Address or place:</strong> ${escapeHtml(minyan.location)}</p>
        </div>
        <div class="response-grid">
          <a class="button button-secondary" href="${escapeAttribute(buildMapHref(minyan))}" target="_blank" rel="noreferrer noopener" aria-label="Open this minyan location in Google Maps">
            Open in Google Maps
          </a>
        </div>
      </aside>

      <aside class="detail-card">
        <h3>Message People in This Minyan</h3>
        <p class="meta-text">${participants.filter((participant) => participant.contact).length} people can be reached from this minyan.</p>
        <div class="participant-list" aria-label="People in this minyan">
          ${renderParticipantList(participants)}
        </div>
        <div class="field">
          <label for="group-message">Message</label>
          <textarea id="group-message" rows="5" placeholder="Reminder: please arrive 10 minutes early and use the ramp entrance."></textarea>
        </div>
        <div class="response-grid" role="group" aria-label="Messaging actions">
          <button type="button" class="button button-secondary" id="copy-message-btn">Copy Message</button>
          <button type="button" class="button button-secondary" id="email-group-btn">Email Group</button>
          <button type="button" class="button button-secondary" id="text-group-btn">Text Group</button>
        </div>
      </aside>
    </div>
  `;

  refs.detailsContent.querySelectorAll("[data-response]").forEach((button) => {
    button.addEventListener("click", () => updateResponse(minyan.id, button.dataset.response));
  });

  refs.detailsContent.querySelector("#call-organizer-btn").addEventListener("click", () => {
    const message = minyan.organizerPhone ? `Call organizer placeholder: ${minyan.organizerPhone}` : "Organizer phone number not listed yet.";
    showToast(message);
    announceToScreenReader(message);
  });

  refs.detailsContent.querySelector("#copy-message-btn").addEventListener("click", copyGroupMessage);
  refs.detailsContent.querySelector("#email-group-btn").addEventListener("click", () => launchGroupEmail(minyan.id));
  refs.detailsContent.querySelector("#text-group-btn").addEventListener("click", () => launchGroupText(minyan.id));
}

async function handleCreateMinyan(event) {
  event.preventDefault();

  const formData = new FormData(refs.form);
  const date = String(formData.get("date") || "").trim();
  const time = String(formData.get("time") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!date || !time || !location || !notes) {
    showToast("Please fill in the date, time, location, and notes.");
    announceToScreenReader("Please fill in the required fields.");
    return;
  }

  if (!selectedGooglePlace) {
    showToast("Please choose the location from Google Maps suggestions.");
    announceToScreenReader("Please choose the location from Google Maps suggestions.");
    refs.locationInput.focus();
    return;
  }

  try {
    if (!db) {
      showToast("Add Firebase keys before creating a minyan.");
      return;
    }

    await addDoc(collection(db, "minyanim"), {
      date,
      time,
      location: selectedGooglePlace.formatted_address || selectedGooglePlace.name || location,
      organizerName: String(formData.get("organizerName") || "").trim(),
      organizerPhone: String(formData.get("organizerPhone") || "").trim(),
      map: String(formData.get("map") || "").trim(),
      notes,
      googlePlaceId: String(selectedGooglePlace.place_id || ""),
      createdAt: serverTimestamp(),
      startsAt: new Date(`${date}T${time}`),
    });

    refs.form.reset();
    selectedGooglePlace = null;
    setDefaultFormValues();
    showToast("New minyan saved to Firebase.");
    announceToScreenReader("New minyan saved successfully.");
  } catch {
    showToast("Could not save the new minyan.");
  }
}

async function updateResponse(minyanId, responseType) {
  const participantName = getTextFieldValue("participant-name");
  const participantContact = getTextFieldValue("participant-contact");

  if (!participantName) {
    showToast("Please enter your name before choosing a response.");
    announceToScreenReader("Please enter your name before choosing a response.");
    return;
  }

  try {
    if (!db) {
      showToast("Add Firebase keys before saving responses.");
      return;
    }

    await setDoc(
      doc(db, "minyanim", minyanId, "participants", clientId),
      {
        clientId,
        minyanId,
        name: participantName,
        contact: participantContact,
        response: responseType,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast(`Response saved: ${getResponseLabel(responseType)}.`);
    announceToScreenReader(`Response saved: ${getResponseLabel(responseType)}.`);
  } catch {
    showToast("Could not save your response.");
  }
}

function getSelectedMinyan(list) {
  return list.find((minyan) => minyan.id === selectedMinyanId) || null;
}

function getConfirmedCount(minyan) {
  return getResponseCount(minyan.participants || [], "confirm");
}

function getResponseCount(participants, responseType) {
  return participants.filter((participant) => participant.response === responseType).length;
}

function getStatusText(minyan) {
  const confirmed = getConfirmedCount(minyan);
  return confirmed >= TARGET_COUNT ? "Minyan confirmed" : `${TARGET_COUNT - confirmed} more people needed`;
}

function getMyParticipant(participants) {
  return participants.find((participant) => participant.clientId === clientId) || null;
}

function getMyResponse(minyan) {
  return getMyParticipant(minyan.participants || [])?.response || "";
}

function getResponseLabel(responseType) {
  if (responseType === "confirm") return "Confirmed";
  if (responseType === "maybe") return "Maybe";
  if (responseType === "cant") return "Can't attend";
  return "No response yet";
}

function extractAccessibilityTags(notes) {
  const patterns = [
    { match: /accessible|wheelchair|step-free|automatic door/i, label: "Accessible entrance" },
    { match: /ramp/i, label: "Ramp access" },
    { match: /elevator|lift/i, label: "Elevator access" },
    { match: /parking|drop-off|driveway/i, label: "Parking or drop-off" },
    { match: /restroom|bathroom/i, label: "Accessible restroom" },
    { match: /quiet|rest/i, label: "Quiet space available" },
    { match: /chair|seating/i, label: "Seating support" },
    { match: /volunteer|greeter|call ahead/i, label: "Extra arrival support" },
  ];

  const tags = patterns.filter((pattern) => pattern.match.test(notes)).map((pattern) => pattern.label);
  return tags.length ? tags : ["Check notes for accessibility details"];
}

function extractAccessibilityText(tags) {
  return tags.length ? tags.join(", ") : "Check the full notes for accessibility details.";
}

function getMapText(minyan) {
  if (!minyan.map) return "Google Maps directions are available below.";
  if (/^https?:\/\//i.test(minyan.map)) return "Map link provided. Use the button below to open directions.";
  return minyan.map;
}

function buildMapHref(minyan) {
  if (minyan.map && /^https?:\/\//i.test(minyan.map)) {
    return minyan.map;
  }

  if (minyan.googlePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(minyan.location)}&query_place_id=${encodeURIComponent(minyan.googlePlaceId)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(minyan.location)}`;
}

function buildMapEmbedHref(minyan) {
  if (!googleMapsReadyForUse) {
    return "";
  }

  if (minyan.googlePlaceId) {
    return `https://www.google.com/maps/embed/v1/place?key=${googleMapsApiKey}&q=place_id:${encodeURIComponent(minyan.googlePlaceId)}`;
  }

  return `https://www.google.com/maps/embed/v1/place?key=${googleMapsApiKey}&q=${encodeURIComponent(minyan.location)}`;
}

function renderParticipantList(participants) {
  if (!participants.length) {
    return `<p class="meta-text">No participants have joined yet.</p>`;
  }

  return participants
    .map(
      (participant) => `
        <article class="participant-item">
          <p><strong>${escapeHtml(participant.name)}</strong></p>
          <p class="meta-text">${escapeHtml(participant.contact || "No contact added")} | ${escapeHtml(getResponseLabel(participant.response))}</p>
        </article>
      `
    )
    .join("");
}

async function copyGroupMessage() {
  const message = getGroupMessage();

  if (!message) {
    showToast("Write a message first.");
    return;
  }

  if (!navigator.clipboard) {
    showToast("Clipboard is not available in this browser.");
    return;
  }

  await navigator.clipboard.writeText(message);
  showToast("Message copied.");
}

function launchGroupEmail(minyanId) {
  const participants = participantCache.get(minyanId) || [];
  const minyan = minyanim.find((item) => item.id === minyanId);
  const contacts = participants.map((participant) => participant.contact).filter((contact) => contact && contact.includes("@"));
  const message = getGroupMessage();

  if (!contacts.length || !minyan) {
    showToast("No email addresses are available yet.");
    return;
  }

  window.location.href = `mailto:${contacts.join(",")}?subject=${encodeURIComponent(`Message for ${formatDate(minyan.date)} minyan`)}&body=${encodeURIComponent(message)}`;
}

function launchGroupText(minyanId) {
  const participants = participantCache.get(minyanId) || [];
  const contacts = participants
    .map((participant) => participant.contact)
    .filter((contact) => contact && !contact.includes("@"))
    .map((contact) => contact.replace(/[^+\d]/g, ""));
  const message = getGroupMessage();

  if (!contacts.length) {
    showToast("No phone numbers are available yet.");
    return;
  }

  window.location.href = `sms:${contacts.join(",")}?body=${encodeURIComponent(message)}`;
}

function getGroupMessage() {
  const field = document.getElementById("group-message");
  return field ? field.value.trim() : "";
}

function initializeGoogleMaps() {
  if (!googleMapsReadyForUse) {
    return;
  }

  window.initMinyanManMaps = () => {
    googleMapsReady = true;
    setupLocationAutocomplete();
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=${GOOGLE_MAPS_LIBRARIES}&callback=initMinyanManMaps`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function setupLocationAutocomplete() {
  if (!googleMapsReady || !window.google?.maps?.places || locationAutocomplete) {
    return;
  }

  locationAutocomplete = new google.maps.places.Autocomplete(refs.locationInput, {
    fields: ["formatted_address", "name", "geometry", "place_id"],
    types: ["geocode"],
  });

  locationAutocomplete.addListener("place_changed", () => {
    const place = locationAutocomplete.getPlace();
    selectedGooglePlace = place;
    refs.locationInput.value = place.formatted_address || place.name || refs.locationInput.value;
  });
}

function getTextFieldValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function truncateText(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric" }).format(date);
}

function formatTime(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 3200);
}

function announceToScreenReader(message) {
  refs.srStatus.textContent = "";
  window.setTimeout(() => {
    refs.srStatus.textContent = message;
  }, 80);
}

function getOrCreateClientId() {
  const existingId = localStorage.getItem(CLIENT_ID_KEY);
  if (existingId) {
    return existingId;
  }

  const newId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(CLIENT_ID_KEY, newId);
  return newId;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
