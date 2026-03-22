const TARGET_COUNT = 10;
const CLIENT_ID_KEY = "minyanManClientId";
const GOOGLE_MAPS_LIBRARIES = "places";
const APP_CONFIG = window.MINYAN_MAN_LOCAL_CONFIG || {};
const API_BASE_URL = APP_CONFIG.apiBaseUrl || "";
const GOOGLE_MAPS_API_KEY = APP_CONFIG.googleMapsApiKey || "AIzaSyDGVGcxsvx9GnyuW8klL0mRDA_wQCoSFGM";
const GOOGLE_MAPS_READY = Boolean(GOOGLE_MAPS_API_KEY && !GOOGLE_MAPS_API_KEY.startsWith("YOUR_"));
const DEBUG_PREFIX = "[Minyan-Man]";

const clientId = getOrCreateClientId();

let minyanim = [];
let selectedMinyanId = null;
let selectedGooglePlace = null;
let toastTimer = null;
let googleMapsReady = false;
let locationAutocomplete = null;
let refreshTimer = null;
let createMap = null;
let createMapMarker = null;

const refs = {
  form: document.getElementById("create-minyan-form"),
  dateInput: document.getElementById("minyan-date"),
  timeInput: document.getElementById("minyan-time"),
  locationInput: document.getElementById("minyan-location"),
  locationWidgetHost: document.getElementById("location-widget-host"),
  createMapCanvas: document.getElementById("create-map-canvas"),
  createMapSelection: document.getElementById("create-map-selection"),
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
  debugLog("App boot", {
    apiBaseUrl: API_BASE_URL || "(same origin)",
    googleMapsReady: GOOGLE_MAPS_READY,
  });
  setDefaultFormValues();
  bindEvents();
  renderApp();
  initializeGoogleMaps();
  loadMinyanim();
  startPolling();
  announceToScreenReader("Minyan-Man is ready. Shared local-network minyanim will appear automatically.");
}

function bindEvents() {
  refs.form.addEventListener("submit", handleCreateMinyan);
}

function setDefaultFormValues() {
  const now = new Date();
  const minDate = now.toISOString().slice(0, 10);
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultTime = `${String(nextHour.getHours()).padStart(2, "0")}:00`;

  refs.dateInput.min = minDate;
  if (!refs.dateInput.value) {
    refs.dateInput.value = minDate;
  }

  if (!refs.timeInput.value) {
    refs.timeInput.value = defaultTime;
  }
}

async function loadMinyanim() {
  try {
    debugLog("Loading minyanim", { url: `${API_BASE_URL}/api/minyanim` });
    const response = await fetch(`${API_BASE_URL}/api/minyanim`);

    if (!response.ok) {
      throw new Error("Could not load minyanim.");
    }

    const payload = await response.json();
    minyanim = Array.isArray(payload) ? payload.map(normalizeMinyan) : [];

    if (!selectedMinyanId || !minyanim.some((minyan) => minyan.id === selectedMinyanId)) {
      selectedMinyanId = minyanim[0]?.id || null;
    }

    debugLog("Minyanim loaded", {
      count: minyanim.length,
      selectedMinyanId,
    });
    renderApp();
  } catch (error) {
    debugError("Load minyanim failed", error);
    showToast("Could not load shared minyanim from the local server.");
  }
}

function startPolling() {
  clearInterval(refreshTimer);
  refreshTimer = window.setInterval(loadMinyanim, 5000);
}

function normalizeMinyan(minyan) {
  return {
    id: String(minyan.id),
    date: String(minyan.date || new Date().toISOString().slice(0, 10)),
    time: String(minyan.time || "09:00"),
    location: String(minyan.location || "Location to be announced"),
    organizerName: String(minyan.organizerName || ""),
    organizerPhone: String(minyan.organizerPhone || ""),
    map: String(minyan.map || ""),
    notes: String(minyan.notes || "No notes provided."),
    googlePlaceId: String(minyan.googlePlaceId || ""),
    participants: Array.isArray(minyan.participants) ? minyan.participants.map(normalizeParticipant) : [],
  };
}

