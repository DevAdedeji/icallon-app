# ICallOn mobile

The Expo mobile client for ICallOn. It can create and join the same Supabase-backed rooms as the web game, with real-time lobby updates, timed rounds, answer autosave, host review, and final scores.

## One-time Supabase setup

Run [`supabase_mobile_setup.sql`](./supabase_mobile_setup.sql) in the Supabase SQL editor once. It allows each authenticated person to create their own game profile and prevents duplicate players/answers during reconnects and retries.

Add your public Supabase values to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

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
