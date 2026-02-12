# Launchpad Portal — Technical Architecture

> Buildable spec for `apps/portal/` — a Next.js portal where bonfire portfolio founders manage PitchApp projects, preview live builds, and chat with Scout (Claude API) to request edits.

---

## 1. Database Schema

All tables live in Supabase (project: `gghsrjcvclcdtytfsitm`). Run as a single migration.

### Migration: `supabase/migrations/001_initial_schema.sql`

```sql
-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profiles extending Supabase auth. Role determines portal access level.';

-- Index for email lookups (admin role check)
create index idx_profiles_email on public.profiles(email);
create index idx_profiles_role on public.profiles(role);

-- ============================================================
-- PROJECTS
-- ============================================================
create type public.project_status as enum (
  'intake',        -- request submitted, not yet started
  'narrative',     -- story extraction phase
  'building',      -- PitchApp under construction
  'review',        -- delivered for founder review
  'revising',      -- edits in progress from Scout brief
  'live'           -- published, no active edits
);

create type public.project_type as enum (
  'investor',      -- investor pitch deck
  'client',        -- client proposal
  'launch',        -- product launch
  'other'
);

create type public.timeline_urgency as enum (
  'asap',          -- this week
  '2weeks',        -- 2 weeks
  'flexible'       -- no rush
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company text not null,
  project_type public.project_type not null default 'investor',
  status public.project_status not null default 'intake',
  timeline public.timeline_urgency default 'flexible',
  audience text,
  materials_link text,
  notes text,
  pitchapp_url text,             -- deployed Vercel URL (null until built)
  contact_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is 'Each row is one PitchApp engagement for a founder.';

create index idx_projects_user_id on public.projects(user_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_created on public.projects(created_at desc);

-- ============================================================
-- MESSAGES (Scout chat + edit briefs)
-- ============================================================
create type public.message_role as enum ('user', 'scout', 'admin', 'system');
create type public.message_type as enum ('chat', 'edit_brief', 'system');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  message_type public.message_type not null default 'chat',
  metadata jsonb default '{}',    -- stores: { model, tokens_used, brief_status }
  created_at timestamptz not null default now()
);

comment on table public.messages is 'Chat history between founder, Scout AI, admin, and system events.';

create index idx_messages_project_id on public.messages(project_id);
create index idx_messages_created on public.messages(project_id, created_at);
create index idx_messages_type on public.messages(message_type) where message_type = 'edit_brief';

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create type public.notification_type as enum (
  'status_change',     -- project moved to new phase
  'new_message',       -- admin sent a message
  'brief_ready',       -- Scout generated an edit brief
  'pitchapp_live',     -- PitchApp URL is now live
  'general'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type public.notification_type not null default 'general',
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications(user_id, read) where read = false;
create index idx_notifications_created on public.notifications(user_id, created_at desc);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.email = current_setting('app.admin_email', true) then 'admin'
      else 'user'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at on profiles
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at();

-- Auto-notify on project status change
create or replace function public.notify_status_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  status_labels jsonb := '{
    "intake": "Request received",
    "narrative": "Crafting your story",
    "building": "Building your PitchApp",
    "review": "Ready for your review",
    "revising": "Revisions in progress",
    "live": "Your PitchApp is live"
  }'::jsonb;
begin
  if old.status is distinct from new.status then
    insert into public.notifications (user_id, project_id, type, title, body)
    values (
      new.user_id,
      new.id,
      'status_change',
      status_labels ->> new.status::text,
      format('%s moved to %s', new.company, new.status::text)
    );
  end if;

  -- Special notification when pitchapp_url is first set
  if old.pitchapp_url is null and new.pitchapp_url is not null then
    insert into public.notifications (user_id, project_id, type, title, body)
    values (
      new.user_id,
      new.id,
      'pitchapp_live',
      'Your PitchApp is live',
      format('Preview %s at %s', new.company, new.pitchapp_url)
    );
  end if;

  return new;
end;
$$;

create trigger on_project_status_change
  after update on public.projects
  for each row execute function public.notify_status_change();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- PROFILES
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- PROJECTS
create policy "Users can view own projects"
  on public.projects for select
  using (user_id = auth.uid());

create policy "Admins can view all projects"
  on public.projects for select
  using (public.is_admin());

create policy "Users can insert own projects"
  on public.projects for insert
  with check (user_id = auth.uid());

create policy "Admins can insert projects for anyone"
  on public.projects for insert
  with check (public.is_admin());

create policy "Admins can update any project"
  on public.projects for update
  using (public.is_admin());

create policy "Users can update own projects (limited)"
  on public.projects for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- MESSAGES
create policy "Users can view messages on own projects"
  on public.messages for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Admins can view all messages"
  on public.messages for select
  using (public.is_admin());

create policy "Users can insert messages on own projects"
  on public.messages for insert
  with check (
    role = 'user' and
    exists (
      select 1 from public.projects
      where projects.id = messages.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Admins can insert any message"
  on public.messages for insert
  with check (public.is_admin());

-- NOTIFICATIONS
create policy "Users can view own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications (mark read)"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins can view all notifications"
  on public.notifications for select
  using (public.is_admin());

-- ============================================================
-- REALTIME
-- ============================================================

-- Enable realtime for tables that need live updates
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.projects;
```