function normalizeParticipant(participant) {
  return {
    id: String(participant.id || ""),
    clientId: String(participant.clientId || ""),
    name: String(participant.name || ""),
    contact: String(participant.contact || ""),
    response: String(participant.response || "maybe"),
  };
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

  return minyanim
    .filter((minyan) => new Date(`${minyan.date}T${minyan.time}`) >= now)
    .sort((first, second) => new Date(`${first.date}T${first.time}`) - new Date(`${second.date}T${second.time}`));
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
      <span class="summary-label">Shared Backend</span>
      <span class="summary-value">Local Server</span>
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
        <p class="meta-text">Create the first shared minyan using the form above.</p>
      </section>
    `;
    return;
  }

  refs.listSummary.textContent = `${upcomingMinyanim.length} upcoming minyanim available. Updates refresh across devices from the local server.`;

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

  const confirmed = getConfirmedCount(selectedMinyan);
  const maybe = getResponseCount(selectedMinyan.participants, "maybe");
  const cannotAttend = getResponseCount(selectedMinyan.participants, "cant");
  const confirmedStatus = confirmed >= TARGET_COUNT;
  const organizerPhone = selectedMinyan.organizerPhone || "No phone listed yet";
  const myResponse = getMyResponse(selectedMinyan);
  const myParticipant = getMyParticipant(selectedMinyan.participants);
  const accessibilityTags = extractAccessibilityTags(selectedMinyan.notes);

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
            <h3>${escapeHtml(formatDate(selectedMinyan.date))} at ${escapeHtml(formatTime(selectedMinyan.time))}</h3>
            <p class="meta-text">${escapeHtml(selectedMinyan.location)}</p>
          </div>
          <span class="status-pill ${confirmedStatus ? "confirmed" : ""}">
            ${confirmedStatus ? "Confirmed" : "Still Gathering"}
          </span>
        </div>

        <p class="detail-copy"><strong>Full notes:</strong> ${escapeHtml(selectedMinyan.notes)}</p>
        <p class="detail-copy"><strong>Accessibility info:</strong> ${escapeHtml(extractAccessibilityText(accessibilityTags))}</p>
        <ul class="tag-list" aria-label="Accessibility highlights">
          ${accessibilityTags.map((tag) => `<li class="tag-chip">${escapeHtml(tag)}</li>`).join("")}
        </ul>
        <p class="detail-copy"><strong>Organizer:</strong> ${escapeHtml(selectedMinyan.organizerName || "Organizer not listed")}</p>
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
          <p class="helper-text">Your response is saved to the shared local server for everyone on the network.</p>
        </section>

        <div class="response-grid" role="group" aria-label="Attendance options">
          <button type="button" class="button ${myResponse === "confirm" ? "button-primary" : "button-secondary"}" data-response="confirm">Confirm</button>
          <button type="button" class="button button-secondary ${myResponse === "maybe" ? "is-active" : ""}" data-response="maybe">Maybe</button>
          <button type="button" class="button button-danger ${myResponse === "cant" ? "is-active" : ""}" data-response="cant">Can't Attend</button>
          <button type="button" class="button button-secondary" id="call-organizer-btn" aria-label="Call organizer for this minyan">Call Organizer</button>
        </div>
      </article>

      <aside class="map-card">
        <div class="map-placeholder" aria-label="Map placeholder for ${escapeAttribute(selectedMinyan.location)}">
          <p class="map-title">Location and Map</p>
          ${
            buildMapEmbedHref(selectedMinyan)
              ? `<iframe class="map-frame" title="Google Maps location for ${escapeAttribute(selectedMinyan.location)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeAttribute(buildMapEmbedHref(selectedMinyan))}"></iframe>`
              : `<p class="detail-copy">Add your Google Maps API key in local-config.js to enable the embedded map.</p>`
          }
          <p class="detail-copy">${escapeHtml(getMapText(selectedMinyan))}</p>
          <p class="detail-copy"><strong>Address or place:</strong> ${escapeHtml(selectedMinyan.location)}</p>
        </div>
        <div class="response-grid">
          <a class="button button-secondary" href="${escapeAttribute(buildMapHref(selectedMinyan))}" target="_blank" rel="noreferrer noopener" aria-label="Open this minyan location in Google Maps">
            Open in Google Maps
          </a>
        </div>
      </aside>

      <aside class="detail-card">
        <h3>Message People in This Minyan</h3>
        <p class="meta-text">${selectedMinyan.participants.filter((participant) => participant.contact).length} people can be reached from this minyan.</p>
        <div class="participant-list" aria-label="People in this minyan">
          ${renderParticipantList(selectedMinyan.participants)}
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
    button.addEventListener("click", () => updateResponse(selectedMinyan.id, button.dataset.response));
  });

  refs.detailsContent.querySelector("#call-organizer-btn").addEventListener("click", () => {
    const message = selectedMinyan.organizerPhone
      ? `Call organizer placeholder: ${selectedMinyan.organizerPhone}`
      : "Organizer phone number not listed yet.";
    showToast(message);
    announceToScreenReader(message);
  });

  refs.detailsContent.querySelector("#copy-message-btn").addEventListener("click", copyGroupMessage);
  refs.detailsContent.querySelector("#email-group-btn").addEventListener("click", () => launchGroupEmail(selectedMinyan));
  refs.detailsContent.querySelector("#text-group-btn").addEventListener("click", () => launchGroupText(selectedMinyan));
}

async function handleCreateMinyan(event) {
  event.preventDefault();

  const formData = new FormData(refs.form);
  const payload = {
    date: String(formData.get("date") || "").trim(),
    time: String(formData.get("time") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    organizerName: String(formData.get("organizerName") || "").trim(),
    organizerPhone: String(formData.get("organizerPhone") || "").trim(),
    map: String(formData.get("map") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    googlePlaceId: String(selectedGooglePlace?.place_id || ""),
  };

  if (!payload.date || !payload.time || !payload.location || !payload.notes) {
    debugLog("Create minyan blocked: missing fields", payload);
    showToast("Please fill in the date, time, location, and notes.");
    announceToScreenReader("Please fill in the required fields.");
    return;
  }

  if (!selectedGooglePlace) {
    debugLog("Create minyan blocked: no selected Google place");
    showToast("Please choose the location from Google Maps suggestions.");
    announceToScreenReader("Please choose the location from Google Maps suggestions.");
    focusLocationWidget();
    return;
  }

  payload.location = selectedGooglePlace.formatted_address || selectedGooglePlace.name || payload.location;

  try {
    debugLog("Creating minyan", payload);
    const response = await fetch(`${API_BASE_URL}/api/minyanim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Could not save minyan.");
    }

    refs.form.reset();
    selectedGooglePlace = null;
    setDefaultFormValues();
    showToast("New minyan saved to the local server.");
    announceToScreenReader("New minyan saved successfully.");
    await loadMinyanim();
  } catch (error) {
    debugError("Create minyan failed", error);
    showToast("Could not save the new minyan.");
  }
}

