// Integration tests for classes, bookings, announcements and membership.
// Run with the server already started: npm start   (then in a second terminal)  node test-bookings.js
// It creates its own tiny class and throwaway members, and cleans them up at the end.
const db = require('./src/db');

const BASE = process.env.API_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

function check(name, condition) {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

async function newMember(tag) {
  const email = `booktest-${tag}-${Date.now()}@fitkats.com`;
  const r = await call('POST', '/register', { email, password: 'Test1234', display_name: `Tester ${tag}` });
  return { token: r.json.token, id: r.json.user.id, email };
}

async function run() {
  console.log(`Testing classes and bookings at ${BASE}\n`);

  // A class with only 2 spots, starting tomorrow
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 3600 * 1000);
  const classId = db.prepare(`
    INSERT INTO Classes (title, description, coach, starts_at, ends_at, capacity)
    VALUES ('TEST Capacity Class', 'Used by the test script', 'Coach Test', ?, ?, 2)`)
    .run(start.toISOString(), end.toISOString()).lastInsertRowid;
  const pastId = db.prepare(`
    INSERT INTO Classes (title, description, coach, starts_at, ends_at, capacity)
    VALUES ('TEST Past Class', 'Already started', 'Coach Test', ?, ?, 5)`)
    .run(new Date(Date.now() - 3600 * 1000).toISOString(), new Date(Date.now() + 1800 * 1000).toISOString())
    .lastInsertRowid;

  const a = await newMember('a');
  const b = await newMember('b');
  const c = await newMember('c');
  const createdUsers = [a.id, b.id, c.id];

  try {
    // ---- Auth is required ----
    let r = await call('GET', '/classes');
    check('Classes blocked without login', r.status === 401);
    r = await call('POST', '/bookings', { class_id: classId });
    check('Booking blocked without login', r.status === 401);

    // ---- Listing ----
    r = await call('GET', '/classes', null, a.token);
    const listed = (r.json.data || []).find((x) => x.id === classId);
    check('Classes list loads and includes my test class', r.status === 200 && !!listed);
    check('New class shows 2 spots, not booked', listed && listed.spots_left === 2 && listed.is_booked === false);
    check('Seeded classes exist', (r.json.data || []).length >= 3);
    check('Started class is not listed', !(r.json.data || []).find((x) => x.id === pastId));

    // ---- Validation ----
    r = await call('POST', '/bookings', {}, a.token);
    check('Booking rejects missing class_id', r.status === 400);
    r = await call('POST', '/bookings', { class_id: 'abc' }, a.token);
    check('Booking rejects non-numeric class_id', r.status === 400);
    r = await call('POST', '/bookings', { class_id: 999999 }, a.token);
    check('Booking unknown class returns 404', r.status === 404);
    r = await call('POST', '/bookings', { class_id: pastId }, a.token);
    check('Cannot book a class that already started', r.status === 400);

    // ---- Booking, duplicates, capacity ----
    r = await call('POST', '/bookings', { class_id: classId }, a.token);
    check('Member A books successfully', r.status === 201 && r.json.data.status === 'Confirmed');
    const bookingA = r.json.data && r.json.data.id;

    r = await call('POST', '/bookings', { class_id: classId }, a.token);
    check('Duplicate booking is rejected (409)', r.status === 409);

    r = await call('POST', '/bookings', { class_id: classId }, b.token);
    check('Member B books the last spot', r.status === 201 && r.json.spots_left === 0);
    const bookingB = r.json.data && r.json.data.id;

    r = await call('POST', '/bookings', { class_id: classId }, c.token);
    check('Member C is refused: class is full (409)', r.status === 409);

    r = await call('GET', '/classes', null, c.token);
    const full = (r.json.data || []).find((x) => x.id === classId);
    check('Class now reports full with 0 spots', full && full.is_full === true && full.spots_left === 0);

    // ---- Ownership ----
    r = await call('DELETE', `/bookings/${bookingA}`, null, c.token);
    check("Member C cannot cancel Member A's booking (404)", r.status === 404);
    r = await call('GET', '/bookings', null, c.token);
    check("Member C's history does not show other members' bookings", r.status === 200 && r.json.count === 0);

    // ---- Cancel frees the spot ----
    r = await call('DELETE', `/bookings/${bookingB}`, null, b.token);
    check('Member B cancels their booking', r.status === 200 && r.json.data.status === 'Cancelled');
    r = await call('DELETE', `/bookings/${bookingB}`, null, b.token);
    check('Cancelling twice returns 404', r.status === 404);

    r = await call('POST', '/bookings', { class_id: classId }, c.token);
    check('Member C can now take the freed spot', r.status === 201);

    r = await call('POST', '/bookings', { class_id: classId }, b.token);
    check('Class is full again, B cannot re-book', r.status === 409);

    // ---- Re-booking after cancelling reuses the row (no duplicates in the table) ----
    r = await call('DELETE', `/bookings/${bookingA}`, null, a.token);
    check('Member A cancels', r.status === 200);
    r = await call('POST', '/bookings', { class_id: classId }, a.token);
    check('Member A re-books after cancelling', r.status === 201 && r.json.data.id === bookingA);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM Bookings WHERE class_id = ? AND user_id = ?')
      .get(classId, a.id).n;
    check('Only one booking row exists for A (unique constraint holds)', rows === 1);

    const confirmed = db.prepare("SELECT COUNT(*) AS n FROM Bookings WHERE class_id = ? AND status = 'Confirmed'")
      .get(classId).n;
    check('Database never holds more confirmed bookings than capacity', confirmed === 2);

    // ---- History ----
    r = await call('GET', '/bookings', null, a.token);
    check('Booking history returns my booking with class details',
      r.status === 200 && r.json.count === 1 && r.json.data[0].title === 'TEST Capacity Class'
      && r.json.data[0].is_upcoming === true);

    // ---- Announcements ----
    r = await call('GET', '/announcements', null, a.token);
    check('Announcements list loads', r.status === 200 && r.json.count >= 3);
    check('New member sees all announcements as unread', r.json.unread_count === r.json.count);
    const annId = r.json.data[0].id;
    r = await call('POST', `/announcements/${annId}/read`, null, a.token);
    check('Mark announcement read', r.status === 200);
    r = await call('GET', '/announcements', null, a.token);
    check('Unread count drops by one', r.json.unread_count === r.json.count - 1);
    r = await call('GET', '/announcements', null, b.token);
    check("Another member's unread count is unaffected", r.json.unread_count === r.json.count);
    r = await call('POST', '/announcements/999999/read', null, a.token);
    check('Reading unknown announcement returns 404', r.status === 404);

    // ---- Membership ----
    r = await call('GET', '/membership', null, a.token);
    check('Membership loads with tier, status and perks',
      r.status === 200 && r.json.data.tier === 'Silver' && r.json.data.perks.length > 0);
    check('All three tiers returned, one marked current',
      r.json.data.tiers.length === 3 && r.json.data.tiers.filter((t) => t.is_current).length === 1);
    r = await call('GET', '/membership');
    check('Membership blocked without login', r.status === 401);
  } finally {
    // Clean up: deleting the users cascades to their bookings
    createdUsers.forEach((id) => db.prepare('DELETE FROM Users WHERE id = ?').run(id));
    db.prepare("DELETE FROM Classes WHERE title LIKE 'TEST %'").run();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run crashed:', err.message);
  process.exit(1);
});
