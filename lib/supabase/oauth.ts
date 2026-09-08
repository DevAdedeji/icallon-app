import { supabase } from './client';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const getRedirectUrl = () => {
  const appOwnership = Constants.appOwnership;

  // Expo Go cannot deep-link to custom schemes owned by your standalone app.
  if (appOwnership === 'expo') {
    return Linking.createURL('auth/callback');
  }

  return Linking.createURL('auth/callback', { scheme: 'icallon' });
};

const getParamFromUrl = (url: string, key: string) => {
  const queryPart = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const hashPart = url.includes('#') ? url.split('#')[1] : '';

  const queryValue = new URLSearchParams(queryPart).get(key);
  if (queryValue) return queryValue;

  return new URLSearchParams(hashPart).get(key);
};

export const signInWithGoogle = async () => {
  try {
    const redirectUrl = getRedirectUrl();

    if (Constants.appOwnership === 'expo') {
      throw new Error(
        'Google sign-in requires an Expo development build. Expo Go cannot reliably return Supabase OAuth sessions back to the app. Use `npx expo run:ios` or an EAS development build.'
      );
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('Missing OAuth URL');

    // Open OAuth in an auth session so the redirect is captured by the app.
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      preferEphemeralSession: true,
    });

    if (result.type !== 'success' || !('url' in result) || !result.url) {
      // On iOS/SafariViewController, a valid auth can still surface as cancel.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) return;

      throw new Error(
        'Google sign-in did not return to the app. Add this redirect URL in Supabase Auth settings: ' +
        redirectUrl
      );
    }

    const accessToken = getParamFromUrl(result.url, 'access_token');
    const refreshToken = getParamFromUrl(result.url, 'refresh_token');
    const authCode = getParamFromUrl(result.url, 'code');

    if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      return;
    }

    if (typeof authCode === 'string') {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
      if (exchangeError) throw exchangeError;
      return;
    }

    // If no tokens were returned but session exists, OAuth succeeded.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return;

    throw new Error('No auth tokens returned from Google sign-in');
  } catch (error) {
    console.error('Google OAuth error:', error);
    throw error;
  }
};
