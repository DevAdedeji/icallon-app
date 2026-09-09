# ICallOn mobile

The Expo mobile client for ICallOn. It can create and join the same Supabase-backed rooms as the web game, with real-time lobby updates, timed rounds, answer autosave, host review, and final scores.

## One-time Supabase setup

Run these idempotent scripts in the Supabase SQL editor, in order:

1. [`supabase_game_policies.sql`](./supabase_game_policies.sql) replaces the old public-write policies with player ownership and host-only scoring controls.
2. [`supabase_mobile_setup.sql`](./supabase_mobile_setup.sql) prevents duplicate players/answers during reconnects and retries.

Re-run both scripts after pulling database-policy changes. The publishable key is only safe when row-level security is enabled and these policies are active.

The setup script also installs the authenticated database functions used for room creation, joining, gameplay transitions, answer submission, scoring, and ending a game. These operations validate the caller and run atomically in PostgreSQL; the mobile client does not decide host authority or calculate trusted scores.

Copy `.env.example` to `.env`, then add your public Supabase values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

The publishable key is intentionally included in the client application. Never add a
Supabase secret key, service-role key, or database connection URL to this repository.
Row Level Security is the authorization boundary for mobile requests.

Also add `icallon://auth/callback` as a redirect URL in Supabase Auth when using Google sign-in in a development or production build.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Run on iOS

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npm run ios
   ```

For an Expo Go session, run `npm start` and scan the QR code. Google sign-in needs a development build (`npm run ios`) because it uses the app's `icallon://` callback.

The application routes are:

- Welcome, email/password sign-up and login, Google sign-in
- Authenticated home screen; create or join a room
- Live lobby and invite sharing
- Host letter selection, timed answers, autosave and submission
- Host answer review/validation, scoring, next round and leaderboard

## Verification

Run the local checks before pushing a mobile change:

```bash
npm run verify
npm run test:database
npx expo-doctor
```

`npm run test:database` starts a disposable local PostgreSQL 17+ instance, applies the policy and mobile setup scripts, exercises a two-player game, verifies authorization and scoring invariants, reapplies the migration to prove it is idempotent, and then removes the temporary database.

With an iOS Simulator booted and the development build installed, run the simulator smoke suite with:

```bash
npm run e2e:ios
```

The complete multiplayer suite uses two booted simulators and dedicated test accounts:

```bash
npm run e2e:ios:multiplayer
```

On its first run, the script generates dedicated credentials in the ignored `.e2e/credentials` file and provisions two test-only Supabase users. You can override them with `E2E_HOST_EMAIL`, `E2E_HOST_USERNAME`, `E2E_GUEST_EMAIL`, `E2E_GUEST_USERNAME`, and `E2E_TEST_PASSWORD`. The suite creates a three-round room on the host simulator, joins from the guest simulator, submits and scores every round, and verifies the 120-point final leaderboard on both devices.

Expo can open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
