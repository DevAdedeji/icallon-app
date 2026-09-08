import { supabase } from './client';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { parseOAuthCallbackUrl } from '@/features/auth/oauth-response';

WebBrowser.maybeCompleteAuthSession();

export const getAuthRedirectUrl = (): string => {
  const appOwnership = Constants.appOwnership;

  // Expo Go cannot deep-link to custom schemes owned by your standalone app.
  if (appOwnership === 'expo') {
    return Linking.createURL('auth/callback');
  }

  return Linking.createURL('auth/callback', { scheme: 'icallon' });
};

export const completeOAuthCallback = async (url: string): Promise<void> => {
  const response = parseOAuthCallbackUrl(url);

  if (response.type === 'tokens') {
    const { error } = await supabase.auth.setSession({
      access_token: response.accessToken,
      refresh_token: response.refreshToken,
    });
    if (error) throw error;
    return;
  }

  if (response.type === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(response.code);
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('No authentication session was returned.');
};

export const signInWithGoogle = async (): Promise<void> => {
  try {
    const redirectUrl = getAuthRedirectUrl();

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

    await completeOAuthCallback(result.url);
  } catch (error: unknown) {
    throw error instanceof Error ? error : new Error('Google sign-in failed.');
  }
};
