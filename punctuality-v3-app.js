const $ = (id) => document.getElementById(id);

let events = JSON.parse(localStorage.getItem("punctualityEventsV3") || "[]");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function saveEvents() {
  localStorage.setItem("punctualityEventsV3", JSON.stringify(events));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getLeaveDate(event) {
  const date = new Date(event.eventTime);
  date.setMinutes(date.getMinutes() - Number(event.travel || 0) - Number(event.buffer || 0));
  return date;
}

function isPast(event) {
  return new Date(event.eventTime).getTime() < Date.now();
}

function resetForm() {
  $("editingId").value = "";
  $("formTitle").textContent = "Add event";
  $("saveBtn").textContent = "Save event";
  $("cancelEditBtn").classList.add("hidden");
  $("title").value = "";
  $("destination").value = "";
  $("eventTime").value = "";
  $("travel").value = 30;
  $("buffer").value = 15;
  $("tasks").value = "";
}

function render() {
  events.sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));

  const upcoming = events.filter((e) => !isPast(e));
  const past = events.filter((e) => isPast(e)).sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));
  const next = upcoming[0];

  $("nextEvent").innerHTML = next ? eventHtml(next, true) : '<p class="empty">No upcoming event.</p>';
  $("eventList").innerHTML = upcoming.length ? upcoming.map((e) => eventHtml(e, false)).join("") : '<p class="empty">No upcoming events saved.</p>';
  $("pastList").innerHTML = past.length ? past.map((e) => pastEventHtml(e)).join("") : '<p class="empty">No past events yet.</p>';

  renderTracker();
}

function eventHtml(event, detailed) {
  const leave = getLeaveDate(event);
  const tasks = (event.tasks || []).filter(Boolean).map((t) => `<div class="task">✓ ${escapeHtml(t)}</div>`).join("");

  return `<article class="event">
    <h3>${escapeHtml(event.title)}</h3>
    <p class="meta">📍 ${escapeHtml(event.destination)}</p>
    <p class="meta">📅 ${formatTime(event.eventTime)}</p>
    <p class="meta">Travel ${Number(event.travel)} min + buffer ${Number(event.buffer)} min</p>
    <p class="meta">Leave by</p>
    <p class="leave">${leave.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
    ${detailed ? tasks : ""}
    <div class="actions three">
      <button class="secondary" onclick="scheduleReminder('${event.id}')">Reminder</button>
      <button class="secondary" onclick="openRoute('${encodeURIComponent(event.destination)}')">Route</button>
      <button class="secondary" onclick="exportCalendar('${event.id}')">Calendar</button>
    </div>
    <div class="actions">
      <button class="secondary" onclick="editEvent('${event.id}')">Edit</button>
      <button class="danger" onclick="deleteEvent('${event.id}')">Delete</button>
    </div>
  </article>`;
}

function pastEventHtml(event) {
  const completed = event.completionStatus === "on-time" || event.completionStatus === "late";
  const statusBadge = !completed
    ? '<span class="badge neutral">Not completed</span>'
    : event.completionStatus === "on-time"
      ? `<span class="badge good">On time · ${Number(event.minutesDelta || 0)} min early/on time</span>`
      : `<span class="badge bad">Late · ${Number(event.minutesDelta || 0)} min</span>`;

  return `<article class="event">
    <h3>${escapeHtml(event.title)}</h3>
    <p class="meta">📍 ${escapeHtml(event.destination)}</p>
    <p class="meta">📅 ${formatTime(event.eventTime)}</p>
    ${statusBadge}

    <div class="actions three">
      <button class="secondary" onclick="exportCalendar('${event.id}')">Calendar</button>
      <button class="secondary" onclick="editEvent('${event.id}')">Edit</button>
      <button class="danger" onclick="deleteEvent('${event.id}')">Delete</button>
    </div>

    <div class="complete-box">
      <p class="meta">Track how this event went.</p>
      <div class="grid">
        <label>Status
          <select id="status-${event.id}">
            <option value="on-time" ${event.completionStatus === "on-time" ? "selected" : ""}>On time</option>
            <option value="late" ${event.completionStatus === "late" ? "selected" : ""}>Late</option>
          </select>
        </label>
        <label>Minutes early/late
          <input id="delta-${event.id}" type="number" min="0" value="${Number(event.minutesDelta || 0)}" />
        </label>
      </div>
      <button class="success" onclick="completeEvent('${event.id}')">Save progress</button>
    </div>
  </article>`;
}

