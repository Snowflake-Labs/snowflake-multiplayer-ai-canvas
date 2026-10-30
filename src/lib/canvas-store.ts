/**
 * Snowflake connection + CANVASES table helpers.
 *
 * In deployed mode (App Runtime, executeAsCaller:true), SQL runs under the
 * app's execution role using the service OAuth token. For table reads/writes
 * where we want caller rights, we build a composite login token
 * `<service-oauth>.<caller-token>`. Only CANVASES access uses owner rights
 * (app plumbing). All data access that matters goes through Cortex Agent.
 */

import snowflake, { type Connection } from "snowflake-sdk";
import { getServiceToken, getCallerToken, composeLoginToken } from "./auth";
import type { IncomingMessage } from "node:http";

snowflake.configure({ logLevel: "WARN" } as unknown as snowflake.ConfigureOptions);

const DATABASE = "AGENT_CANVAS";
const SCHEMA = "PUBLIC";
const WAREHOUSE = "AGENT_CANVAS_WH";

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/**
 * Create a connection in owner's rights (service user). Used for app plumbing:
 * reading and writing the CANVASES mapping table.
 */
async function ownerConnection(): Promise<Connection> {
  const serviceToken = getServiceToken();
  const config: snowflake.ConnectionOptions = serviceToken
    ? {
        account: envRequired("SNOWFLAKE_ACCOUNT"),
        host: process.env.SNOWFLAKE_HOST,
        authenticator: "OAUTH",
        token: serviceToken,
        database: DATABASE,
        schema: SCHEMA,
        warehouse: WAREHOUSE,
      }
    : {
        account: envRequired("SNOWFLAKE_ACCOUNT"),
        username: envRequired("SNOWFLAKE_USER"),
        password: envRequired("SNOWFLAKE_PASSWORD"),
        database: DATABASE,
        schema: SCHEMA,
        warehouse: WAREHOUSE,
      };
  return connectAsync(config);
}

/**
 * Create a connection in caller's rights. Not currently used (all data access
 * is through Cortex Agent, not raw SQL), but wired so a future canvas feature
 * that queries user data directly has a path.
 */
export async function callerConnection(req: IncomingMessage | Request): Promise<Connection> {
  const serviceToken = getServiceToken();
  const callerToken = getCallerToken(req);
  if (!serviceToken || !callerToken) {
    throw new Error("Caller-rights connection requires both service token and caller token (deployed mode only).");
  }
  const token = composeLoginToken(serviceToken, callerToken);
  return connectAsync({
    account: envRequired("SNOWFLAKE_ACCOUNT"),
    host: process.env.SNOWFLAKE_HOST,
    authenticator: "OAUTH",
    token,
    database: DATABASE,
    schema: SCHEMA,
    warehouse: WAREHOUSE,
  });
}

function connectAsync(options: snowflake.ConnectionOptions): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection(options);
    conn.connect((err, c) => (err ? reject(err) : resolve(c)));
  });
}

function executeAsync<T>(conn: Connection, sqlText: string, binds?: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds: binds as snowflake.Binds | undefined,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows ?? []) as T[])),
    });
  });
}

// ----- CANVASES table ops (owner's rights; app plumbing) -----

export interface CanvasRow {
  CANVAS_ID: string;
  THREAD_ID: number;
  DISPLAY_NAME: string | null;
  CREATED_BY: string;
  CREATED_AT: string;
}

export async function getCanvas(canvasId: string): Promise<CanvasRow | undefined> {
  const conn = await ownerConnection();
  try {
    const rows = await executeAsync<CanvasRow>(
      conn,
      "SELECT canvas_id AS \"CANVAS_ID\", thread_id AS \"THREAD_ID\", display_name AS \"DISPLAY_NAME\", created_by AS \"CREATED_BY\", created_at AS \"CREATED_AT\" FROM AGENT_CANVAS.PUBLIC.CANVASES WHERE canvas_id = ?",
      [canvasId]
    );
    return rows[0];
  } finally {
    conn.destroy(() => {});
  }
}

export async function putCanvas(row: {
  canvasId: string;
  threadId: number;
  displayName?: string;
  createdBy: string;
}): Promise<void> {
  const conn = await ownerConnection();
  try {
    await executeAsync(
      conn,
      "INSERT INTO AGENT_CANVAS.PUBLIC.CANVASES (canvas_id, thread_id, display_name, created_by) VALUES (?, ?, ?, ?)",
      [row.canvasId, row.threadId, row.displayName ?? null, row.createdBy]
    );
  } finally {
    conn.destroy(() => {});
  }
}