---

## 2. TypeScript Types

### `src/lib/types.ts`

```typescript
// ============================================================
// Database types (mirrors Supabase schema)
// ============================================================

export type UserRole = 'user' | 'admin';
export type ProjectStatus = 'intake' | 'narrative' | 'building' | 'review' | 'revising' | 'live';
export type ProjectType = 'investor' | 'client' | 'launch' | 'other';
export type TimelineUrgency = 'asap' | '2weeks' | 'flexible';
export type MessageRole = 'user' | 'scout' | 'admin' | 'system';
export type MessageType = 'chat' | 'edit_brief' | 'system';
export type NotificationType = 'status_change' | 'new_message' | 'brief_ready' | 'pitchapp_live' | 'general';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  company: string;
  project_type: ProjectType;
  status: ProjectStatus;
  timeline: TimelineUrgency | null;
  audience: string | null;
  materials_link: string | null;
  notes: string | null;
  pitchapp_url: string | null;
  contact_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  role: MessageRole;
  content: string;
  message_type: MessageType;
  metadata: MessageMetadata;
  created_at: string;
}

export interface MessageMetadata {
  model?: string;
  tokens_used?: number;
  brief_status?: 'draft' | 'approved' | 'applied';
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  user_id: string;
  project_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

// ============================================================
// API request/response types
// ============================================================

export interface ScoutRequest {
  project_id: string;
  message: string;
}

export interface ScoutResponse {
  message: Message;
  is_edit_brief: boolean;
}

export interface ProjectCreateRequest {
  company: string;
  project_type: ProjectType;
  timeline?: TimelineUrgency;
  audience?: string;
  materials_link?: string;
  notes?: string;
  contact_name?: string;
}

// ============================================================
// UI types
// ============================================================

export interface ProjectWithMessages extends Project {
  messages: Message[];
  unread_count: number;
}

export type PreviewMode = 'desktop' | 'mobile';

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  intake: 'Request Received',
  narrative: 'Crafting Story',
  building: 'Building',
  review: 'Ready for Review',
  revising: 'Revising',
  live: 'Live',
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  intake: 'text-zinc-400',
  narrative: 'text-amber-400',
  building: 'text-blue-400',
  review: 'text-emerald-400',
  revising: 'text-orange-400',
  live: 'text-green-400',
};
```

---

## 3. File/Folder Structure

