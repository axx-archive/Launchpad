"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";

export default function Nav({
  sectionLabel,
  isAdmin = false,
}: {
  sectionLabel?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/sign-in");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-5 px-[clamp(24px,5vw,64px)] py-4 bg-bg/92 backdrop-blur-xl">
      <Link
        href="/dashboard"
        className="font-mono text-[16px] font-medium tracking-[2px] text-accent"
      >
        launchpad
      </Link>

      <div className="w-20 h-px bg-accent/15" />

      {sectionLabel && (
        <span className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted opacity-70">
          {sectionLabel}
        </span>
      )}

      <div className="ml-auto flex items-center gap-6">
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
