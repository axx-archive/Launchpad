#!/bin/bash
set -e  # Exit on any error

#
# VPS Bootstrap Script — Launchpad Automation
#
# This script automates the setup steps from VPS_SETUP.md.
# It is idempotent (safe to run multiple times).
#
# USAGE:
#   ./setup-vps.sh
#
# OR remotely:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/PitchApp/main/scripts/cron/setup-vps.sh | bash
#
# REQUIREMENTS:
#   - Ubuntu 22.04 or 24.04 LTS
#   - Running as non-root user with sudo access
#   - SSH key authentication already configured
#
# AFTER RUNNING:
#   1. Edit ~/PitchApp/scripts/cron/.env with your credentials
#   2. Run: pm2 restart all
#
# See VPS_SETUP.md for full documentation.
#

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Launchpad Automation VPS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Checking prerequisites..."

# Check we're not running as root
if [ "$EUID" -eq 0 ]; then
  echo "❌ ERROR: Do not run this script as root."
  echo "   Run as a regular user with sudo access."
  echo "   Example: ssh launchpad@your-server"
  exit 1
fi

# Check sudo access
if ! sudo -n true 2>/dev/null; then
  echo "❌ ERROR: Current user does not have passwordless sudo access."
  echo "   Run: sudo visudo"
  echo "   Add line: $USER ALL=(ALL) NOPASSWD:ALL"
  exit 1
fi

# Check OS
if [ ! -f /etc/os-release ]; then
  echo "❌ ERROR: /etc/os-release not found. Is this Ubuntu?"
  exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
  echo "⚠️  WARNING: This script is designed for Ubuntu. Detected: $ID"
  echo "   Continuing anyway, but some commands may fail."
fi

echo "✓ Running as: $USER"
echo "✓ OS: $PRETTY_NAME"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# System Update
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Updating system packages..."
sudo apt update -qq
sudo apt upgrade -y -qq
echo "✓ System packages updated"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Node.js 20+
# ─────────────────────────────────────────────────────────────────────────────

if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    echo "✓ Node.js $(node --version) already installed (>= 20)"
  else
    echo "⚠️  Node.js $(node --version) is installed but < 20. Upgrading..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "✓ Node.js upgraded to $(node --version)"
  fi
else
  echo "→ Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  echo "✓ Node.js $(node --version) installed"
fi

echo "✓ npm $(npm --version)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install PM2
# ─────────────────────────────────────────────────────────────────────────────

if command -v pm2 &> /dev/null; then
  echo "✓ PM2 $(pm2 --version) already installed"
else
  echo "→ Installing PM2..."
  sudo npm install -g pm2
  echo "✓ PM2 $(pm2 --version) installed"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Git
# ─────────────────────────────────────────────────────────────────────────────

if command -v git &> /dev/null; then
  echo "✓ Git $(git --version | cut -d' ' -f3) already installed"
else
  echo "→ Installing Git..."
  sudo apt install -y git
  echo "✓ Git $(git --version | cut -d' ' -f3) installed"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Playwright System Dependencies
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Installing Playwright system dependencies..."
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
  libatspi2.0-0 \
  > /dev/null 2>&1

echo "✓ Playwright system dependencies installed"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Clone Repository
# ─────────────────────────────────────────────────────────────────────────────

REPO_DIR="$HOME/PitchApp"

if [ -d "$REPO_DIR" ]; then
  echo "✓ Repository already cloned at $REPO_DIR"
  echo "  → Pulling latest changes..."
  cd "$REPO_DIR"
  git pull origin main || echo "⚠️  Git pull failed (not critical if repo is up to date)"
else
  echo "→ Cloning repository..."
  echo ""
  echo "⚠️  MANUAL STEP REQUIRED:"
  echo "   This script cannot clone private repositories automatically."
  echo "   Please clone manually using one of these methods:"
  echo ""
  echo "   Method 1: HTTPS (requires GitHub token)"
  echo "     git clone https://github.com/axx-archive/Launchpad.git $REPO_DIR"
  echo ""
  echo "   Method 2: SSH (requires SSH key added to GitHub)"
  echo "     git clone git@github.com:axx-archive/Launchpad.git $REPO_DIR"
  echo ""
  echo "   After cloning, re-run this script to continue setup."
  echo ""
  exit 0
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Node Dependencies
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Installing Node.js dependencies (this may take 5-10 minutes)..."
cd "$REPO_DIR/apps/portal"

if [ -d "node_modules" ]; then
  echo "  ✓ node_modules exists, running npm install to update..."
else
  echo "  → Running npm install for the first time..."
fi

npm install --loglevel=error

echo "✓ Node.js dependencies installed"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Playwright Chromium
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Installing Playwright Chromium..."
cd "$REPO_DIR/apps/portal"
npx playwright install chromium --with-deps > /dev/null 2>&1
echo "✓ Playwright Chromium installed"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Claude Agent SDK
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Installing Claude Agent SDK..."
cd "$REPO_DIR/apps/portal"

# Check if already installed
if npm list @anthropic-ai/claude-agent-sdk > /dev/null 2>&1; then
  echo "✓ Claude Agent SDK already installed"
else
  npm install @anthropic-ai/claude-agent-sdk --loglevel=error
  echo "✓ Claude Agent SDK installed"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Create Environment File Template
# ─────────────────────────────────────────────────────────────────────────────

ENV_FILE="$REPO_DIR/scripts/cron/.env"

if [ -f "$ENV_FILE" ]; then
  echo "✓ Environment file already exists at $ENV_FILE"
  echo "  → Skipping template creation (keeping existing values)"