```
apps/portal/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout: fonts, providers, dark bg
│   │   ├── page.tsx                      # Redirect: authed → /dashboard, else → /login
│   │   ├── globals.css                   # Tailwind directives + CSS variables
│   │   │
│   │   ├── (auth)/                       # Auth group (no sidebar layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # Magic link login form
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── route.ts          # GET: exchange code for session
│   │   │
│   │   ├── (portal)/                     # Authenticated group (sidebar layout)
│   │   │   ├── layout.tsx                # Sidebar + topbar + notification bell
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx              # Project list + empty state + new project
│   │   │   ├── project/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Project detail: preview + chat + status
│   │   │   │       └── loading.tsx       # Skeleton loader
│   │   │   └── settings/
│   │   │       └── page.tsx              # Profile settings (name, company)
│   │   │
│   │   ├── (admin)/                      # Admin group (admin sidebar layout)
│   │   │   ├── layout.tsx                # Admin layout with admin nav
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx              # All projects overview
│   │   │   │   ├── project/
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx      # Admin project view: set status, URL, msg
│   │   │   │   └── briefs/
│   │   │   │       └── page.tsx          # Pending edit briefs queue
│   │   │
│   │   └── api/
│   │       ├── scout/
│   │       │   └── route.ts              # POST: Scout chat endpoint
│   │       ├── projects/
│   │       │   └── route.ts              # POST: create project
│   │       ├── notifications/
│   │       │   └── read/
│   │       │       └── route.ts          # PATCH: mark notifications read
│   │       └── admin/
│   │           ├── projects/
│   │           │   └── [id]/
│   │           │       └── route.ts      # PATCH: update status, pitchapp_url
│   │           └── messages/
│   │               └── route.ts          # POST: admin sends message to project
│   │
│   ├── components/
│   │   ├── ui/                           # Primitives (bonfire design system)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toast.tsx
│   │   │   └── dialog.tsx
│   │   │
│   │   ├── auth/
│   │   │   └── login-form.tsx            # Magic link form with loading state
│   │   │
│   │   ├── layout/
│   │   │   ├── sidebar.tsx               # Navigation sidebar
│   │   │   ├── topbar.tsx                # Top bar with user menu + notifs
│   │   │   ├── notification-bell.tsx     # Realtime notification indicator
│   │   │   └── user-menu.tsx             # Dropdown: settings, logout
│   │   │
│   │   ├── dashboard/
│   │   │   ├── project-card.tsx          # Project summary card
│   │   │   ├── project-list.tsx          # Grid of project cards
│   │   │   ├── empty-state.tsx           # No projects yet CTA
│   │   │   └── new-project-dialog.tsx    # Create project modal form
│   │   │
│   │   ├── project/
│   │   │   ├── project-header.tsx        # Title, status badge, meta
│   │   │   ├── pitchapp-preview.tsx      # iframe with responsive toggle
│   │   │   ├── scout-chat.tsx            # Chat interface (main component)
│   │   │   ├── chat-message.tsx          # Single message bubble
│   │   │   ├── chat-input.tsx            # Text input + send button
│   │   │   ├── edit-brief-card.tsx       # Rendered .md edit brief with status
│   │   │   └── status-timeline.tsx       # Visual status progression
│   │   │
│   │   └── admin/
│   │       ├── project-table.tsx         # All projects data table
│   │       ├── status-updater.tsx        # Dropdown to change project status
│   │       ├── url-setter.tsx            # Input to set pitchapp_url
│   │       └── brief-queue.tsx           # List of pending edit briefs
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                # Browser client (createBrowserClient)
│   │   │   └── server.ts                # Server client (createServerClient + cookies)
│   │   ├── types.ts                     # All TypeScript types (see §2)
│   │   ├── scout.ts                     # Scout AI: system prompt, message builder
│   │   └── utils.ts                     # Shared helpers (cn, formatDate, etc.)
│   │
│   ├── hooks/
│   │   ├── use-realtime-messages.ts     # Subscribe to new messages on project
│   │   ├── use-realtime-notifications.ts # Subscribe to notification inserts
│   │   └── use-profile.ts              # Current user profile + role
│   │
│   └── middleware.ts                    # Auth middleware (Supabase SSR)
│
├── public/
│   └── favicon.ico
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql       # Full schema (see §1)
│
├── .env.local                           # Local env vars (git-ignored)
├── .env.example                         # Template for env vars
├── next.config.ts                       # Next.js config
├── tailwind.config.ts                   # Tailwind config (bonfire theme)
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Supabase Client Utilities

### `src/lib/supabase/client.ts` (Browser)

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### `src/lib/supabase/server.ts` (Server Components + Route Handlers)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — safe to ignore.
            // Middleware handles token refresh.
          }
        },
      },
    }
  );
}
```

