# ICallOn Mobile

ICallOn is a real-time multiplayer word game for iOS and Android. A host creates a room, chooses the game settings and starting letter, and players race against the clock to submit answers across several categories. The host reviews the round, scores are updated live, and the game ends with a final leaderboard.

> **Project status:** Development is paused. This repository is public as a portfolio and reference project; there is no supported public release or hosted demo.

The original web application is available in the [ICallOn repository](https://github.com/DevAdedeji/ICallOn).

## Gameplay

- Email/password and Google authentication
- Private multiplayer rooms with shareable room codes
- Authenticated room creation and guest joining
- Configurable rounds, timers, category packs, and custom categories
- Real-time lobby, round, review, and leaderboard updates
- Automatic answer preservation when the host ends a round
- Host-led answer validation with optimistic scoring feedback
- Duplicate-aware scoring and live review progress
- Rematches, player profiles, match history, and progression
- Sound, haptic, animation, and confetti feedback
- Session recovery after an app restart or temporary disconnect

Solo play, daily challenges, and public matchmaking are intentionally paused while the multiplayer experience remains the product focus.

## Tech stack

- [React Native](https://reactnative.dev/) and [Expo SDK 57](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- TypeScript
- [Supabase](https://supabase.com/) Auth, PostgreSQL, Realtime, and Row Level Security
- Jest and React Native Testing Library
- Maestro for simulator-based end-to-end tests

## Project structure

```text
app/                  Expo Router screens
components/           Shared interface components
features/             Auth, rooms, game, profile, and feedback domains
lib/                  Shared game and Supabase clients
schemas/              Input validation schemas
database/tests/       PostgreSQL integration tests
e2e/                  Maestro smoke and multiplayer flows
assets/                Images and game audio
```

## Local setup

### Prerequisites

- Node.js and npm
- Expo Go or an iOS/Android simulator
- A Supabase project
- PostgreSQL 17+ for the optional database integration suite
- Maestro for the optional simulator end-to-end suites

Install the dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Add your own Supabase project values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

The publishable key is intentionally available to the mobile client. Authorization depends on correctly configured Row Level Security. Never place a Supabase secret key, service-role key, database URL, signing key, or other private credential in this repository.

### Configure Supabase

Run the following idempotent scripts in the Supabase SQL editor, in order:

1. [`supabase_game_policies.sql`](./supabase_game_policies.sql) installs player-ownership and host-authority policies.
2. [`supabase_mobile_setup.sql`](./supabase_mobile_setup.sql) installs constraints and authenticated database functions for room creation, joining, game transitions, answer submission, scoring, and game completion.

The database functions validate the caller and execute multiplayer transitions atomically. The client does not decide host authority or calculate trusted scores.

For Google sign-in, add `icallon://auth/callback` to the allowed redirect URLs in Supabase Auth. OAuth requires a development or production build because it depends on the app scheme.

The checked-in Expo owner, project ID, update URL, and native application identifiers belong to the original project. Forks should replace them with their own Expo project and unique bundle/package identifiers before creating builds or publishing updates.

## Run the app

Start an Expo Go session:

```bash
npm start
```

Run a native development build:

```bash
npm run ios
npm run android
```

Both devices must connect to the same Supabase project to participate in the same room.

## Verification

Run linting, TypeScript checks, and unit tests:

```bash
npm run verify
```

Run the disposable PostgreSQL policy and multiplayer integration suite:

```bash
npm run test:database
```

Run the iOS simulator smoke tests after installing and booting a development build:

```bash
npm run e2e:ios
```

Run the complete two-simulator multiplayer flow:

```bash
npm run e2e:ios:multiplayer
```

The multiplayer runner stores generated test credentials in the ignored `.e2e/credentials` file. They can be overridden with `E2E_HOST_EMAIL`, `E2E_HOST_USERNAME`, `E2E_GUEST_EMAIL`, `E2E_GUEST_USERNAME`, and `E2E_TEST_PASSWORD`.

## Security notes

- `.env`, native signing material, generated test credentials, and build artifacts are ignored.
- Only Supabase publishable credentials belong in the client environment.
- Row Level Security and database functions are the authorization boundary.
- Use a separate Supabase project for local experimentation and never reuse production credentials in a fork.

If a real secret is ever committed, revoke or rotate it immediately. Removing it from the latest commit is not sufficient because Git history and existing clones may retain it.

## License

No open-source license is currently granted. The source is publicly viewable, but all rights remain with the copyright holder unless a license is added later.
