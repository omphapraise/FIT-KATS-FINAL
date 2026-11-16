require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db'); // also runs the migrations

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const activateRoutes = require('./routes/activate');
const profileRoutes = require('./routes/profile');
const workoutRoutes = require('./routes/workouts');
const progressRoutes = require('./routes/progress');
const loyaltyRoutes = require('./routes/loyalty');
const paymentRoutes = require('./routes/payments');
const reportRoutes = require('./routes/reports');
const classRoutes = require('./routes/classes');
const bookingRoutes = require('./routes/bookings');
const announcementRoutes = require('./routes/announcements');
const membershipRoutes = require('./routes/membership');
const checkinRoutes = require('./routes/checkins');
const referralRoutes = require('./routes/referrals');
const knowledgeRoutes = require('./routes/knowledge'); // loads and checks the Big Kat knowledge files at startup
const programmeRoutes = require('./routes/programmes'); // saved Big Kat programmes
const staffRoutes = require('./routes/staff'); // staff and manager tools (role enforced in the router)
const managerRoutes = require('./routes/manager'); // manager-only read-only aggregates

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---- Request log: prints one line for every request that reaches the server ----
app.use((req, res, next) => {
  const time = new Date().toLocaleTimeString();
  console.log(`${time}  ${req.method} ${req.url}`);
  next();
});

// Health check: confirms API + database are alive
app.get('/health', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS users FROM Users').get();
    res.json({ status: 'ok', message: 'Fit Kats API is running', users: row.users });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Database problem' });
  }
});

// All endpoints
app.use('/', authRoutes);          // POST /register, POST /login
app.use('/', meRoutes);            // GET /me
app.use('/', activateRoutes);      // POST /activate (public, one-time setup code)
app.use('/', profileRoutes);       // GET /profile, POST /update-profile
app.use('/', workoutRoutes);       // POST /add-workout, GET /workouts, PUT/DELETE /workouts/:id
app.use('/', progressRoutes);      // GET /progress
app.use('/', loyaltyRoutes);       // GET /loyalty
app.use('/', paymentRoutes);       // GET /payments
app.use('/', reportRoutes);        // POST /report-issue
app.use('/', classRoutes);         // GET /classes
app.use('/', bookingRoutes);       // POST /bookings, DELETE /bookings/:id, GET /bookings
app.use('/', announcementRoutes);  // GET /announcements, POST /announcements/:id/read
app.use('/', membershipRoutes);    // GET /membership
app.use('/', checkinRoutes);       // GET /checkin-token, POST /checkins (kiosk), GET /gym/busy
app.use('/', referralRoutes);      // GET /referral, POST /referral/redeem
app.use('/', knowledgeRoutes);     // GET /knowledge/*, POST /fitness-ai/search, POST /fitness-ai/answer
app.use('/', programmeRoutes);     // POST /programmes/generate, GET /programmes, GET/DELETE /programmes/:id, POST /programmes/:id/adapt
app.use('/', staffRoutes);         // /staff/* (staff + manager only; audit log manager only)
app.use('/', managerRoutes);       // /manager/* (manager only, read-only aggregates)

// Unknown route
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Bad JSON or any unexpected error: reply with JSON instead of crashing
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request' });
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong on the server' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fit Kats API running on http://localhost:${PORT}`);
});
