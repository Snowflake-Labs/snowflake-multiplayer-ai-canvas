/**
 * Thin wrapper around the Cortex Agent SDK for canvas use.
 *
 * Inside App Runtime, SNOWFLAKE_HOST and SNOWFLAKE_ACCOUNT are injected as
 * env vars. We pass SNOWFLAKE_HOST as the explicit base URL.
 *
 * Auth: service OAuth token (read from /snowflake/session/token) with an
 * X-Snowflake-Role header pinned to the agent's least-privilege role. See
 * callerAgentClient() below.
 */

import { CortexAgentClient } from "@snowflake/cortex-agent-sdk";
import { getServiceToken } from "./auth";
import type { IncomingMessage } from "node:http";

const AGENT_FQN = {
  database: "AGENT_CANVAS",
  schema: "AGENTS",
  name: "CANVAS_AGENT",
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/**
 * Minimal custom authenticator for the SPCS composite login token.
 * Treated as OAuth per docs on `spcs-execute-sql`; REST wants:
 *   Authorization: Bearer <composite>
 *   X-Snowflake-Authorization-Token-Type: OAUTH
 */
class CompositeOAuthAuth {
  constructor(private readonly token: string, private readonly role?: string) {}
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "X-Snowflake-Authorization-Token-Type": "OAUTH",
    };
    if (this.role) headers["X-Snowflake-Role"] = this.role;
    return headers;
  }
}

export function callerAgentClient(req: IncomingMessage | Request): CortexAgentClient {
  const account = requireEnv("SNOWFLAKE_ACCOUNT");
  const host = process.env.SNOWFLAKE_HOST;

  const serviceToken = getServiceToken();

  const common = {
    account,
    ...(host ? { baseUrl: `https://${host}` } : {}),
  };

  if (serviceToken) {
    // Auth: service OAuth token with an X-Snowflake-Role header pinned to
    // AGENT_CANVAS_ROLE. That role is the agent's least-privilege
    // execution role, scoped to USAGE on the agent, its semantic views,
    // its Cortex Search services, and the warehouse — nothing else. The
    // service inherits ACCOUNTADMIN, which has the role granted to it, so
    // the downgrade is honored.
    return new CortexAgentClient({
      ...common,
      auth: new CompositeOAuthAuth(serviceToken, "AGENT_CANVAS_ROLE") as unknown as string,
    });
  }

  // Local dev fallback
  const pat = process.env.SNOWFLAKE_PAT;
  if (!pat) {
    throw new Error(
      "No service token (not deployed) and no SNOWFLAKE_PAT for local dev."
    );
  }
  return new CortexAgentClient({ ...common, auth: pat });
}

export function agentFqn(): { database: string; schema: string; name: string } {
  return AGENT_FQN;
}