---

## 5. Auth Flow

### Middleware: `src/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
          cookiesToSet.forEach(({ name, value }) =>
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

  // IMPORTANT: use getUser(), not getSession() — getUser() validates with Supabase Auth server
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes that don't require auth
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth');

  // Unauthenticated user trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated user on login page → redirect to dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Admin route protection — check role from profile
  if (user && pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### Auth Callback: `src/app/(auth)/auth/callback/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error message
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

### Login Flow (step by step)

1. User navigates to `/login` → sees email input with bonfire branding
2. User enters email, clicks "Send magic link"
3. Client calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin + '/auth/callback' } })`
4. Supabase sends magic link email
5. User clicks link → hits `/auth/callback?code=...`
6. Callback route exchanges code for session via `exchangeCodeForSession`
7. Session cookie set automatically by `@supabase/ssr`
8. User redirected to `/dashboard`
9. Middleware validates session on every request via `getUser()`

### Admin Role Determination

Admin is determined by matching email against `ADMIN_EMAILS` env var (comma-separated). The trigger `handle_new_user()` checks at signup time. For existing users, set directly in Supabase dashboard:

```sql
update public.profiles set role = 'admin' where email = 'aj@bonfirelabs.co';
```

### Logout

```typescript
// Client component
const supabase = createClient();
await supabase.auth.signOut();
router.push('/login');
```

---

## 6. API Routes

### Route Protection Pattern

Every API route follows the same pattern:

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ... route logic using supabase client (RLS applies automatically)
}
```

### `POST /api/scout` — Scout Chat

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { buildScoutMessages, SCOUT_SYSTEM_PROMPT } from '@/lib/scout';
import Anthropic from '@anthropic-ai/sdk';
import type { ScoutRequest } from '@/lib/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Simple in-memory rate limiter (per user, per minute)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // messages per minute
const RATE_WINDOW = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Too many messages. Try again in a minute.' },
      { status: 429 }
    );
  }

  const body: ScoutRequest = await request.json();
  const { project_id, message } = body;

  if (!project_id || !message?.trim()) {
    return NextResponse.json({ error: 'Missing project_id or message' }, { status: 400 });
  }

  // Verify user owns this project (RLS handles this, but explicit check too)
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Store user message
  await supabase.from('messages').insert({
    project_id,
    role: 'user',
    content: message.trim(),
    message_type: 'chat',
  });

  // Fetch conversation history (last 30 messages for context)
  const { data: history } = await supabase
    .from('messages')
    .select('role, content, message_type, created_at')
    .eq('project_id', project_id)
    .order('created_at', { ascending: true })
    .limit(30);

  // Build messages for Claude
  const claudeMessages = buildScoutMessages(history || [], project);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: SCOUT_SYSTEM_PROMPT,
      messages: claudeMessages,
    });

    const assistantContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Detect if Scout generated an edit brief
    const isEditBrief = assistantContent.includes('## Edit Brief');

    // Store Scout response
    const { data: scoutMessage } = await supabase
      .from('messages')
      .insert({
        project_id,
        role: 'scout',
        content: assistantContent,
        message_type: isEditBrief ? 'edit_brief' : 'chat',
        metadata: {
          model: response.model,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          ...(isEditBrief && { brief_status: 'draft' }),
        },
      })
      .select()
      .single();

    // If edit brief, notify admin
    if (isEditBrief) {
      // Use service role client for cross-user notification
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get admin user IDs
      const { data: admins } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        const notifications = admins.map((admin) => ({
          user_id: admin.id,
          project_id,
          type: 'brief_ready' as const,
          title: 'New edit brief',
          body: `${project.company} — Scout generated an edit brief`,
        }));

        await serviceClient.from('notifications').insert(notifications);
      }
    }

    return NextResponse.json({
      message: scoutMessage,
      is_edit_brief: isEditBrief,
    });
  } catch (error: unknown) {
    const apiError = error as { status?: number; message?: string };

    if (apiError.status === 429) {
      return NextResponse.json(
        { error: 'Scout is thinking too hard. Try again in a moment.' },
        { status: 429 }
      );
    }

    console.error('Scout API error:', error);
    return NextResponse.json(
      { error: 'Scout is temporarily unavailable.' },
      { status: 500 }
    );
  }
}
```

### `POST /api/projects` — Create Project

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { ProjectCreateRequest } from '@/lib/types';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: ProjectCreateRequest = await request.json();

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      company: body.company,
      project_type: body.project_type || 'investor',
      timeline: body.timeline || 'flexible',
      audience: body.audience,
      materials_link: body.materials_link,
      notes: body.notes,
      contact_name: body.contact_name,
      status: 'intake',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // System message marking project creation
  await supabase.from('messages').insert({
    project_id: project.id,
    role: 'system',
    content: `Project created for ${body.company}. Welcome to Launchpad.`,
    message_type: 'system',
  });

  return NextResponse.json({ project }, { status: 201 });
}
```

