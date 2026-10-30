import { Avatar } from "./ui/Avatar";

export interface Presence {
  user: string;
  self?: boolean;
}

export function PresenceStrip({ users, me }: { users: string[]; me: string }) {
  const unique = Array.from(new Set([me, ...users]));
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {unique.slice(0, 5).map((u) => (
          <div
            key={u}
            className="ring-2 ring-[color:var(--color-surface-raised)] rounded-full"
          >
            <Avatar name={u} size={26} online title={u === me ? `${u} (you)` : u} />
          </div>
        ))}
      </div>
      {unique.length > 5 ? (
        <span className="text-[12px] text-[color:var(--color-text-muted)]">
          +{unique.length - 5} more
        </span>
      ) : null}
      <span className="text-[12.5px] text-[color:var(--color-text-secondary)]">
        {unique.length === 1 ? "You're the only one here" : `${unique.length} in this canvas`}
      </span>
    </div>
  );
}
