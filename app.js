const $ = (id) => document.getElementById(id);
let events = JSON.parse(localStorage.getItem('punctualityEvents') || '[]');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

function saveEvents() {
  localStorage.setItem('punctualityEvents', JSON.stringify(events));
}

function formatTime(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function getLeaveDate(event) {
  const date = new Date(event.eventTime);
  date.setMinutes(date.getMinutes() - Number(event.travel) - Number(event.buffer));
  return date;
}

function render() {
  events.sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
  const now = new Date();
  const next = events.find(e => new Date(e.eventTime) > now);
  $('nextEvent').innerHTML = next ? eventHtml(next, true) : '<p class="empty">No upcoming event.</p>';
  $('eventList').innerHTML = events.length ? events.map(e => eventHtml(e, false)).join('') : '<p class="empty">No events saved.</p>';
}

function eventHtml(event, detailed) {
  const leave = getLeaveDate(event);
  const tasks = event.tasks.filter(Boolean).map(t => `<div class="task">✓ ${escapeHtml(t)}</div>`).join('');
  return `<article class="event">
    <h3>${escapeHtml(event.title)}</h3>
    <p class="meta">📍 ${escapeHtml(event.destination)}</p>
    <p class="meta">📅 ${formatTime(event.eventTime)}</p>
    <p class="meta">Travel ${event.travel} min + buffer ${event.buffer} min</p>
    <p class="meta">Leave by</p>
    <p class="leave">${leave.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    ${detailed ? tasks : ''}
    <button class="secondary" onclick="scheduleReminder('${event.id}')">Set reminder</button>
    <button class="secondary" onclick="openRoute('${encodeURIComponent(event.destination)}')">Open route</button>
  </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

$('saveBtn').addEventListener('click', () => {
  const title = $('title').value.trim();
  const destination = $('destination').value.trim();
  const eventTime = $('eventTime').value;
  if (!title || !destination || !eventTime) {
    alert('Add title, destination, and event time.');
    return;
  }
  const event = {
    id: crypto.randomUUID(),
    title,
    destination,
    eventTime,
    travel: Number($('travel').value || 0),
    buffer: Number($('buffer').value || 0),
    tasks: $('tasks').value.split('\n').map(t => t.trim()).filter(Boolean)
  };
  events.push(event);
  saveEvents();
  render();
});

$('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    $('permissionStatus').textContent = 'This browser does not support notifications.';
    return;
  }
  const permission = await Notification.requestPermission();
  $('permissionStatus').textContent = `Notification permission: ${permission}`;
});

$('locationBtn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    $('permissionStatus').textContent = 'Location is not supported on this device.';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => $('permissionStatus').textContent = `Location active: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
    err => $('permissionStatus').textContent = `Location error: ${err.message}`,
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

async function scheduleReminder(id) {
  const event = events.find(e => e.id === id);
  if (!event) return;
  if (Notification.permission !== 'granted') {
    alert('Enable notifications first.');
    return;
  }
  const leave = getLeaveDate(event);
  const delay = leave.getTime() - Date.now();
  if (delay <= 0) {
    showReminder(event);
    return;
  }
  localStorage.setItem(`reminder-${id}`, leave.toISOString());
  alert(`Reminder set for ${leave.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Keep the app installed/open for best results.`);
  setTimeout(() => showReminder(event), delay);
}

function showReminder(event) {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'REMINDER', title: event.title, destination: event.destination });
  } else {
    new Notification('Time to leave', { body: `Leave now for ${event.title}. Destination: ${event.destination}` });
  }
}

function openRoute(destination) {
  window.open(`https://maps.apple.com/?daddr=${destination}`, '_blank');
}

window.scheduleReminder = scheduleReminder;
window.openRoute = openRoute;
render();
