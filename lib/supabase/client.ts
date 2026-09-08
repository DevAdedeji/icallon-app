import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};
// Environment variables are preferred so development, preview, and production
// builds can point to different Supabase projects without checking keys into app.json.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? (extra.supabaseUrl as string);
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (extra.supabaseAnonKey as string);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables - add to app.json under extra');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
