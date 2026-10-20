import { createRemoteJWKSet, jwtVerify } from 'jose';

// Cloudflare Access sits in front of admin.appyl.ai and adds a signed JWT to every request it lets
// through. The Worker checks it as well, so a request that reaches the Worker any other way is refused.
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Local `vite dev` only (.dev.vars): skips Access on localhost. */
  DEV_NO_ACCESS?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeam = '';

/** The signed-in person's email, or null. With Access not configured, everyone is refused. */
export async function accessEmail(request: Request, env: AccessEnv): Promise<string | null> {
  const url = new URL(request.url);
  if (env.DEV_NO_ACCESS === '1' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return 'dev@localhost';

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  if (jwksTeam !== env.ACCESS_TEAM_DOMAIN) {
    jwks = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    jwksTeam = env.ACCESS_TEAM_DOMAIN;
  }
  try {
    const { payload } = await jwtVerify(token, jwks!, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