else
  echo "→ Creating environment file template..."

  cat > "$ENV_FILE" <<'EOF'
# Supabase Credentials
# Get these from: Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Anthropic API Key
# Get this from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# Automation Control
AUTOMATION_ENABLED=true

# Cost Caps (in cents)
BUILD_COST_CAP_CENTS=3000      # $30 per build max
DAILY_COST_CAP_CENTS=20000     # $200 per day max

# Node Environment
NODE_ENV=production
EOF

  chmod 600 "$ENV_FILE"

  echo "✓ Environment file template created at $ENV_FILE"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ⚠️  MANUAL ACTION REQUIRED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  You must edit $ENV_FILE"
  echo "  and add your credentials before automation will work."
  echo ""
  echo "  Required values:"
  echo "    - SUPABASE_URL              (from Supabase Dashboard)"
  echo "    - SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard → API → service_role)"
  echo "    - ANTHROPIC_API_KEY         (from https://console.anthropic.com/settings/keys)"
  echo ""
  echo "  Edit now:"
  echo "    nano $ENV_FILE"
  echo ""
  echo "  After editing, re-run this script to complete PM2 setup."
  echo ""
  exit 0
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Verify Environment Variables
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Verifying environment variables..."

source "$ENV_FILE"

MISSING_VARS=()

if [[ -z "$SUPABASE_URL" || "$SUPABASE_URL" == "https://your-project.supabase.co" ]]; then
  MISSING_VARS+=("SUPABASE_URL")
fi

if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || "$SUPABASE_SERVICE_ROLE_KEY" == "your-service-role-key-here" ]]; then
  MISSING_VARS+=("SUPABASE_SERVICE_ROLE_KEY")
fi

if [[ -z "$ANTHROPIC_API_KEY" || "$ANTHROPIC_API_KEY" == "sk-ant-api03-..." ]]; then
  MISSING_VARS+=("ANTHROPIC_API_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ⚠️  MISSING ENVIRONMENT VARIABLES"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  The following variables are not set in $ENV_FILE:"
  echo ""
  for var in "${MISSING_VARS[@]}"; do
    echo "    - $var"
  done
  echo ""
  echo "  Edit the file:"
  echo "    nano $ENV_FILE"
  echo ""
  echo "  Then re-run this script to complete PM2 setup."
  echo ""
  exit 0
fi

echo "✓ All required environment variables are set"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Update Ecosystem Config (add max_memory_restart)
# ─────────────────────────────────────────────────────────────────────────────

ECOSYSTEM_FILE="$REPO_DIR/scripts/cron/ecosystem.config.cjs"

echo "→ Checking ecosystem config..."

# Check if max_memory_restart is already set for pipeline-executor
if grep -q "max_memory_restart.*500M" "$ECOSYSTEM_FILE"; then
  echo "✓ max_memory_restart already configured for pipeline-executor"
else
  echo "  → Adding max_memory_restart: '500M' to pipeline-executor..."

  # Use sed to add max_memory_restart after autorestart: false in pipeline-executor block
  # This is fragile but works for the current ecosystem.config.cjs structure
  sed -i.bak '/name: "pipeline-executor"/,/autorestart: false/ {
    /autorestart: false/a\
      max_memory_restart: "500M",
  }' "$ECOSYSTEM_FILE"

  echo "✓ max_memory_restart added"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# PM2 Setup
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Setting up PM2..."

# Stop existing processes (if any)
pm2 delete all > /dev/null 2>&1 || true

# Start ecosystem
cd "$REPO_DIR/scripts/cron"
source "$ENV_FILE"
pm2 start ecosystem.config.cjs

echo "✓ PM2 processes started"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# PM2 Startup on Boot
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Configuring PM2 to start on boot..."

# Get the startup command
STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" | grep "sudo env" || true)

if [ -n "$STARTUP_CMD" ]; then
  # Execute the startup command
  eval "$STARTUP_CMD" > /dev/null 2>&1
  pm2 save > /dev/null 2>&1
  echo "✓ PM2 startup configured"
else
  echo "⚠️  Could not generate PM2 startup command"
  echo "   Run manually: pm2 startup"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# PM2 Log Rotation
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Configuring PM2 log rotation..."

# Check if pm2-logrotate is already installed
if pm2 list | grep -q "pm2-logrotate"; then
  echo "✓ pm2-logrotate already installed"
else
  pm2 install pm2-logrotate > /dev/null 2>&1
  echo "✓ pm2-logrotate installed"
fi

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M > /dev/null 2>&1
pm2 set pm2-logrotate:retain 7 > /dev/null 2>&1
pm2 set pm2-logrotate:compress true > /dev/null 2>&1

echo "✓ Log rotation configured (10MB max, 7 days retention)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Final Status
# ─────────────────────────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Current PM2 status:"
echo ""
pm2 status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "  1. View logs:           pm2 logs"
echo "  2. Check specific job:  pm2 logs pipeline-executor"
echo "  3. Monitor in real-time: pm2 monit"
echo "  4. Restart all jobs:    pm2 restart all"
echo "  5. Stop automation:     pm2 stop all"
echo ""
echo "Documentation:"
echo "  - Full setup guide:     $REPO_DIR/scripts/cron/VPS_SETUP.md"
echo "  - Environment file:     $ENV_FILE"
echo "  - Ecosystem config:     $ECOSYSTEM_FILE"
echo ""
echo "To disable automation temporarily:"
echo "  nano $ENV_FILE"
echo "  Set: AUTOMATION_ENABLED=false"
echo "  Then: pm2 restart all"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
