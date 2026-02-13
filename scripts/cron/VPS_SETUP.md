# VPS Setup Guide — Launchpad Automation

Complete setup guide for running Launchpad automation cron jobs on a dedicated VPS.

## Table of Contents

1. [Server Requirements](#server-requirements)
2. [Initial Server Setup](#initial-server-setup)
3. [Security Hardening](#security-hardening)
4. [Install Dependencies](#install-dependencies)
5. [Deploy Application](#deploy-application)
6. [Configure Environment](#configure-environment)
7. [PM2 Setup](#pm2-setup)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Server Requirements

### Recommended Providers

**DigitalOcean Droplets:**
- **Basic Droplet**: $6/month (1 vCPU, 1GB RAM, 25GB SSD) — minimum
- **Recommended**: $12/month (1 vCPU, 2GB RAM, 50GB SSD) — better headroom for Anthropic SDK

**Hetzner Cloud (EU):**
- **CX22**: €5.83/month (2 vCPU, 4GB RAM, 40GB SSD) — best value
- **CX11**: €4.15/month (1 vCPU, 2GB RAM, 20GB SSD) — absolute minimum

### OS Requirements

- **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS** (recommended)
- x86_64 architecture (required for Playwright Chromium)

### Why a Dedicated VPS?

Launchpad automation needs:
- Always-on environment for cron jobs
- Playwright + Chromium for screenshot capture
- Anthropic SDK for narrative/build tasks (memory-intensive)
- PM2 process manager for reliable cron scheduling
- Independent of development machines

---

## Initial Server Setup

### 1. Create Server

Create a new VPS with your provider of choice. Use SSH key authentication (not password).

After creation, note:
- **IP address**: e.g., `203.0.113.42`
- **Root password**: (emailed by provider)

### 2. Initial SSH Connection

```bash
ssh root@203.0.113.42
```

On first connection, verify the host fingerprint when prompted.

### 3. Update System

```bash
apt update && apt upgrade -y
```

### 4. Create Non-Root User

**NEVER run automation jobs as root.** Create a dedicated user:

```bash
adduser launchpad
# Set a strong password when prompted
# Accept defaults for Full Name, etc. (just press Enter)

# Add to sudo group
usermod -aG sudo launchpad

# Switch to the new user
su - launchpad
```

Verify you're the new user:

```bash
whoami
# Should output: launchpad
```

### 5. Set Up SSH Keys for New User

**On your local machine**, copy your public key to the new user:

```bash
ssh-copy-id launchpad@203.0.113.42
```

Test login without password:

```bash
ssh launchpad@203.0.113.42
```

If this works, you can now disable password authentication (next section).

---

## Security Hardening

### 1. Disable Root Login and Password Authentication

```bash
sudo nano /etc/ssh/sshd_config
```

Find and modify these lines:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Save (Ctrl+O, Enter) and exit (Ctrl+X).

Restart SSH service:

```bash
sudo systemctl restart ssh
```

**Test before closing your current session:** Open a new terminal and verify you can still SSH in with keys.

### 2. Configure Firewall (UFW)

Allow SSH only:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

Confirm with `y` when prompted.

Verify status:

```bash
sudo ufw status
# Should show: Status: active
#              To                         Action      From
#              --                         ------      ----
#              OpenSSH                    ALLOW       Anywhere
```

**Note:** Automation jobs don't need inbound HTTP/HTTPS since they make outbound requests only. SSH is the only port we need open.

### 3. Install fail2ban (Brute Force Protection)

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Check status:

```bash
sudo fail2ban-client status sshd
```

This automatically bans IPs after 5 failed SSH attempts.

---

## Install Dependencies

### 1. Install Node.js 20+ (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node --version    # Should be v20.x or higher
npm --version     # Should be v10.x or higher
```

### 2. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

Verify:

```bash
pm2 --version
```

### 3. Install Git

```bash
sudo apt install git -y
```

Verify:

```bash
git --version
```

### 4. Install Playwright Dependencies

Playwright needs Chromium for screenshot capture. Install system dependencies:

```bash
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libatspi2.0-0
```

---

## Deploy Application

### 1. Clone Repository

```bash
cd ~
git clone https://github.com/axx-archive/Launchpad.git
cd PitchApp
```

### 2. Install Node Dependencies

Navigate to the portal app:

```bash
cd ~/PitchApp/apps/portal
npm install
```

**This may take 5-10 minutes.** It installs all dependencies including Next.js, Supabase client, etc.

### 3. Install Playwright Chromium

Still in `apps/portal`:

```bash
npx playwright install chromium --with-deps
```

This downloads Chromium and any remaining system dependencies.

Verify:

```bash
npx playwright --version
# Should output: Version 1.x.x
```

### 4. Install Anthropic SDK

The pipeline executor uses the Anthropic SDK for narrative extraction and build tasks:

```bash
npm install @anthropic-ai/sdk
```

Verify:

```bash
npm list @anthropic-ai/sdk
# Should show the installed version
```

---

## Configure Environment

### 1. Create Environment File

```bash
cd ~/PitchApp/scripts/cron
nano .env
```

### 2. Set Required Variables

Add the following (replace placeholders with actual values):

```bash
# Supabase Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Anthropic API Key (for Anthropic SDK)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Automation Control
AUTOMATION_ENABLED=true

# Cost Caps (in cents)
BUILD_COST_CAP_CENTS=3000      # $30 per build max
DAILY_COST_CAP_CENTS=20000     # $200 per day max

# Node Environment
NODE_ENV=production
```

**Where to find credentials:**

| Variable | Location |
|----------|----------|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role key (secret) |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys → Create Key |

**Security note:** The service role key bypasses Row Level Security (RLS). Never commit this to git or expose it publicly.

Save (Ctrl+O, Enter) and exit (Ctrl+X).

### 3. Protect Environment File

```bash
chmod 600 .env
```

This makes the file readable only by the `launchpad` user.

### 4. Export Variables for PM2

PM2 needs environment variables available at runtime. Create a loader script:

```bash
nano ~/PitchApp/scripts/cron/load-env.sh
```

Add:

```bash
#!/bin/bash
set -a
source ~/PitchApp/scripts/cron/.env
set +a
exec "$@"
```

Save and make executable:

```bash
chmod +x ~/PitchApp/scripts/cron/load-env.sh
```

---

## PM2 Setup

### 1. Ecosystem Config

The `ecosystem.config.cjs` file defines all cron jobs. It's already configured in the repo with appropriate memory limits — `pipeline-executor` has `max_memory_restart: "500M"` to prevent OOM crashes during Anthropic API builds.

No edits needed unless you want to adjust limits.

### 2. Start PM2 Ecosystem

Load environment variables and start all jobs:

```bash
cd ~/PitchApp/scripts/cron
~/PitchApp/scripts/cron/load-env.sh pm2 start ecosystem.config.cjs
```

Verify all jobs are running:

```bash
pm2 status
```

You should see 4 processes:

| Name | Status | Restart | Uptime |
|------|--------|---------|--------|
| mission-scanner | online | 0 | 0s |
| health-monitor | online | 0 | 0s |
| approval-watcher | online | 0 | 0s |
| pipeline-executor | online | 0 | 0s |

**Note:** `autorestart: false` means processes exit after each run. `cron_restart` triggers them on schedule. Don't be alarmed if some show "stopped" between runs.

### 3. Enable PM2 Startup on Boot

Generate startup script:

```bash
pm2 startup
```

This outputs a command like:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u launchpad --hp /home/launchpad
```

**Copy and run that exact command.** This enables PM2 to restart on server reboot.

Save current PM2 process list:

```bash
pm2 save
```

Verify:

```bash
sudo systemctl status pm2-launchpad
# Should show: active (running)
```

### 4. Configure PM2 Log Rotation

Prevent logs from filling disk:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

This rotates logs when they exceed 10MB and keeps 7 days of history.

---

## Monitoring & Maintenance

### View Logs

**All logs:**

```bash
pm2 logs
```

**Specific job:**

```bash
pm2 logs mission-scanner
pm2 logs pipeline-executor
```

**Last 100 lines:**

```bash
pm2 logs --lines 100
```

**Follow (tail -f style):**

```bash
pm2 logs --lines 0
```

Press Ctrl+C to exit.

### Check Status

```bash
pm2 status
```

### Restart All Jobs

```bash
pm2 restart all
```

### Restart Specific Job

```bash
pm2 restart pipeline-executor
```

### Stop All Jobs

```bash
pm2 stop all
```

### Stop Specific Job

```bash
pm2 stop mission-scanner
```

### Monitor in Real-Time

```bash
pm2 monit
```

Shows CPU, memory, logs in a dashboard. Press Ctrl+C to exit.

### View Job Details

```bash
pm2 show pipeline-executor
```

Shows full configuration, environment variables, memory usage, etc.

### Disk Usage

Check available disk space:

```bash
df -h
```

Check log directory size:

```bash
du -sh ~/.pm2/logs
```

If logs grow too large, verify logrotate is working:

```bash
pm2 conf pm2-logrotate
```

### Update Code

When new code is pushed to the repository:

```bash
cd ~/PitchApp
git pull origin main
cd apps/portal
npm install  # In case dependencies changed
pm2 restart all
```

### Disable Automation (Kill Switch)

If automation is misbehaving, disable it without stopping PM2:

```bash
nano ~/PitchApp/scripts/cron/.env
```

Change:

```bash
AUTOMATION_ENABLED=false
```

Save, then restart:

```bash
pm2 restart all
```

All jobs will exit immediately with `status: "skipped", reason: "automation disabled"`.

To re-enable, set `AUTOMATION_ENABLED=true` and restart.

### Check Supabase Connectivity

Test Supabase connection:

```bash
cd ~/PitchApp/scripts/cron
node -e 'import("./lib/supabase.mjs").then(m => m.dbGet("projects", "select=id&limit=1").then(console.log))'
```

Should output an array of projects (or empty array if no projects exist).

If it fails, verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Check Anthropic API

Test Anthropic API key:

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

Should return JSON with a completion. If it fails, verify `ANTHROPIC_API_KEY` in `.env`.

---

## Troubleshooting

### Jobs Not Running on Schedule

**Check PM2 status:**

```bash
pm2 status
```

If jobs are "stopped" or "errored", check logs:

```bash
pm2 logs
```

**Verify cron_restart is active:**

```bash
pm2 describe mission-scanner | grep cron_restart
```

Should show the cron pattern.

**Restart PM2:**

```bash
pm2 restart all
```

### High Memory Usage

**Check which job is using memory:**

```bash
pm2 monit
```

**Pipeline executor** is the most memory-intensive (runs Anthropic SDK).

If it exceeds 500MB, it will auto-restart (we set `max_memory_restart: "500M"`).

**If server runs out of memory:**
- Upgrade to a larger droplet (2GB+ RAM recommended)
- Reduce `BUILD_COST_CAP_CENTS` to limit concurrent builds

### Playwright Screenshot Failures

**Test Playwright manually:**

```bash
cd ~/PitchApp/apps/portal
npx playwright screenshot --viewport-size="1440,900" https://example.com test.png
```

If it fails with "browser not found":

```bash
npx playwright install chromium --with-deps
```

If it fails with "missing dependencies":

```bash
sudo apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0
```

### Anthropic SDK Errors

**If pipeline-executor fails with Anthropic SDK errors**, check logs:

```bash
pm2 logs pipeline-executor --lines 50
```

Common issues:

| Error | Fix |
|-------|-----|
| "Missing ANTHROPIC_API_KEY" | Verify `.env` and restart PM2 |
| "Anthropic SDK not found" | Run `npm install @anthropic-ai/sdk` in `apps/portal` |
| "Out of memory" | Upgrade server to 2GB+ RAM |
| "Rate limit exceeded" | Wait 60s, check `DAILY_COST_CAP_CENTS` |

### Git Pull Fails

If `git pull` shows conflicts:

```bash
cd ~/PitchApp
git status
```

If there are uncommitted changes (there shouldn't be on production):

```bash
git stash
git pull origin main
git stash pop  # Only if you need local changes
```

**Better:** Production should never have local changes. If it does, something is wrong.

### Disk Full

Check disk usage:

```bash
df -h
```

If `/` is full, check largest directories:

```bash
du -sh ~/PitchApp/* | sort -h
du -sh ~/.pm2/logs
du -sh ~/.cache
```

Clear old logs:

```bash
pm2 flush  # Clear all PM2 logs
```

Or manually:

```bash
rm -rf ~/.pm2/logs/*.log
```

### Jobs Stuck in "stopping"

If `pm2 status` shows jobs stuck in "stopping":

```bash
pm2 kill
pm2 resurrect
```

Or force delete:

```bash
pm2 delete all
pm2 start ecosystem.config.cjs
pm2 save
```

### SSH Connection Lost

If you lose SSH connection and can't reconnect:

1. Check VPS is still running in provider dashboard
2. Reboot VPS from provider dashboard
3. Wait 2-3 minutes for boot
4. Try SSH again

PM2 startup script will auto-restart jobs after reboot.

### Automation Not Picking Up Jobs

**Check database connectivity:**

```bash
cd ~/PitchApp/scripts/cron
node -e 'import("./lib/supabase.mjs").then(m => m.dbGet("pipeline_jobs", "select=id,status&limit=5").then(console.log))'
```

**Check if circuit breaker is open:**

```bash
node -e 'import("./lib/cost-tracker.mjs").then(m => m.checkCircuitBreaker().then(console.log))'
```

If circuit breaker is open, it will block all jobs. Wait for the time window to reset (24 hours for daily cap).

**Check for queued jobs:**

```bash
pm2 logs pipeline-executor --lines 20
```

Should show `status: "skipped", reason: "no-queued-jobs"` if no jobs are queued.

---

## Security Checklist

Before considering setup complete:

- [ ] Root login disabled (`PermitRootLogin no`)
- [ ] Password authentication disabled (`PasswordAuthentication no`)
- [ ] UFW firewall active (`sudo ufw status`)
- [ ] fail2ban installed and running (`sudo systemctl status fail2ban`)
- [ ] `.env` file permissions set to 600 (`ls -la scripts/cron/.env`)
- [ ] Service role key never committed to git (`git log -p | grep SUPABASE_SERVICE_ROLE_KEY` should be empty)
- [ ] PM2 startup enabled (`sudo systemctl status pm2-launchpad`)
- [ ] Log rotation configured (`pm2 conf pm2-logrotate`)

---

## Quick Reference

```bash
# View all logs
pm2 logs

# View specific job
pm2 logs pipeline-executor

# Check status
pm2 status

# Restart all jobs
pm2 restart all

# Restart specific job
pm2 restart mission-scanner

# Monitor in real-time
pm2 monit

# Update code
cd ~/PitchApp && git pull && pm2 restart all

# Disable automation (kill switch)
nano ~/PitchApp/scripts/cron/.env  # Set AUTOMATION_ENABLED=false
pm2 restart all

# Re-enable automation
nano ~/PitchApp/scripts/cron/.env  # Set AUTOMATION_ENABLED=true
pm2 restart all

# Check disk usage
df -h

# Check log size
du -sh ~/.pm2/logs

# Clear logs
pm2 flush

# Test Supabase connection
cd ~/PitchApp/scripts/cron
node -e 'import("./lib/supabase.mjs").then(m => m.dbGet("projects", "select=id&limit=1").then(console.log))'

# Test Playwright
cd ~/PitchApp/apps/portal
npx playwright screenshot --viewport-size="1440,900" https://example.com test.png

# Reboot server (if needed)
sudo reboot
```

---

## Cost Tracking

The automation system includes built-in cost tracking:

| Cap | Default | Override |
|-----|---------|----------|
| Per-build cap | $30 | `BUILD_COST_CAP_CENTS=3000` |
| Daily cap | $200 | `DAILY_COST_CAP_CENTS=20000` |

Costs are tracked in the `automation_log` table and checked before each job.

**View recent costs:**

Query Supabase `automation_log` table with:

```sql
SELECT event, details->>'estimated_cost_cents' as cost_cents, created_at
FROM automation_log
WHERE event LIKE '%cost%'
ORDER BY created_at DESC
LIMIT 20;
```

**Circuit breaker opens when:**
- Daily cap exceeded → blocks all jobs for 24 hours
- Build cap exceeded → skips that specific build

**To override caps:**

Edit `~/PitchApp/scripts/cron/.env`:

```bash
BUILD_COST_CAP_CENTS=5000    # $50 per build
DAILY_COST_CAP_CENTS=50000   # $500 per day
```

Then restart:

```bash
pm2 restart all
```

---

## Bootstrap Script

For automated setup, see `setup-vps.sh` in this directory.

**Usage:**

```bash
curl -fsSL https://raw.githubusercontent.com/axx-archive/Launchpad/main/scripts/cron/setup-vps.sh | bash
```

Or clone first and run locally:

```bash
git clone https://github.com/axx-archive/Launchpad.git
cd PitchApp/scripts/cron
chmod +x setup-vps.sh
./setup-vps.sh
```

The script is **idempotent** — safe to run multiple times.

---

## Support

If you encounter issues not covered here:

1. Check PM2 logs: `pm2 logs`
2. Check `automation_log` table in Supabase for error details
3. Verify all environment variables are set: `pm2 show pipeline-executor | grep env`
4. Test Supabase + Anthropic API connectivity manually (see Troubleshooting)

For persistent issues, file a bug report with:
- Full error message from `pm2 logs`
- Server specs (RAM, disk, OS version)
- Environment variable names (NOT values)
- Recent entries from `automation_log`
