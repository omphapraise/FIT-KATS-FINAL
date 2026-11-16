<<<<<<< HEAD
# Fit Kats

Fit Kats is a premium tiered-membership gym app. It has a native Android client and a Node.js REST API with a SQLite database. It is a school project; there is no real gym behind it.

## What it does

- Register, log in, profile and settings
- Home dashboard
- Workout logging with edit/delete, plus a progress screen with per-exercise history
- Loyalty points ledger (10 points per workout, max 3 rewarded workouts per day)
- Membership tiers and status
- Class booking with capacity checks and cancellation
- Announcements with read/unread tracking
- Equipment issue reports
- QR check-in with a rotating 60-second token, plus a live "members in the gym" count
- Referrals: enter a friend's code, both get points after the first check-in
- Payment history (demo data only)
- Big Kat knowledge base (37 JSON files, 467 records) with a chatbot API and a programme generator API. The Android app has a chat screen ("Ask Big Kat") and a programmes screen, both built and checked on an emulator. See `docs/BIGKAT_KNOWLEDGE.md` and `docs/API.md`.

## Tech

- Android: Kotlin, XML Views, Fragments, ViewBinding, Retrofit, OkHttp, coroutines. Package `com.fitkats.app`. minSdk 24, targetSdk 36, compileSdk 37.
- Backend: Node.js, Express 4, better-sqlite3 (SQLite file `backend/fitkats.db`), bcryptjs, jsonwebtoken, dotenv.
- Migrations: plain SQL files in `backend/src/migrations`, run in filename order at startup and tracked in `schema_migrations`. Never edit an applied migration; add a new one.
- Big Kat knowledge: JSON files in `backend/knowledge`, loaded read-only at startup. Only members' saved programmes are stored in the database.

## Folder layout

    FitKats/
      android-app/   Android Studio project
      backend/       Express API, SQLite, tests, knowledge JSON
      docs/          API.md, BIGKAT_KNOWLEDGE.md, PROJECT_HANDOVER.md, RELEASE_NOTES.md

## Run the backend

From `backend`:

    npm install
    copy .env.example .env
    npm run seed
    npm run dev

Edit `.env` and set real values for `PORT`, `JWT_SECRET`, `DB_FILE` and `KIOSK_KEY`. `KIOSK_KEY` must be at least 16 characters or `POST /checkins` returns 503. Never commit `.env`.

`npm run seed` is safe to repeat. `npm run seed:reset` wipes all data.

Demo login: `demo@fitkats.com` / `Password123`.

The server listens on all network interfaces (`0.0.0.0:3000`), so a phone on the same network can reach it.

## Run the Android app

The app finds the API through build flavors (one dimension, `target`) defined in `android-app/app/build.gradle.kts`. Each flavor bakes in its own `API_BASE_URL`. The URL must start with `http://` and end with a slash.

| Flavor | API_BASE_URL | Use |
| --- | --- | --- |
| emulator | `http://10.0.2.2:3000/` | Android emulator |
| usb | `http://localhost:3000/` | Real phone over USB, with `adb reverse` |
| home | `http://<PC_WI-FI_IP>:3000/` | Real phone over Wi-Fi at home |
| venue | `http://<VENUE_PC_IP>:3000/` | Real phone over the presentation Wi-Fi |

Edit the `home` and `venue` addresses to match your PC. Pick a flavor in Android Studio under View > Tool Windows > Build Variants (`emulatorDebug`, `usbDebug`, `homeDebug`, `venueDebug`). The address is baked in at build time, so rebuild after changing it. Only one build can be installed on a phone at a time, and the installed build decides which address the app calls.

Always start the backend first.

### Emulator

Select `emulatorDebug`, then Run on an emulator.

### Real phone over USB

1. Start the backend (`npm run dev` in `backend`).
2. From any folder, create the tunnel (use your own device id from `adb devices`):

       adb -s <device-id> reverse tcp:3000 tcp:3000

3. Select `usbDebug`, pick the phone as the run target, and Run.
4. The tunnel is lost if you replug the cable or restart adb. Run the reverse command again.

### Real phone over Wi-Fi, no cable (install an APK)

The cable is only needed to install the app. Once installed, the phone talks to the PC over Wi-Fi. The phone and PC must be on the same network.

1. Allow port 3000 through the Windows firewall. In an administrator PowerShell:

       New-NetFirewallRule -DisplayName "FitKats API 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Public

