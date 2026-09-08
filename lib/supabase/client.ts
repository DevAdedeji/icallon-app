import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and add the project URL and publishable key.',
  );
}

if (
  supabasePublishableKey.startsWith('sb_secret_') ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error('A Supabase secret or service-role key must never be bundled in the mobile app.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
