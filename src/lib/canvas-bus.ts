/**
 * In-process pub/sub, send-locks, and presence for canvases.
 *
 * State is pinned to globalThis so hot-reloads and multiple Next.js route
 * handlers in the same Node process share one instance.
 *
 * The app.yml pins min_instances:1, max_instances:1 so a single in-memory
 * bus is sound at this scale. Scaling to multiple replicas would require
 * moving this to a durable channel (e.g., a stream over a Snowflake table).
 */

export interface CanvasEvent {
  type: string;
  canvasId: string;
  by?: string;
  payload?: unknown;
  at: number;
}

export interface SendLock {
  user: string;
  startedAt: number;
}

type Subscriber = (ev: CanvasEvent) => void;

interface BusState {
  subscribers: Map<string, Set<Subscriber>>;
  sendLocks: Map<string, SendLock>;
  presence: Map<string, Map<string, number>>; // canvasId -> user -> lastSeenMs
  recent: Map<string, CanvasEvent[]>;         // last ~200 events per canvas, for late subscribers
  roomContext: Map<string, RoomLine[]>;       // non-mention chatter waiting to be flushed into the agent prompt
}

export interface RoomLine {
  by: string;
  text: string;
  at: number;
}

const ROOM_CONTEXT_MAX = 20;

const KEY = "__CANVAS_BUS__";
type Global = { [k: string]: BusState | undefined };

function state(): BusState {
  const g = globalThis as unknown as Global;
  if (!g[KEY]) {
    g[KEY] = {
      subscribers: new Map(),
      sendLocks: new Map(),
      presence: new Map(),
      recent: new Map(),
      roomContext: new Map(),
    };
  }
  return g[KEY]!;
}

export function subscribe(canvasId: string, fn: Subscriber): () => void {
  const s = state();
  if (!s.subscribers.has(canvasId)) s.subscribers.set(canvasId, new Set());
  s.subscribers.get(canvasId)!.add(fn);
  return () => {
    s.subscribers.get(canvasId)?.delete(fn);
    if (s.subscribers.get(canvasId)?.size === 0) s.subscribers.delete(canvasId);
  };
}

export function publish(canvasId: string, ev: CanvasEvent): void {
  const s = state();
  // keep recent buffer
  if (!s.recent.has(canvasId)) s.recent.set(canvasId, []);
  const buf = s.recent.get(canvasId)!;
  buf.push(ev);
  if (buf.length > 200) buf.shift();
  // fan out
  const subs = s.subscribers.get(canvasId);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(ev);
    } catch {
      /* ignore bad subscriber */
    }
  }
}

export function recentEvents(canvasId: string): CanvasEvent[] {
  return state().recent.get(canvasId)?.slice() ?? [];
}

// ----- send-lock (first-send-wins) -----

export function acquireSendLock(canvasId: string, user: string): SendLock | null {
  const s = state();
  if (s.sendLocks.has(canvasId)) return null;
  const lock: SendLock = { user, startedAt: Date.now() };
  s.sendLocks.set(canvasId, lock);
  return lock;
}

export function releaseSendLock(canvasId: string): void {
  state().sendLocks.delete(canvasId);
}

export function peekSendLock(canvasId: string): SendLock | undefined {
  return state().sendLocks.get(canvasId);
}

// ----- presence -----

export function markPresent(canvasId: string, user: string): void {
  const s = state();
  if (!s.presence.has(canvasId)) s.presence.set(canvasId, new Map());
  s.presence.get(canvasId)!.set(user, Date.now());
}

export function markAbsent(canvasId: string, user: string): void {
  const s = state();
  s.presence.get(canvasId)?.delete(user);
  if (s.presence.get(canvasId)?.size === 0) s.presence.delete(canvasId);
}

export function presentUsers(canvasId: string): string[] {
  const s = state();
  const now = Date.now();
  const set = s.presence.get(canvasId);
  if (!set) return [];
  // prune stale (>90s)
  for (const [u, t] of set) if (now - t > 90_000) set.delete(u);
  return Array.from(set.keys());
}

// ----- room context (non-mention chatter buffered between @Gil invocations) -----

export function appendRoomLine(canvasId: string, line: RoomLine): void {
  const s = state();
  if (!s.roomContext.has(canvasId)) s.roomContext.set(canvasId, []);
  const buf = s.roomContext.get(canvasId)!;
  buf.push(line);
  while (buf.length > ROOM_CONTEXT_MAX) buf.shift();
}

export function flushRoomContext(canvasId: string): RoomLine[] {
  const s = state();
  const lines = s.roomContext.get(canvasId)?.slice() ?? [];
  s.roomContext.delete(canvasId);
  return lines;
}
