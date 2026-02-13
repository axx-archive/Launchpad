# Launchpad Portal

Client-facing portal for Launchpad by bonfire labs. Founders submit PitchApp projects, review narratives, preview live builds, and chat with Scout (AI creative director) to refine their story.

**Live:** [launchpad.bonfire.tools](https://launchpad.bonfire.tools)

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Database:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI:** Anthropic Claude Sonnet 4.5 (Scout chat + autonomous pipeline)
- **Styling:** Tailwind CSS 4
- **Email:** Resend (transactional notifications)
- **Deployment:** Vercel

## Getting Started

```bash
cd apps/portal
npm install
npm run dev    # runs on localhost:3000
```

### Environment Variables

Copy `.env.local` from secure storage (never committed). Required:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, bypasses RLS) |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API token (for migrations) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Scout + pipeline) |
| `SCOUT_MODEL` | Claude model for Scout (default: `claude-sonnet-4-5-20250929`) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |

## Project Structure

```
apps/portal/src/
├── app/
│   ├── sign-in/              # Magic link login
│   ├── auth/callback/        # OAuth code exchange
│   ├── dashboard/            # Project list with search/filter
│   ├── project/[id]/         # Project detail: preview + chat + timeline
│   ├── admin/                # Admin dashboard
│   │   ├── automation/       # Pipeline jobs, cost summary, health
│   │   └── project/[id]/     # Admin project management
│   └── api/
│       ├── scout/            # Scout chat (streaming SSE)
│       ├── projects/         # CRUD + client approval
│       │   └── [id]/
│       │       ├── approve/      # Client PitchApp approval
│       │       ├── narrative/    # Narrative data
│       │       │   └── review/   # Narrative approve/reject
│       │       └── status/       # Status transitions
│       ├── analytics/        # Viewer analytics collection + insights
│       ├── versions/         # PitchApp version history
│       ├── notifications/    # Mark read
│       └── admin/automation/ # Admin pipeline overview
├── components/
│   ├── ScoutChat.tsx         # AI chat with tool use + streaming
│   ├── NarrativePreview.tsx  # Story arc section cards
│   ├── NarrativeApproval.tsx # Approve/notes/escalate actions
│   ├── ApprovalAction.tsx    # PitchApp go-live approval
│   ├── ProgressTimeline.tsx  # Build phase tracker
│   ├── ViewerInsights.tsx    # Analytics dashboard
│   ├── VersionHistory.tsx    # PitchApp version list
│   ├── NotificationBell.tsx  # Realtime notification dropdown
│   ├── ProjectCard.tsx       # Dashboard project card
│   ├── FileUpload.tsx        # Document upload to Supabase Storage
│   ├── TerminalChrome.tsx    # Terminal-style UI wrapper
│   └── Toast.tsx             # Toast notifications
└── lib/
    ├── auth.ts               # Shared admin user ID resolution (cached)
    ├── email.ts              # Resend email templates
    ├── format.ts             # Markdown-to-HTML, relative time, file size
    ├── supabase/
    │   ├── server.ts         # Server-side Supabase client
    │   ├── client.ts         # Browser-side Supabase client
    │   └── admin.ts          # Service role client
    └── scout/
        ├── context.ts        # System prompt builder (status-aware)
        ├── knowledge.ts      # Domain knowledge + talking points
        ├── tools.ts          # Scout tool definitions + handlers
        └── types.ts          # Manifest, section, design token types
```

## Database

9 tables in Supabase with Row Level Security:

| Table | Purpose |
|-------|---------|
| `projects` | PitchApp engagements (status, autonomy_level, pitchapp_url) |
| `project_narratives` | Versioned narrative storage with approval workflow |
| `scout_messages` | Chat history + structured edit briefs |
| `notifications` | User notifications (realtime via Supabase) |
| `pitchapp_manifests` | PitchApp section/design metadata for Scout |
| `pipeline_jobs` | Automation job queue (pending → queued → running → completed) |
| `automation_log` | Audit trail with cost tracking |
| `analytics_events` | Viewer engagement events |
| `pitchapp_versions` | PitchApp deployment version history |

Migrations: `tasks/portal/migrations/001-009`

## Key Flows

### Project Lifecycle

```
requested → narrative_review → in_progress → review → live
                ↓ (reject)         ↑              ↓
             (re-narrative)        └── revision ──┘
```

### Narrative Approval

1. Pipeline generates narrative from uploaded materials (Claude API)
2. Client sees story arc as section cards in the portal
3. Client can: approve (starts build), give notes via Scout, or escalate
4. Scout collects structured revision notes → triggers re-narrative

### Scout Chat

- Streaming SSE responses with tool use (read docs, get sections, submit briefs)
- Status-aware: different personality and prompts per project phase
- Narrative review mode: acts as creative director reviewing the story arc
- PitchApp review mode: proactive section-specific observations

## Deployment

```bash
cd apps/portal
vercel --prod
```

Deployed as a standalone Vercel project. Environment variables set in Vercel dashboard.

## Autonomous Pipeline

The pipeline runs as 4 PM2 cron scripts in `scripts/cron/`. See `scripts/cron/README.md` for full documentation.
