export type OAuthCallbackResponse =
  | { type: 'tokens'; accessToken: string; refreshToken: string }
  | { type: 'code'; code: string }
  | { type: 'existing-session' };

function getParam(url: string, key: string): string | null {
  const queryPart = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const hashPart = url.includes('#') ? url.split('#')[1] : '';
  return new URLSearchParams(queryPart).get(key) ?? new URLSearchParams(hashPart).get(key);
}

export function parseOAuthCallbackUrl(url: string): OAuthCallbackResponse {
  const errorDescription = getParam(url, 'error_description');
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = getParam(url, 'access_token');
  const refreshToken = getParam(url, 'refresh_token');
  const code = getParam(url, 'code');

  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      throw new Error('The authentication response was incomplete. Please try again.');
    }
    return { type: 'tokens', accessToken, refreshToken };
  }

  if (code) return { type: 'code', code };
  return { type: 'existing-session' };
}