export async function deleteCanvas(canvasId: string): Promise<void> {
  const conn = await ownerConnection();
  try {
    await executeAsync(
      conn,
      "DELETE FROM AGENT_CANVAS.PUBLIC.CANVASES WHERE canvas_id = ?",
      [canvasId]
    );
  } finally {
    conn.destroy(() => {});
  }
}

// ----- CANVAS_CONTEXT table ops (owner's rights; app plumbing) -----

export interface FilingRow {
  id: string;
  canvasId: string;
  threadId: number | null;
  filedBy: string;
  participants: string[];
  source: "user" | "agent";
  context: string;
}

/**
 * Insert a /file submission into the durable context log.
 * Append-only. The row is persisted even after the canvas session ends.
 */
export async function putFiling(row: FilingRow): Promise<void> {
  const conn = await ownerConnection();
  try {
    await executeAsync(
      conn,
      "INSERT INTO AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT (id, canvas_id, thread_id, filed_by, participants, source, context) " +
        "SELECT ?, ?, ?, ?, PARSE_JSON(?), ?, ?",
      [
        row.id,
        row.canvasId,
        row.threadId,
        row.filedBy,
        JSON.stringify(row.participants),
        row.source,
        row.context,
      ]
    );
  } finally {
    conn.destroy(() => {});
  }
}

export interface PriorSession {
  THREAD_ID: number;
  FIRST_FILING: string;
  LAST_FILING: string;
  N_FILINGS: number;
  PARTICIPANTS: string; // JSON array stringified by Snowflake
}

/**
 * List prior canvas sessions (threads) that have at least one filing, newest
 * last-filing first. Excludes the current thread when provided.
 */
export async function listPriorSessions(
  canvasId: string,
  excludeThreadId: number | null
): Promise<PriorSession[]> {
  const conn = await ownerConnection();
  try {
    const where = excludeThreadId
      ? "canvas_id = ? AND thread_id IS NOT NULL AND thread_id <> ?"
      : "canvas_id = ? AND thread_id IS NOT NULL";
    const binds: unknown[] = excludeThreadId ? [canvasId, excludeThreadId] : [canvasId];
    return await executeAsync<PriorSession>(
      conn,
      `SELECT thread_id AS "THREAD_ID",
              TO_VARCHAR(MIN(filed_at)) AS "FIRST_FILING",
              TO_VARCHAR(MAX(filed_at)) AS "LAST_FILING",
              COUNT(*) AS "N_FILINGS",
              ARRAY_AGG(DISTINCT filed_by) AS "PARTICIPANTS"
       FROM AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT
       WHERE ${where}
       GROUP BY thread_id
       ORDER BY MAX(filed_at) DESC`,
      binds
    );
  } finally {
    conn.destroy(() => {});
  }
}

export interface FilingRecord {
  ID: string;
  FILED_BY: string;
  SOURCE: "user" | "agent";
  CONTEXT: string;
  FILED_AT: string;
}

/**
 * Fetch all filings for a given thread, oldest first (chronological order).
 */
export async function listFilingsByThread(threadId: number): Promise<FilingRecord[]> {
  const conn = await ownerConnection();
  try {
    return await executeAsync<FilingRecord>(
      conn,
      `SELECT id AS "ID",
              filed_by AS "FILED_BY",
              source AS "SOURCE",
              context AS "CONTEXT",
              TO_VARCHAR(filed_at) AS "FILED_AT"
       FROM AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT
       WHERE thread_id = ?
       ORDER BY filed_at ASC`,
      [threadId]
    );
  } finally {
    conn.destroy(() => {});
  }
}

export interface LatestFiling {
  FILED_AT: string;
  FILED_BY: string;
  SOURCE: "user" | "agent";
  CONTEXT: string;
}

/**
 * Fetch the most recent filing for a canvas, across all threads. Used by
 * the agent-authored /file path to scope summaries to the delta since the
 * last capture.
 */
export async function getLatestFiling(canvasId: string): Promise<LatestFiling | undefined> {
  const conn = await ownerConnection();
  try {
    const rows = await executeAsync<LatestFiling>(
      conn,
      `SELECT TO_VARCHAR(filed_at) AS "FILED_AT",
              filed_by AS "FILED_BY",
              source AS "SOURCE",
              context AS "CONTEXT"
       FROM AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT
       WHERE canvas_id = ?
       ORDER BY filed_at DESC
       LIMIT 1`,
      [canvasId]
    );
    return rows[0];
  } finally {
    conn.destroy(() => {});
  }
}
