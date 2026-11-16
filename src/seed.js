const bcrypt = require('bcryptjs');
const db = require('./db');

// Usage:
//   npm run seed         -> SAFE. Adds demo content (classes, announcements). Adds the demo
//                           members only if the Users table is empty. Never deletes anything.
//   npm run seed:reset   -> DESTRUCTIVE. Wipes every table and rebuilds the demo data.
const RESET = process.argv.includes('--reset');

if (RESET && process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset a production database.');
  process.exit(1);
}

const PASSWORD = 'Password123';

// id, email, display_name, tier, expiry, points
const users = [
  [1, 'demo@fitkats.com',   'Demo Member',    'Gold',     '2026-12-31', 120],
  [2, 'thabo@fitkats.com',  'Thabo Nkosi',    'Silver',   '2026-11-30', 40],
  [3, 'lerato@fitkats.com', 'Lerato Dlamini', 'Platinum', '2027-03-31', 300],
  [4, 'sipho@fitkats.com',  'Sipho Khumalo',  'Silver',   '2026-10-31', 15],
  [5, 'naledi@fitkats.com', 'Naledi Moyo',    'Gold',     '2027-01-31', 90],
  [6, 'kabelo@fitkats.com', 'Kabelo Sithole', 'Silver',   '2026-12-15', 60],
  [7, 'ayanda@fitkats.com', 'Ayanda Zulu',    'Platinum', '2027-06-30', 410],
  [8, 'mpho@fitkats.com',   'Mpho Mahlangu',  'Gold',     '2026-11-15', 75],
  [9, 'zanele@fitkats.com', 'Zanele Ndlovu',  'Silver',   '2026-09-30', 5],
  [10, 'junior@fitkats.com', 'Junior Botha',  'Gold',     '2027-02-28', 150],
];

// user_id, exercise, sets, reps, weight, date
const workouts = [
  [1, 'Bench Press',    4, 8,  60,   '2026-09-14'],
  [1, 'Squat',          4, 6,  80,   '2026-09-16'],
  [1, 'Deadlift',       3, 5,  100,  '2026-09-18'],
  [1, 'Overhead Press', 3, 10, 35,   '2026-09-21'],
  [1, 'Bench Press',    4, 8,  62.5, '2026-09-23'],
  [1, 'Squat',          4, 6,  85,   '2026-09-25'],
  [1, 'Barbell Row',    4, 10, 55,   '2026-09-28'],
  [1, 'Deadlift',       3, 5,  105,  '2026-09-30'],
  [1, 'Bench Press',    4, 8,  65,   '2026-10-02'],
  [1, 'Lat Pulldown',   3, 12, 45,   '2026-10-05'],
  [1, 'Squat',          4, 6,  90,   '2026-10-07'],
  [1, 'Bicep Curl',     3, 12, 15,   '2026-10-09'],
  [2, 'Leg Press',      4, 12, 120,  '2026-10-01'],
  [3, 'Hip Thrust',     4, 10, 90,   '2026-10-02'],
  [4, 'Dumbbell Press', 3, 10, 20,   '2026-10-03'],
];

// user_id, notifications_enabled
const settings = [
  [1, 1], [2, 1], [3, 0], [4, 1], [5, 1],
  [6, 0], [7, 1], [8, 1], [9, 0], [10, 1],
];

// user_id, amount, status, date
const payments = [
  [1, 899,  'Paid',    '2026-08-01'],
  [1, 899,  'Paid',    '2026-09-01'],
  [1, 899,  'Paid',    '2026-10-01'],
  [2, 499,  'Paid',    '2026-10-01'],
  [3, 1499, 'Paid',    '2026-10-01'],
  [4, 499,  'Pending', '2026-10-01'],
  [5, 899,  'Paid',    '2026-09-01'],
  [6, 499,  'Failed',  '2026-09-01'],
  [7, 1499, 'Paid',    '2026-09-01'],
  [8, 899,  'Paid',    '2026-10-01'],
  [9, 499,  'Failed',  '2026-09-01'],
  [10, 899, 'Pending', '2026-10-01'],
];

// user_id, description, status
const reports = [
  [1, 'Treadmill 3 is making a loud grinding noise',     'Open'],
  [2, 'Cable machine handle is cracked',                 'In Progress'],
  [3, 'Leg press seat adjuster is stuck',                'Resolved'],
  [4, 'Water dispenser near the squat racks is leaking', 'Open'],
  [5, 'Dumbbell rack is missing 12.5kg weights',         'Resolved'],
  [6, 'Rowing machine screen does not turn on',          'In Progress'],
  [7, 'Spin bike 5 pedal is loose',                      'Open'],
  [8, 'Bench press bar collar is broken',                'Open'],
  [9, 'Locker 14 will not lock',                         'Resolved'],
  [10, 'Air conditioning is too hot in the cardio area', 'In Progress'],
];