### `PATCH /api/notifications/read` — Mark Notifications Read

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { notification_ids } = await request.json();

  if (notification_ids?.length) {
    // Mark specific notifications
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', notification_ids)
      .eq('user_id', user.id);
  } else {
    // Mark all unread
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }

  return NextResponse.json({ success: true });
}
```

### `PATCH /api/admin/projects/[id]` — Admin Update Project

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ['status', 'pitchapp_url', 'notes'];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Use service role for admin operations (bypass RLS)
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: project, error } = await serviceClient
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ project });
}
```

---

## 7. Scout Implementation

### System Prompt: `src/lib/scout.ts`

```typescript
import type { Message, Project } from './types';

export const SCOUT_SYSTEM_PROMPT = `You are Scout, the AI assistant for Launchpad by bonfire labs.

## Who you are
You help founders review and refine their PitchApps — scroll-driven, interactive pitch experiences built by the bonfire team. You are knowledgeable, direct, and warm. You speak like a sharp creative director, not a chatbot.

## What you can do
- Answer questions about the founder's PitchApp project (status, timeline, what's happening)
- Help founders articulate what changes they want to their PitchApp
- When a founder has a clear edit request, generate a structured Edit Brief (markdown) that the bonfire team can act on
- Clarify vague requests before generating a brief — ask "which section?" or "can you describe what you'd change?"

## When to generate an Edit Brief
Generate an Edit Brief when the founder has described a SPECIFIC change they want. Do NOT generate a brief for:
- General questions ("how's my project going?")
- Vague feedback ("something feels off")
- Requests that need clarification ("change the colors" — which section? what colors?)

When you need more detail, ask 1-2 focused questions. Don't over-interrogate.

## Edit Brief format
When you generate a brief, use EXACTLY this format:

## Edit Brief

**Project:** [company name]
**Section:** [which section(s) to modify]
**Type:** [copy | design | layout | animation | content | new-section]

### Requested Changes
[Bullet list of specific changes]

### Context
[Why the founder wants this change, in their words]

### Notes for Team
[Any technical considerations or suggestions]

---

## Voice
- Confident but not pushy
- Brief but not curt
- Use the founder's name if you know it
- Never say "I'm just an AI" or "I don't have feelings"
- Never use phrases like "Great question!" or "Absolutely!"
- If you don't know something about their project, say so plainly`;

/**
 * Build Claude API messages from conversation history + project context.
 * Injects project metadata as the first user message for context.
 */
