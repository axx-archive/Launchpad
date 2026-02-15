"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import RoleBadge from "@/components/RoleBadge";
import type { MemberRole } from "@/types/database";

export default function Nav({
  sectionLabel,
  isAdmin = false,
  userRole,
}: {
  sectionLabel?: string;
  isAdmin?: boolean;
  userRole?: MemberRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // Determine active department from current route
  const activeDept = pathname.startsWith("/intelligence")
    ? "intelligence"
    : pathname.startsWith("/strategy")
    ? "strategy"
    : "creative"; // /dashboard, /project/*, /admin, etc.

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/sign-in");
  }

  const deptLinks = [
    { label: "creative", href: "/dashboard", key: "creative" },
    { label: "strategy", href: "/strategy", key: "strategy" },
    { label: "intelligence", href: "/intelligence", key: "intelligence" },
  ] as const;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-5 px-[clamp(24px,5vw,64px)] py-4 bg-bg/92 backdrop-blur-xl">
      <Link
        href="/dashboard"
        className="font-mono text-[16px] font-medium tracking-[2px] text-accent"
      >
        spark
      </Link>

      <div className="w-20 h-px bg-accent/15" />

      <div className="hidden md:flex items-center gap-4">
        {deptLinks.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={`font-mono text-[11px] tracking-[1px] lowercase transition-colors ${
              activeDept === link.key
                ? "text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {sectionLabel && (
        <span className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted opacity-70 hidden md:inline">
          {sectionLabel}
        </span>
      )}

      <div className="ml-auto flex items-center gap-6">
        <kbd className="hidden md:inline-flex items-center gap-1 font-mono text-[10px] text-text-muted/30 border border-white/[0.06] rounded px-1.5 py-0.5 cursor-default select-none">
          &#8984;K
        </kbd>
        {userRole && userRole !== "owner" && (
          <RoleBadge role={userRole} size="sm" />
        )}
        {isAdmin && (
          <Link
            href="/admin"
            className="font-mono text-[11px] tracking-[1px] lowercase text-text-muted hover:text-text transition-colors"
          >
            admin
          </Link>
        )}
        <NotificationBell />
        <button
          onClick={handleSignOut}
          className="font-mono text-[11px] tracking-[1px] lowercase text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          sign out
        </button>
      </div>
    </nav>
  );
}
