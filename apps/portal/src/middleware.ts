import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedUser } from "@/lib/auth";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/sign-in", "/auth/callback", "/api/auth"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth session — IMPORTANT: use getUser() not getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    // If authenticated and on sign-in, redirect to dashboard — but only if they're allowed
    if (user && pathname === "/sign-in" && isAllowedUser(user.email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Root — let authenticated users through to TriptychHome, redirect others to sign-in
  if (pathname === "/") {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }
    // Authenticated users see the intent-based TriptychHome page
    // (falls through to whitelist check below)
  }

  // Protect all other routes — redirect to sign-in if not authenticated
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Check email whitelist — block unauthorized users
  // Primary check: fast, synchronous env-var lookup (covers most users)
  if (!isAllowedUser(user.email)) {
    // Fallback: check if user has project access via collaboration.
    // This DB query only runs when the env-var check fails — i.e., for
    // invited users whose email isn't in ALLOWED_EMAILS/ALLOWED_DOMAINS.
    // Uses the user's session client (anon key + cookies), not service role.
    const { count: memberCount } = await supabase
      .from("project_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!memberCount || memberCount === 0) {
      // Also check pending invitations — user may have been invited but
      // auto-accept hasn't run yet (e.g., first visit before auth callback)
      const userEmail = user.email?.toLowerCase();
      const { count: invCount } = userEmail
        ? await supabase
            .from("project_invitations")
            .select("id", { count: "exact", head: true })
            .eq("email", userEmail)
            .eq("status", "pending")
        : { count: 0 };

      if (!invCount || invCount === 0) {
        const url = request.nextUrl.clone();
        url.pathname = "/sign-in";
        url.searchParams.set("error", "access_denied");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