2. Find the PC's Wi-Fi IPv4 address with `ipconfig`. It should share its first three numbers with the phone's address.
3. With the backend running, open `http://<PC_WI-FI_IP>:3000/health` in Chrome on the phone. If you see a JSON "ok", the network path works. If it hangs, check the firewall rule, that both devices are on the same network, and that the router does not isolate clients.
4. Put that address in the `home` flavor in `build.gradle.kts`, then build from `android-app` (needs JAVA_HOME pointing at a JDK, for example the one bundled with Android Studio):

       .\gradlew.bat :app:assembleHomeDebug

   Use `:app:assembleVenueDebug` for the venue flavor. The APK is written to `android-app\app\build\outputs\apk\home\debug\app-home-debug.apk` (or `...\venue\debug\`).
5. Send the APK to the phone (Google Drive, WhatsApp, Telegram or email), uninstall any other Fit Kats build, open the APK and tap Install. Allow "install unknown apps" if asked.
6. Open Fit Kats and log in with the demo account.

Your PC's address can change through DHCP. If the app suddenly cannot reach the server, re-run `ipconfig` and rebuild if the address moved. If the venue Wi-Fi blocks device-to-device traffic, use the USB route instead.

Command-line build of all default variants, from `android-app`:

    .\gradlew.bat :app:assembleDebug

## Tests

The API server must be running (`npm run dev` in its own terminal). From `backend`:

    npm test

This runs the knowledge validator, then twelve test files: api, bookings, stage3, reports, payments, checkins, referrals, knowledge, knowledge-stage1, knowledge-stage1b, knowledge-stage2b and knowledge-stage2c. On 2026-11-12 the full run printed 359 checks passed, 0 failed (validator 20, api 21, bookings 35, stage3 35, reports 22, payments 13, checkins 22, referrals 28, knowledge 83, stage 1 37, stage 1b 10, stage 2b 22, stage 2c 11). Run it yourself and read the output before trusting it.

Validate only the knowledge files:

    npm run validate:knowledge

## API

See `docs/API.md`.

## Known limitations

- Payments are demo records only. No payment provider is connected.
- There is no staff or manager tooling, so equipment reports stay `Open` forever. Members can submit and view their own reports only.
- The session token is stored in plain text in SharedPreferences.
- Cleartext HTTP is allowed on Android for local development. A deployed version would need HTTPS.
- The backend falls back to the secret `dev_secret` if `JWT_SECRET` is not set. Always set a real one.
- SQLite is a single file with no replication or built-in backups. Fine for a prototype, not for scale. Run only one API instance per database file.
- Membership upgrades happen at the front desk, not in the app.
- Points redemption is not built. The ledger has a REDEMPTION type, but nothing creates it.
- The QR scanner side is a kiosk endpoint only; there is no kiosk app.
- The check-in QR has been proven with the kiosk endpoint, but not scanned with a real camera.
- Login was confirmed on a physical phone over USB and over Wi-Fi (installed APK, no cable). The other screens were checked on an emulator.
- The API address is baked into each build. A changed PC address means a rebuild. Venue Wi-Fi may block device-to-device traffic.
- There is no email verification and no password reset.
- Big Kat is not an AI model. The chatbot is keyword and fuzzy matching over 40 FAQs, not semantic search. The programme generator picks from 11 programmes in the source document and does not invent plans.
- 46 library exercises are names-only stubs pending review. Their technique and safety text is deliberately empty, and no guidance is marked as verified.
- The South African emergency numbers (112 and 10177) were web-checked only and have not been signed off by an official reviewer. Re-verify before any real release.
- Programme adaptation is advice only. It does not read logged workouts and never changes loads.
- Chat history is not saved.
=======
# Fit Kats Gym App


A premium gym membership mobile app prototype for **Fit Kats**, a tiered-membership gym concept in Sandton.
Built for **Module XISD6329 (Task 2)**.

The app is a **balanced MVP**. Core features work end to end (app, API and database), secondary features are
simplified, and advanced features are simulated, so the scope stays realistic.



## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | Kotlin, Android Studio, ViewBinding, Material 3, Retrofit, Coroutines |
| API | Node.js, Express, JWT login tokens, bcrypt password hashing |
| Database | SQLite (relational: primary keys, foreign keys, constraints) |
| Testing | 21 automated API tests, 15 Android unit tests, input validation in the app and API |
| DevOps | GitHub Actions (build, check, test, APK artifact) |

## Features

| # | Feature | Level |
|---|---|---|
| 1 | Registration and login | Full (API + database + UI) |
| 2 | Member dashboard | Full |
| 3 | Workout logging (sets, reps, weight) | Full |
| 4 | Progress tracking (history and stats) | Full |
| 5 | Membership information (tier, expiry) | Full |
| 6 | Settings (display name, notifications) | Full |
| 7 | Payment history | Full (seeded mock data) |
| 8 | Class booking | Simplified (list and book button) |
| 9 | Real-time capacity | Simplified (static Green / Orange / Red indicator) |
| 10 | Loyalty points | Simplified (+10 points for every logged workout) |
| 11 | Referral system | Simplified (input and confirmation) |
| 12 | Announcements feed | Simplified (static) |
| 13 | Equipment fault reporting | Simplified (form saved to the database) |
| 14 | Facial recognition check-in | Simulated |
| 15 | Biometric update | Simulated (UI only) |
| 16 | Tier perks dashboard | Simulated (static) |
| 17 | Off-peak incentives | Simulated |

## App navigation

The bottom bar has five tabs: **Home**, **Workouts**, **Gym**, **Account** and **Settings**.

## Project structure

```
FitKats/
├── android-app/          Kotlin Android app
│   └── app/src/
│       ├── main/         screens (ui), network (api), data classes (model), helpers (util), layouts (res)
│       └── test/         Android unit tests
├── backend/              Node.js + Express API and SQLite database
│   ├── src/
│   │   ├── routes/       auth, profile, workouts, payments, reports
│   │   ├── middleware/   login check (JWT)
│   │   ├── db.js         database connection and table creation
│   │   ├── seed.js       sample data (10+ records per table)
│   │   └── server.js     API entry point
│   ├── test-api.js       automated API tests
│   └── show-db.js        prints the database structure and sample rows
├── docs/                 user guide, DevOps notes, demo script
└── .github/workflows/    CI pipeline
```

## Database

| Table | Columns |
|---|---|
| Users | id (PK), email, password (hashed), display_name, membership_tier, membership_expiry, loyalty_points |
| Workouts | id (PK), user_id (FK), exercise_name, sets, reps, weight, date |
| Settings | user_id (PK, FK), notifications_enabled |
| Payments | id (PK), user_id (FK), amount, status, date |
| Reports | id (PK), user_id (FK), description, status |

Foreign keys link every table to Users. The tables use correct data types and check constraints (for example,
sets and reps must be above zero, and payment status must be Paid, Pending or Failed).

## API endpoints

| Method | Endpoint | Purpose | Login needed |
|---|---|---|---|
| POST | /register | Create an account | No |
| POST | /login | Log in and receive a token | No |
| GET | /profile | Profile, membership and settings | Yes |
| POST | /update-profile | Change display name or notifications | Yes |
| POST | /add-workout | Save a workout (+10 points) | Yes |
| GET | /workouts | Workout history | Yes |
| GET | /payments | Payment history | Yes |
| POST | /report-issue | Report broken equipment | Yes |

All replies are JSON with `success` and `message`. Errors return clear messages and the right status code.

## How to run it

### 1. Backend
```bash
cd backend
npm install
npm run seed     # creates the database with sample data
npm run dev      # starts the API on http://localhost:3000
```

### 2. Android app
1. Open the `android-app` folder in Android Studio.
2. Start an emulator.
3. Press Run. The emulator reaches the API at `http://10.0.2.2:3000/`.

For a real phone, change `BASE_URL` in `ApiClient.kt` to your computer's IP address.

### Demo account
Email: `demo@fitkats.com`
Password: `Password123`

Other sample accounts use the same password: `lerato@fitkats.com` (Platinum) and `zanele@fitkats.com` (expired membership).

## Testing

**API tests** (21 checks: login, registration, validation, profile, workouts, points, payments, reports, errors):
```bash
cd backend
npm run dev     # in one terminal
npm test        # in another terminal
```

**Android unit tests** (15 checks on the input rules and formatters): in Android Studio, right-click
`UtilTests` in the `test` folder and choose **Run 'UtilTests'**.

**Database viewer:**
```bash
cd backend
node show-db.js
```

Both sets of tests run automatically in GitHub Actions on every push.

## Simulated and simplified features

- Face check-in, face profile update, tier perks and off-peak points are simulated previews.
- Class bookings and referral counts are stored on the phone, not in the database.
- Loyalty points are real only for logged workouts (+10 each). Referral and off-peak points are simulated.
- The capacity indicator is static. Tapping the card previews the other levels.

## DevOps lifecycle

See [docs/DEVOPS.md](docs/DEVOPS.md). User instructions are in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## Author

Your Name, Student number, Rosebank College
>>>>>>> 94a675fe30a5e5e742d650e122fde26215db6383
