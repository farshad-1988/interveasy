export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
  sid: string;
  jti: string;
};

export type AuthenticatedUser = {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
};

export type RequestContext = {
  userAgent?: string;
  ipAddress?: string;
  deviceInfo?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenMaxAgeMs: number;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
};
