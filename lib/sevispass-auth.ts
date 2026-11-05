import {createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey} from 'jose';

export const eligibilityScope = 'registry/pspass.eligibility.read';
const keySets = new Map<string, JWTVerifyGetKey>();

export async function verifySevisPassToken(
  token: string,
  config: {issuer: string; audience: string; clientId: string},
  key?: JWTVerifyGetKey,
) {
  if (!key) {
    key = keySets.get(config.issuer);
    if (!key) {
      key = createRemoteJWKSet(new URL(config.issuer.replace(/\/$/, '') + '/.well-known/jwks.json'), {timeoutDuration: 5000});
      keySets.set(config.issuer, key);
    }
  }

  const {payload} = await jwtVerify(token, key, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256'],
    requiredClaims: ['exp'],
  });
  return payload.token_use === 'access'
    && payload.client_id === config.clientId
    && typeof payload.scope === 'string'
    && payload.scope.split(/\s+/).includes(eligibilityScope);
}
