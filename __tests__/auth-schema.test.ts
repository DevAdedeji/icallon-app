import { loginSchema, signUpSchema } from '@/schemas/auth';

describe('authentication input validation', () => {
  it('normalizes email addresses before login', () => {
    const result = loginSchema.parse({ email: '  PLAYER@Example.COM ', password: 'secret12' });
    expect(result.email).toBe('player@example.com');
  });

  it('rejects malformed email addresses and short passwords', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: '123' });
    expect(result.success).toBe(false);
  });

  it('trims a valid player name during signup', () => {
    const result = signUpSchema.parse({
      email: 'player@example.com',
      password: 'secret12',
      username: '  Ada Player  ',
    });
    expect(result.username).toBe('Ada Player');
  });

  it('rejects player names and passwords outside supported limits', () => {
    expect(signUpSchema.safeParse({
      email: 'player@example.com',
      password: 'x'.repeat(73),
      username: 'ab',
    }).success).toBe(false);
  });
});
