import type { MemberRole } from "@/types/database";

const ROLE_STYLES: Record<MemberRole, string> = {
  owner: "text-accent bg-accent/8 border-accent/15",
  editor: "text-text-muted bg-white/[0.04] border-white/8",
  viewer: "text-text-muted/60 bg-transparent border-white/[0.06]",
};

const SIZE_STYLES = {
  sm: "text-[9px] tracking-[1.5px] px-1.5 py-0.5",
  md: "text-[10px] tracking-[1px] px-2 py-0.5",
};

export default function RoleBadge({
  role,
  size = "sm",
}: {
  role: MemberRole;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`font-mono lowercase rounded-[2px] border ${ROLE_STYLES[role]} ${SIZE_STYLES[size]}`}
      aria-label={`Role: ${role}`}
    >
      {role}
    </span>
  );
}
