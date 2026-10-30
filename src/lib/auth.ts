/**
 * Auth helpers for the multiplayer canvas.
 *
 * Two token sources inside an App Runtime container with executeAsCaller:true:
 *
 *   - Service OAuth token: file at /snowflake/session/token (rotates; re-read on each use).
 *   - Caller user token:   header `Sf-Context-Current-User-Token` on each ingress request.
 *
 * For SQL via snowflake-sdk, the login token is `<service-oauth>.<caller-token>`.
 * The Cortex Agent REST path uses the service OAuth token directly with an
 * X-Snowflake-Role header; see agent.ts.
 */

import { readFileSync, existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";

const SERVICE_TOKEN_PATH = "/snowflake/session/token";
const CALLER_TOKEN_HEADER = "sf-context-current-user-token";

export function getServiceToken(): string | undefined {
  if (!existsSync(SERVICE_TOKEN_PATH)) return undefined;
  // Re-read every call. The token rotates; cache is not safe.
  return readFileSync(SERVICE_TOKEN_PATH, "utf8").trim();
}

/**
 * Pull the caller token from the request headers injected by the Snowflake
 * ingress proxy when `executeAsCaller: true` is set on the service.
 * Returns undefined in local dev (header is only injected in deployed mode).
 */
export function getCallerToken(req: IncomingMessage | Request): string | undefined {
  return headerValue(req, CALLER_TOKEN_HEADER);
}

/**
 * Compose the SPCS login token for a caller-rights request.
 * Format per docs: `<service-oauth>.<caller-token>`.
 */
export function composeLoginToken(serviceToken: string, callerToken: string): string {
  return `${serviceToken}.${callerToken}`;
}

/**
 * Resolve the caller identity for a request.
 *
 * In deployed mode (App Runtime, executeAsCaller:true), returns real caller
 * context from the SPCS-injected headers.
 *
 * In local dev, returns a fake identity derived from CANVAS_LOCAL_USER env
 * so two browser profiles can be told apart. Set CANVAS_LOCAL_USER before
 * `next dev` to control who you are locally.
 */
export interface CallerIdentity {
  user: string;      // Snowflake login name (uppercased).
  deployed: boolean; // true when we have a real caller token.
}

export function getCallerIdentity(req: IncomingMessage | Request): CallerIdentity {
  const callerToken = getCallerToken(req);
  if (callerToken) {
    const header = headerValue(req, "sf-context-current-user");
    return { user: (header ?? "UNKNOWN").toUpperCase(), deployed: true };
  }
  const local = process.env.CANVAS_LOCAL_USER ?? "LOCAL_DEV";
  return { user: local.toUpperCase(), deployed: false };
}

function headerValue(req: IncomingMessage | Request, name: string): string | undefined {
  if ("headers" in req && typeof (req.headers as Headers).get === "function") {
    const v = (req.headers as Headers).get(name);
    return v ?? undefined;
  }
  const raw = (req.headers as NodeJS.Dict<string | string[]>)[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
