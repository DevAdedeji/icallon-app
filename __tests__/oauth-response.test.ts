import { parseOAuthCallbackUrl } from '@/features/auth/oauth-response';

describe('OAuth callback parsing', () => {
  it('reads access and refresh tokens from a URL fragment', () => {
    expect(parseOAuthCallbackUrl('icallon://auth/callback#access_token=access&refresh_token=refresh')).toEqual({
      type: 'tokens',
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('reads a PKCE code from the query string', () => {
    expect(parseOAuthCallbackUrl('icallon://auth/callback?code=oauth-code')).toEqual({
      type: 'code',
      code: 'oauth-code',
    });
  });

  it('surfaces provider errors', () => {
    expect(() => parseOAuthCallbackUrl(
      'icallon://auth/callback?error=access_denied&error_description=Login%20cancelled',
    )).toThrow('Login cancelled');
  });

  it('rejects incomplete token responses', () => {
    expect(() => parseOAuthCallbackUrl(
      'icallon://auth/callback#access_token=access',
    )).toThrow('authentication response was incomplete');
  });

  it('falls back to an existing session when the provider already completed it', () => {
    expect(parseOAuthCallbackUrl('icallon://auth/callback')).toEqual({ type: 'existing-session' });
  });
});