export function buildScoutMessages(
  history: Pick<Message, 'role' | 'content' | 'message_type'>[],
  project: Project
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Inject project context as first user message
  const contextMessage = [
    `[Project context — do not repeat this to the user]`,
    `Company: ${project.company}`,
    `Type: ${project.project_type}`,
    `Status: ${project.status}`,
    `Audience: ${project.audience || 'not specified'}`,
    project.pitchapp_url ? `PitchApp URL: ${project.pitchapp_url}` : 'PitchApp: not yet built',
    project.notes ? `Notes: ${project.notes}` : '',
  ].filter(Boolean).join('\n');

  messages.push({ role: 'user', content: contextMessage });
  messages.push({ role: 'assistant', content: 'Understood. I have the project context.' });

  // Map conversation history to Claude format
  for (const msg of history) {
    if (msg.role === 'system') continue; // skip system messages

    const claudeRole = msg.role === 'user' ? 'user' : 'assistant';
    messages.push({ role: claudeRole, content: msg.content });
  }

  return messages;
}
```

### Key Scout Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Model | `claude-sonnet-4-5-20250929` | Best balance of speed, cost, and quality for chat |
| History depth | Last 30 messages | Keeps context relevant without token bloat |
| Brief detection | String match on `## Edit Brief` | Simple, reliable — Scout is instructed to use exact format |
| Brief storage | `messages` table with `message_type = 'edit_brief'` | No separate table needed; briefs are messages with special type |
| Admin notification | Insert into `notifications` table with service role | Triggers realtime subscription for admin |
| Rate limit | 10 messages/minute/user, in-memory | Sufficient for 5-20 users. Resets on deploy (acceptable) |
| Prompt injection | Project context injected as structured prefix, not user-editable | User messages are passed as-is but Scout's instructions are clear |
| Streaming | Not in v1 — full response returned | Simplifies storage and brief detection. Add streaming in v2 if needed |

---

## 8. Realtime Subscriptions

### `src/hooks/use-realtime-messages.ts`

```typescript
'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

export function useRealtimeMessages(
  projectId: string,
  onNewMessage: (message: Message) => void
) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          onNewMessage(payload.new as Message);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, onNewMessage]);
}
```

### `src/hooks/use-realtime-notifications.ts`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/lib/types';

export function useRealtimeNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    // Initial fetch
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setNotifications(data);
          setUnreadCount(data.filter((n) => !n.read).length);
        }
      });

    // Subscribe to new notifications
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { notifications, unreadCount, setNotifications, setUnreadCount };
}
```

### Realtime Summary

| Table | Event | Subscriber | Purpose |
|-------|-------|------------|---------|
| `messages` | INSERT | Project detail page | New messages appear in chat without refresh |
| `notifications` | INSERT | Notification bell (global) | Bell counter updates in real-time |
| `projects` | UPDATE | Dashboard cards, project detail | Status badge updates live |

---

## 9. PitchApp Preview Integration

### `src/components/project/pitchapp-preview.tsx`

```typescript
'use client';

import { useState } from 'react';
import type { PreviewMode } from '@/lib/types';

interface PitchAppPreviewProps {
  url: string | null;
  company: string;
}

const FRAME_SIZES: Record<PreviewMode, { width: string; height: string }> = {
  desktop: { width: '100%', height: '100%' },
  mobile: { width: '390px', height: '844px' },
};

