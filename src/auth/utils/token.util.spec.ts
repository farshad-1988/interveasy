import {
  buildRefreshToken,
  generateRefreshTokenSecret,
  hashRefreshToken,
  parseRefreshToken,
  refreshTokenHashesMatch,
} from './token.util';

describe('token utils', () => {
  it('builds and parses refresh tokens', () => {
    const secret = generateRefreshTokenSecret();
    const token = buildRefreshToken('session-id', secret);

    expect(parseRefreshToken(token)).toEqual({
      sessionId: 'session-id',
      secret,
    });
  });

  it('rejects malformed tokens', () => {
    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('no-separator')).toBeNull();
    expect(parseRefreshToken('.secret')).toBeNull();
    expect(parseRefreshToken('id.')).toBeNull();
  });

  it('hashes tokens and compares them in constant time', () => {
    const token = buildRefreshToken('abc', generateRefreshTokenSecret());
    const hash = hashRefreshToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(refreshTokenHashesMatch(token, hash)).toBe(true);
    expect(refreshTokenHashesMatch(`${token}x`, hash)).toBe(false);
  });
});