// Weekly class timetable (South African time, UTC+2). day: 0 = Sunday ... 6 = Saturday
const timetable = [
  { day: 1, time: '06:30', mins: 60, title: 'Power Yoga',   coach: 'Coach Naledi', capacity: 20,
    description: 'A strong flowing yoga session to build flexibility, balance and core strength.' },
  { day: 2, time: '12:15', mins: 45, title: 'HIIT Express', coach: 'Coach Sipho',  capacity: 15,
    description: 'Short, sharp intervals to torch calories on your lunch break.' },
  { day: 3, time: '18:00', mins: 45, title: 'Spin Cycle',   coach: 'Coach Lerato', capacity: 20,
    description: 'High-energy indoor cycling with live performance screens on Level 2.' },
  { day: 4, time: '17:30', mins: 60, title: 'Strength Lab', coach: 'Coach Thabo',  capacity: 12,
    description: 'Coached barbell and dumbbell strength work. Learn the lifts, add the weight.' },
  { day: 6, time: '09:00', mins: 60, title: 'Boxing Fit',   coach: 'Coach Ayanda', capacity: 15,
    description: 'Pad work, footwork and conditioning. No fighting experience needed.' },
];

const announcements = [
  ['New spin studio is open',
   'Level 2 now has 20 new bikes with live performance screens.', '2026-10-12', 1],
  ['Public holiday hours',
   'The gym is open 07:00 to 15:00 on 16 December. Classes are cancelled.', '2026-10-10', 0],
  ['Double points month',
   'Log 12 workouts this month and unlock bonus loyalty rewards.', '2026-10-01', 0],
];

// Adds the next 14 days of classes. Safe to run again: UNIQUE (title, starts_at) skips duplicates.
function ensureUpcomingClasses(days = 14) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO Classes (title, description, coach, starts_at, ends_at, capacity)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const saNow = new Date(Date.now() + 2 * 3600 * 1000); // "today" in South Africa
  let added = 0;

  for (let d = 0; d < days; d++) {
    const day = new Date(saNow.getTime() + d * 86400 * 1000);
    const ymd = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();

    for (const t of timetable.filter((x) => x.day === dow)) {
      const start = new Date(`${ymd}T${t.time}:00+02:00`);
      if (start.getTime() <= Date.now()) continue; // never create classes in the past
      const end = new Date(start.getTime() + t.mins * 60 * 1000);
      const r = insert.run(t.title, t.description, t.coach, start.toISOString(), end.toISOString(), t.capacity);
      added += r.changes;
    }
  }
  return added;
}

function ensureAnnouncements() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO Announcements (title, body, published_at, is_pinned) VALUES (?, ?, ?, ?)`);
  let added = 0;
  announcements.forEach((a) => { added += insert.run(...a).changes; });
  return added;
}

function seedDemoMembers() {
  const hash = bcrypt.hashSync(PASSWORD, 10);

  const insUser = db.prepare(`
    INSERT INTO Users (id, email, password, display_name, membership_tier, membership_expiry, loyalty_points)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  users.forEach((u) => insUser.run(u[0], u[1], hash, u[2], u[3], u[4], u[5]));

  const insWorkout = db.prepare(`
    INSERT INTO Workouts (user_id, exercise_name, sets, reps, weight, date) VALUES (?, ?, ?, ?, ?, ?)`);
  workouts.forEach((w) => insWorkout.run(...w));

  const insSetting = db.prepare(`INSERT INTO Settings (user_id, notifications_enabled) VALUES (?, ?)`);
  settings.forEach((s) => insSetting.run(...s));

  const insPayment = db.prepare(`INSERT INTO Payments (user_id, amount, status, date) VALUES (?, ?, ?, ?)`);
  payments.forEach((p) => insPayment.run(...p));

  const insReport = db.prepare(`INSERT INTO Reports (user_id, description, status) VALUES (?, ?, ?)`);
  reports.forEach((r) => insReport.run(...r));
}

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

const run = db.transaction(() => {
  if (RESET) {
    // Children first, then parents
    db.exec(`
      DELETE FROM ReportEvents;
      DELETE FROM StaffNotes;
      DELETE FROM PasswordSetups;
      DELETE FROM AuditLog;
      DELETE FROM AnnouncementReads;
      DELETE FROM Bookings;
      DELETE FROM Classes;
      DELETE FROM Announcements;
      DELETE FROM Reports;
      DELETE FROM Payments;
      DELETE FROM Workouts;
      DELETE FROM Settings;
      DELETE FROM Users;
      DELETE FROM sqlite_sequence WHERE name IN
        ('Users','Workouts','Payments','Reports','Classes','Bookings','Announcements',
         'AuditLog','StaffNotes','ReportEvents','PasswordSetups');
    `);
  }

  let membersSeeded = false;
  if (count('Users') === 0) {
    seedDemoMembers();
    membersSeeded = true;
  }
  const classesAdded = ensureUpcomingClasses();
  const announcementsAdded = ensureAnnouncements();
  return { membersSeeded, classesAdded, announcementsAdded };
});

const result = run();

console.log(RESET ? 'Database RESET and seeded:' : 'Seed finished (nothing was deleted):');
console.log(`  Demo members added:  ${result.membersSeeded ? 'yes' : 'no (users already exist)'}`);
console.log(`  New classes added:   ${result.classesAdded}`);
console.log(`  New announcements:   ${result.announcementsAdded}`);
console.log(`  Totals -> Users: ${count('Users')}, Workouts: ${count('Workouts')}, ` +
            `Classes: ${count('Classes')}, Bookings: ${count('Bookings')}, Announcements: ${count('Announcements')}`);
console.log('');
console.log('Demo login  ->  demo@fitkats.com  /  Password123');