function renderTracker() {
  const completed = events.filter((e) => e.completionStatus === "on-time" || e.completionStatus === "late");

  if (!completed.length) {
    $("score").textContent = "100";
    $("rate").textContent = "0%";
    $("streak").textContent = "0";
    $("average").textContent = "0";
    $("trackerNote").textContent = "Complete past events to start measuring progress.";
    return;
  }

  const onTime = completed.filter((e) => e.completionStatus === "on-time").length;
  const late = completed.filter((e) => e.completionStatus === "late");
  const rate = Math.round((onTime / completed.length) * 100);
  const avgLate = late.length
    ? Math.round(late.reduce((sum, e) => sum + Number(e.minutesDelta || 0), 0) / late.length)
    : 0;

  const chronological = completed.slice().sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
  let streak = 0;
  for (let i = chronological.length - 1; i >= 0; i--) {
    if (chronological[i].completionStatus === "on-time") streak++;
    else break;
  }

  let score = 100;
  completed.forEach((e) => {
    if (e.completionStatus === "on-time") score += 2;
    else {
      const mins = Number(e.minutesDelta || 0);
      if (mins < 5) score -= 1;
      else if (mins <= 15) score -= 3;
      else score -= 5;
    }
  });
  score = Math.max(0, Math.min(150, score));

  $("score").textContent = score;
  $("rate").textContent = `${rate}%`;
  $("streak").textContent = streak;
  $("average").textContent = avgLate;
  $("trackerNote").textContent =
    rate >= 80 ? "Good progress. Keep the buffer habit." :
    rate >= 50 ? "You are improving, but your buffer may be too small." :
    "Your system needs stronger reminders and bigger buffers.";
}

function addOrUpdateEvent() {
  const title = $("title").value.trim();
  const destination = $("destination").value.trim();
  const eventTime = $("eventTime").value;
  const travel = Number($("travel").value);
  const buffer = Number($("buffer").value);
  const tasks = $("tasks").value.split("\n").map((t) => t.trim()).filter(Boolean);

  if (!title || !destination || !eventTime) {
    alert("Add a title, destination, and event time.");
    return;
  }

  const editingId = $("editingId").value;

  if (editingId) {
    events = events.map((event) => event.id === editingId
      ? { ...event, title, destination, eventTime, travel, buffer, tasks }
      : event
    );
  } else {
    events.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title,
      destination,
      eventTime,
      travel,
      buffer,
      tasks,
      createdAt: new Date().toISOString()
    });
  }

  saveEvents();
  resetForm();
  render();
}

function editEvent(id) {
  const event = events.find((e) => e.id === id);
  if (!event) return;

  $("editingId").value = event.id;
  $("formTitle").textContent = "Edit event";
  $("saveBtn").textContent = "Update event";
  $("cancelEditBtn").classList.remove("hidden");

  $("title").value = event.title;
  $("destination").value = event.destination;
  $("eventTime").value = event.eventTime;
  $("travel").value = event.travel;
  $("buffer").value = event.buffer;
  $("tasks").value = (event.tasks || []).join("\n");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;
  events = events.filter((e) => e.id !== id);
  saveEvents();
  render();
}

function completeEvent(id) {
  const status = $(`status-${id}`).value;
  const delta = Number($(`delta-${id}`).value || 0);

  events = events.map((e) => e.id === id ? {
    ...e,
    completionStatus: status,
    minutesDelta: delta,
    completedAt: new Date().toISOString()
  } : e);

  saveEvents();
  render();
}

async function scheduleReminder(id) {
  const event = events.find((e) => e.id === id);
  if (!event) return;

  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert("Notification permission was not granted.");
    return;
  }

  const leave = getLeaveDate(event);
  const delay = leave.getTime() - Date.now();

  if (delay <= 0) {
    new Notification("Leave now", { body: `Time to leave for ${event.title}.` });
    return;
  }

  const safeDelay = Math.min(delay, 2147483647);
  setTimeout(() => {
    new Notification("Time to leave", {
      body: `Leave now for ${event.title}. Travel time includes your buffer.`
    });
  }, safeDelay);

  alert("Reminder set for this browser session. For stronger reminders, export the event to Calendar.");
}

function openRoute(encodedDestination) {
  window.location.href = `https://maps.apple.com/?daddr=${encodedDestination}`;
}

function requestNotifications() {
  if (!("Notification" in window)) {
    $("permissionStatus").textContent = "This browser does not support notifications.";
    return;
  }

  Notification.requestPermission().then((permission) => {
    $("permissionStatus").textContent = `Notification permission: ${permission}`;
  });
}

function requestLocation() {
  if (!navigator.geolocation) {
    $("permissionStatus").textContent = "Location is not supported on this browser.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      $("permissionStatus").textContent =
        `Location allowed: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
    },
    () => {
      $("permissionStatus").textContent = "Location permission was not allowed.";
    }
  );
}

function toICSDate(dateValue) {
  return new Date(dateValue).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function cleanICS(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function exportCalendar(id) {
  const event = events.find((e) => e.id === id);
  if (!event) return;

  const start = new Date(event.eventTime);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const leave = getLeaveDate(event);
  const description = [
    `Leave by: ${leave.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
    `Travel: ${event.travel} minutes`,
    `Buffer: ${event.buffer} minutes`,
    "",
    "Tasks:",
    ...(event.tasks || []).map((task) => `- ${task}`)
  ].join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Punctuality Planner//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@punctuality-planner`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${cleanICS(event.title)}`,
    `LOCATION:${cleanICS(event.destination)}`,
    `DESCRIPTION:${cleanICS(description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Upcoming event: ${cleanICS(event.title)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    `TRIGGER:-PT${Number(event.travel) + Number(event.buffer)}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:Leave now for ${cleanICS(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

$("saveBtn").addEventListener("click", addOrUpdateEvent);
$("cancelEditBtn").addEventListener("click", resetForm);
$("notifyBtn").addEventListener("click", requestNotifications);
$("locationBtn").addEventListener("click", requestLocation);

render();