async function updateResponse(minyanId, responseType) {
  const payload = {
    clientId,
    name: getTextFieldValue("participant-name"),
    contact: getTextFieldValue("participant-contact"),
    response: responseType,
  };

  if (!payload.name) {
    debugLog("Update response blocked: missing participant name", {
      minyanId,
      responseType,
    });
    showToast("Please enter your name before choosing a response.");
    announceToScreenReader("Please enter your name before choosing a response.");
    return;
  }

  try {
    debugLog("Saving participant response", {
      minyanId,
      responseType,
      clientId,
    });
    const response = await fetch(`${API_BASE_URL}/api/minyanim/${encodeURIComponent(minyanId)}/participants`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Could not save response.");
    }

    showToast(`Response saved: ${getResponseLabel(responseType)}.`);
    announceToScreenReader(`Response saved: ${getResponseLabel(responseType)}.`);
    await loadMinyanim();
  } catch (error) {
    debugError("Save participant response failed", error);
    showToast("Could not save your response.");
  }
}

function getSelectedMinyan(list) {
  return list.find((minyan) => minyan.id === selectedMinyanId) || null;
}

function getConfirmedCount(minyan) {
  return getResponseCount(minyan.participants, "confirm");
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
  return getMyParticipant(minyan.participants)?.response || "";
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
  if (!GOOGLE_MAPS_READY) {
    return "";
  }

  if (minyan.googlePlaceId) {
    return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=place_id:${encodeURIComponent(minyan.googlePlaceId)}`;
  }

  return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(minyan.location)}`;
}

function renderParticipantList(participants) {
  if (!participants.length) {
    return `<p class="meta-text">No participants have joined yet.</p>`;
  }

  return participants
    .map((participant) => `
      <article class="participant-item">
        <p><strong>${escapeHtml(participant.name)}</strong></p>
        <p class="meta-text">${escapeHtml(participant.contact || "No contact added")} | ${escapeHtml(getResponseLabel(participant.response))}</p>
      </article>
    `)
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

function launchGroupEmail(minyan) {
  const contacts = minyan.participants.map((participant) => participant.contact).filter((contact) => contact && contact.includes("@"));
  const message = getGroupMessage();

  if (!contacts.length) {
    showToast("No email addresses are available yet.");
    return;
  }

  window.location.href = `mailto:${contacts.join(",")}?subject=${encodeURIComponent(`Message for ${formatDate(minyan.date)} minyan`)}&body=${encodeURIComponent(message)}`;
}

function launchGroupText(minyan) {
  const contacts = minyan.participants
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
  if (!GOOGLE_MAPS_READY) {
    debugLog("Google Maps disabled: missing or placeholder API key");
    return;
  }

  window.initMinyanManMaps = async () => {
    googleMapsReady = true;
    debugLog("Google Maps script loaded");
    await setupCreateMap();
    await setupLocationAutocomplete();
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=${GOOGLE_MAPS_LIBRARIES}&callback=initMinyanManMaps`;
  script.async = true;
  script.defer = true;
  script.onerror = (error) => {
    debugError("Google Maps script failed to load", error);
  };
  document.head.appendChild(script);
  debugLog("Google Maps script requested");
}

async function setupLocationAutocomplete() {
  if (!googleMapsReady || !window.google?.maps || locationAutocomplete || !refs.locationWidgetHost) {
    debugLog("Skipping autocomplete setup", {
      googleMapsReady,
      hasGoogleMaps: Boolean(window.google?.maps),
      hasWidgetHost: Boolean(refs.locationWidgetHost),
      alreadyCreated: Boolean(locationAutocomplete),
    });
    return;
  }

  try {
    await google.maps.importLibrary("places");
    locationAutocomplete = new google.maps.places.PlaceAutocompleteElement({
      includedPrimaryTypes: ["geocode"],
    });
    locationAutocomplete.setAttribute("placeholder", "Start typing and choose a Google Maps location");
    refs.locationWidgetHost.replaceChildren(locationAutocomplete);
    debugLog("PlaceAutocompleteElement ready");

    locationAutocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
      try {
        const place = placePrediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "formattedAddress", "location", "id"],
        });

        selectedGooglePlace = {
          place_id: place.id || "",
          name: place.displayName || "",
          formatted_address: place.formattedAddress || "",
          location: place.location || null,
        };

        refs.locationInput.value = selectedGooglePlace.formatted_address || selectedGooglePlace.name || "";
        debugLog("Place selected", selectedGooglePlace);
        updateCreateMapSelection();
      } catch (error) {
        debugError("Place selection failed", error);
      }
    });
  } catch (error) {
    debugError("Autocomplete setup failed", error);
  }
}

async function setupCreateMap() {
  if (!googleMapsReady || !window.google?.maps || createMap || !refs.createMapCanvas) {
    debugLog("Skipping create map setup", {
      googleMapsReady,
      hasGoogleMaps: Boolean(window.google?.maps),
      hasCreateMapCanvas: Boolean(refs.createMapCanvas),
      alreadyCreated: Boolean(createMap),
    });
    return;
  }

  try {
    const { Map } = await google.maps.importLibrary("maps");
    createMap = new Map(refs.createMapCanvas, {
      center: { lat: 40.7128, lng: -74.006 },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });
    debugLog("Create map ready");
  } catch (error) {
    debugError("Create map setup failed", error);
  }
}

function updateCreateMapSelection() {
  if (!selectedGooglePlace || !selectedGooglePlace.location || !createMap || !window.google?.maps) {
    debugLog("Skipping create map selection update", {
      hasSelectedPlace: Boolean(selectedGooglePlace),
      hasLocation: Boolean(selectedGooglePlace?.location),
      hasCreateMap: Boolean(createMap),
      hasGoogleMaps: Boolean(window.google?.maps),
    });
    return;
  }

  const lat = typeof selectedGooglePlace.location.lat === "function"
    ? selectedGooglePlace.location.lat()
    : selectedGooglePlace.location.lat;
  const lng = typeof selectedGooglePlace.location.lng === "function"
    ? selectedGooglePlace.location.lng()
    : selectedGooglePlace.location.lng;
  const position = { lat, lng };

  createMap.setCenter(position);
  createMap.setZoom(16);

  if (!createMapMarker) {
    createMapMarker = new google.maps.Marker({
      map: createMap,
      position,
      title: selectedGooglePlace.name || selectedGooglePlace.formatted_address || "Selected minyan location",
    });
  } else {
    createMapMarker.setPosition(position);
    createMapMarker.setTitle(selectedGooglePlace.name || selectedGooglePlace.formatted_address || "Selected minyan location");
  }

  if (refs.createMapSelection) {
    refs.createMapSelection.textContent =
      selectedGooglePlace.formatted_address || selectedGooglePlace.name || "Location selected.";
  }

  debugLog("Create map updated", {
    lat,
    lng,
    label: refs.createMapSelection?.textContent || "",
  });
}

function focusLocationWidget() {
  const widget = refs.locationWidgetHost?.querySelector("gmp-place-autocomplete");
  if (widget && typeof widget.focus === "function") {
    widget.focus();
    return;
  }

  refs.locationWidgetHost?.focus?.();
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

function debugLog(message, details) {
  if (details !== undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`, details);
    return;
  }

  console.log(`${DEBUG_PREFIX} ${message}`);
}

function debugError(message, error) {
  console.error(`${DEBUG_PREFIX} ${message}`, error);
}