export function PitchAppPreview({ url, company }: PitchAppPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('desktop');

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900/50 rounded-lg border border-zinc-800">
        <div className="text-center text-zinc-500">
          <p className="text-lg font-medium">Not yet built</p>
          <p className="text-sm mt-1">Your PitchApp preview will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setMode('desktop')}
          className={`px-3 py-1 rounded text-sm ${mode === 'desktop' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
        >
          Desktop
        </button>
        <button
          onClick={() => setMode('mobile')}
          className={`px-3 py-1 rounded text-sm ${mode === 'mobile' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
        >
          Mobile
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm text-zinc-400 hover:text-white"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* iframe container */}
      <div className="flex-1 flex items-start justify-center bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800">
        <iframe
          src={url}
          title={`${company} PitchApp Preview`}
          style={FRAME_SIZES[mode]}
          className={`bg-white ${mode === 'mobile' ? 'rounded-xl border border-zinc-700 mt-4' : ''}`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
        />
      </div>
    </div>
  );
}
```

### iframe Security

| Attribute | Value | Why |
|-----------|-------|-----|
| `sandbox` | `allow-scripts allow-same-origin allow-popups` | PitchApps need JS (GSAP) and same-origin for fonts. No `allow-forms` or `allow-top-navigation`. |
| `loading` | `lazy` | Don't load iframe until visible |
| CSP | Not needed | PitchApps are on different Vercel domains; browser enforces cross-origin isolation by default |

---

## 10. Environment Variables

### `.env.example`

```bash
# Supabase (same project as chaos-labs-site)
NEXT_PUBLIC_SUPABASE_URL=https://gghsrjcvclcdtytfsitm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Supabase service role (server-side only, for admin ops + cross-user notifications)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Anthropic (server-side only, for Scout)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Admin emails (comma-separated, matched during signup)
ADMIN_EMAILS=aj@bonfirelabs.co
```

### Vercel Environment Variable Config

| Variable | Environment | Encrypted |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | All | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | No (public, safe — RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview | Yes |
| `ANTHROPIC_API_KEY` | Production + Preview | Yes |
| `ADMIN_EMAILS` | All | No |

---

## 11. Package Dependencies

### `package.json`

```json
{
  "name": "launchpad-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.95.0",
    "@anthropic-ai/sdk": "^0.39.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.1.0"
  }
}
```

> **Note:** Using Next.js 15 (not 16) since 16 is bleeding edge. The `@supabase/ssr` patterns are identical. Upgrade later if needed.

---

## 12. Tailwind Configuration

### `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bonfire palette
        brand: {
          DEFAULT: '#c8a44e',    // accent gold
          light: '#e2c97e',
          dim: 'rgba(200,164,78,0.15)',
        },
        surface: {
          DEFAULT: '#0a0a0a',    // page bg
          card: '#141414',       // card bg
          raised: '#1e1e1e',     // hover/elevated
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 13. Security Considerations

### RLS (Row Level Security) — Critical

All data access goes through the Supabase client, which enforces RLS. The policies in §1 ensure:

- Users can only SELECT/UPDATE their own profiles
- Users can only see projects where `user_id = auth.uid()`
- Users can only insert messages on their own projects with `role = 'user'` (prevents impersonation)
- Admin sees everything via `is_admin()` function
- Notifications scoped to `user_id`

### API Route Protection

- Every route calls `supabase.auth.getUser()` — validates with Supabase Auth server (not just cookie)
- Admin routes additionally check `profile.role === 'admin'`
- Middleware redirects unauthenticated requests before they hit routes

### Scout Prompt Injection Prevention

- System prompt is hardcoded server-side (not in client)
- Project context is injected as structured data, not user-editable
- User messages are passed as-is to Claude — Claude's system prompt instructs it to stay in character
- Edit brief format is checked by string match (`## Edit Brief`), not executed
- No tool use or function calling — Scout only generates text
- Rate limiting prevents abuse (10 msg/min/user)

### Service Role Key

- `SUPABASE_SERVICE_ROLE_KEY` is ONLY used in server-side route handlers for:
  - Cross-user notifications (admin notified about any user's brief)
  - Admin operations that need to bypass RLS
- Never exposed to client (`NEXT_PUBLIC_` prefix intentionally absent)

### iframe Security

- PitchApps sandboxed with minimal permissions
- No `allow-top-navigation` (prevents redirect attacks)
- No `allow-forms` (PitchApps are read-only previews)
- Cross-origin by default (different Vercel domains)

---

## 14. Deployment

### Vercel Configuration

The portal is a standalone Vercel project within the monorepo:

```bash
cd apps/portal
vercel link          # Create new Vercel project: "launchpad-portal"
vercel env add ...   # Add all env vars
vercel --prod        # Deploy
```

### `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  // No special config needed for v1
  // PitchApp iframes load from external Vercel domains — no rewrites needed
};

export default config;
```

### Coexistence with Other Apps

```
PitchApp/
├── apps/
│   ├── launchpad/        # Static marketing site (existing) — separate Vercel project
│   ├── portal/           # This Next.js app — separate Vercel project
│   ├── bonfire/          # Static PitchApp — separate Vercel project
│   └── onin/             # Static PitchApp — separate Vercel project
```

Each app has its own Vercel project. No shared build system or monorepo tooling needed.

---

## 15. Phased Implementation Plan

### Phase 1: Auth + Shell

**What:** Login page, auth flow, empty dashboard, basic layout.

- Set up Next.js project with Tailwind + Supabase
- Run database migration (full schema — tables, RLS, triggers)
- Implement `src/lib/supabase/client.ts` and `server.ts`
- Implement `src/middleware.ts` (auth protection)
- Build login page with magic link flow
- Build auth callback route
- Build portal layout (sidebar, topbar)
- Build dashboard page (empty state)
- Deploy to Vercel with env vars

**Files:** ~15 files
**Builds on:** Nothing (greenfield)

### Phase 2: Projects + Dashboard

**What:** Create projects, view project list, project detail page with status.

- Build new project dialog/form
- `POST /api/projects` route
- Dashboard project cards (status badge, company, date)
- Project detail page layout (header, status timeline)
- Profile settings page (name, company)

**Files:** ~10 files
**Builds on:** Phase 1

### Phase 3: PitchApp Preview

**What:** iframe preview with responsive toggle, linked to project's pitchapp_url.

- Build `pitchapp-preview.tsx` component
- Desktop/mobile toggle
- Loading state and empty state (no URL yet)
- Integrate into project detail page

**Files:** ~3 files
**Builds on:** Phase 2

### Phase 4: Scout Chat

**What:** Full chat with Claude API. Message history, edit brief detection.

- Implement `src/lib/scout.ts` (system prompt, message builder)
- `POST /api/scout` route with rate limiting
- Build chat UI components (message list, input, bubbles)
- Realtime message subscription
- Edit brief card rendering (markdown → styled card)

**Files:** ~8 files
**Builds on:** Phase 2, 3

### Phase 5: Admin

**What:** Admin dashboard, project management, brief queue.

- Admin layout and route group
- All-projects table with status, company, user, date
- Admin project detail: update status, set pitchapp_url, send messages
- Edit brief queue (pending briefs across all projects)
- `PATCH /api/admin/projects/[id]` route
- `POST /api/admin/messages` route

**Files:** ~8 files
**Builds on:** Phase 2, 4

### Phase 6: Notifications + Polish

**What:** Real-time notification bell, notification dropdown, read/unread state.

- Notification bell component with unread count
- Notification dropdown panel
- Realtime notification subscription
- `PATCH /api/notifications/read` route
- Supabase Realtime for project status changes on dashboard
- Loading skeletons, error boundaries, toast notifications

**Files:** ~6 files
**Builds on:** Everything

---

## Appendix: Key Technical Decisions

| Decision | Choice | Alternatives Considered | Why |
|----------|--------|------------------------|-----|
| Auth | Supabase magic links | Passwords, OAuth | Passwordless is simplest for 5-20 users. No password reset flows needed. |
| AI SDK | `@anthropic-ai/sdk` direct | Vercel AI SDK, LangChain | Direct SDK = least abstraction, full control over prompts and responses. |
| Streaming | Off (v1) | Streaming responses | Simplifies brief detection + storage. Add later if chat feels slow. |
| State management | Server Components + hooks | Redux, Zustand | Minimal client state. Supabase client handles cache. React 19 use() for data. |
| CSS | Tailwind only | CSS Modules, styled-components | Matches reference app. Fast to build. Bonfire design tokens as CSS vars. |
| DB admin pattern | Service role key in API routes | Supabase edge functions, separate admin API | Simplest. 5-20 users doesn't warrant separate infra. |
| Monorepo tooling | None (each app independent) | Turborepo, Nx | Overkill. Each app is a separate Vercel project with no shared code. |
