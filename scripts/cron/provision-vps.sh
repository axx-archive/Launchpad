#!/bin/bash
set -e

#
# Provision & Bootstrap Launchpad VPS — DigitalOcean
#
# Automates:
#   1. Upload SSH key to DigitalOcean
#   2. Create a droplet (Ubuntu 24.04, 2GB RAM)
#   3. Wait for droplet to boot
#   4. Security hardening (firewall, fail2ban)
#   5. Create launchpad user
#   6. Copy SSH key to launchpad user
#   7. Clone repo and run setup-vps.sh
#
# PREREQUISITES:
#   - doctl installed and authenticated: doctl auth init
#   - SSH key at ~/.ssh/id_ed25519 (+ .pub)
#   - Git repo credentials ready (GitHub token or deploy key)
#
# USAGE:
#   ./provision-vps.sh
#
# AFTER RUNNING:
#   SSH into the VPS and edit the .env file with your credentials:
#     ssh launchpad@<IP>
#     nano ~/PitchApp/scripts/cron/.env
#     pm2 restart all
#

DROPLET_NAME="launchpad-automation"
REGION="nyc1"              # New York (closest to Supabase/Vercel US)
SIZE="s-1vcpu-2gb"         # $12/month — 1 vCPU, 2GB RAM, 50GB SSD
IMAGE="ubuntu-24-04-x64"   # Ubuntu 24.04 LTS
SSH_KEY_NAME="launchpad-vps"
SSH_KEY_PATH="$HOME/.ssh/id_ed25519"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Launchpad VPS Provisioning — DigitalOcean"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Pre-flight checks..."

if ! command -v doctl &> /dev/null; then
  echo "  ✗ doctl not found. Install: brew install doctl"
  exit 1
fi

# Verify doctl is authenticated
if ! doctl account get &> /dev/null; then
  echo "  ✗ doctl not authenticated."
  echo "    Run: doctl auth init"
  echo "    Paste your DigitalOcean API token when prompted."
  echo "    Get a token: https://cloud.digitalocean.com/account/api/tokens"
  exit 1
fi

if [ ! -f "${SSH_KEY_PATH}.pub" ]; then
  echo "  ✗ SSH public key not found at ${SSH_KEY_PATH}.pub"
  echo "    Generate: ssh-keygen -t ed25519 -C launchpad-vps -f ${SSH_KEY_PATH}"
  exit 1
fi

echo "  ✓ doctl authenticated"
echo "  ✓ SSH key found"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Upload SSH key to DigitalOcean
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Uploading SSH key to DigitalOcean..."

# Check if key already exists
EXISTING_KEY_ID=$(doctl compute ssh-key list --format ID,Name --no-header | grep "$SSH_KEY_NAME" | awk '{print $1}' || true)

if [ -n "$EXISTING_KEY_ID" ]; then
  echo "  ✓ SSH key '$SSH_KEY_NAME' already exists (ID: $EXISTING_KEY_ID)"
  SSH_KEY_ID="$EXISTING_KEY_ID"
else
  SSH_KEY_ID=$(doctl compute ssh-key create "$SSH_KEY_NAME" \
    --public-key "$(cat ${SSH_KEY_PATH}.pub)" \
    --format ID --no-header)
  echo "  ✓ SSH key uploaded (ID: $SSH_KEY_ID)"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Check for existing droplet
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Checking for existing droplet..."

EXISTING_DROPLET=$(doctl compute droplet list --format ID,Name,PublicIPv4 --no-header | grep "$DROPLET_NAME" || true)

if [ -n "$EXISTING_DROPLET" ]; then
  EXISTING_IP=$(echo "$EXISTING_DROPLET" | awk '{print $3}')
  echo "  ⚠  Droplet '$DROPLET_NAME' already exists at $EXISTING_IP"
  echo "     To recreate, delete it first:"
  echo "     doctl compute droplet delete $DROPLET_NAME --force"
  echo ""
  echo "     Or SSH in directly:"
  echo "     ssh launchpad@$EXISTING_IP"
  exit 0
fi

echo "  ✓ No existing droplet — creating new one"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Create Droplet
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Creating droplet: $DROPLET_NAME"
echo "  Region: $REGION"
echo "  Size:   $SIZE (2GB RAM, $12/mo)"
echo "  Image:  $IMAGE"
echo ""

DROPLET_ID=$(doctl compute droplet create "$DROPLET_NAME" \
  --region "$REGION" \
  --size "$SIZE" \
  --image "$IMAGE" \
  --ssh-keys "$SSH_KEY_ID" \
  --wait \
  --format ID --no-header)

echo "  ✓ Droplet created (ID: $DROPLET_ID)"

# Get IP address
DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
echo "  ✓ IP address: $DROPLET_IP"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Wait for SSH to be ready
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Waiting for SSH to be ready..."

MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes -i "$SSH_KEY_PATH" root@"$DROPLET_IP" "echo ok" &> /dev/null; then
    echo "  ✓ SSH is ready"
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "  ... waiting ($ATTEMPT/$MAX_ATTEMPTS)"
  sleep 10
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "  ✗ SSH not ready after ${MAX_ATTEMPTS} attempts."
  echo "    Try manually: ssh -i $SSH_KEY_PATH root@$DROPLET_IP"
  exit 1
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap server
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Bootstrapping server..."

ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" root@"$DROPLET_IP" bash -s <<'BOOTSTRAP'
set -e

echo "  → Updating system..."
apt update -qq && apt upgrade -y -qq

echo "  → Installing fail2ban..."
apt install -y -qq fail2ban > /dev/null 2>&1
systemctl enable fail2ban
systemctl start fail2ban

echo "  → Configuring firewall..."
ufw allow OpenSSH > /dev/null 2>&1
echo "y" | ufw enable > /dev/null 2>&1

echo "  → Creating launchpad user..."
if id "launchpad" &>/dev/null; then
  echo "    ✓ User launchpad already exists"
else
  adduser --disabled-password --gecos "" launchpad
  usermod -aG sudo launchpad
  # Allow passwordless sudo for launchpad user
  echo "launchpad ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/launchpad
  chmod 440 /etc/sudoers.d/launchpad
fi

echo "  → Copying SSH keys to launchpad user..."
mkdir -p /home/launchpad/.ssh
cp /root/.ssh/authorized_keys /home/launchpad/.ssh/authorized_keys
chown -R launchpad:launchpad /home/launchpad/.ssh
chmod 700 /home/launchpad/.ssh
chmod 600 /home/launchpad/.ssh/authorized_keys

echo "  → Disabling root login..."
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PermitRootLogin/PermitRootLogin/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication/PasswordAuthentication/' /etc/ssh/sshd_config
systemctl restart ssh

echo "  ✓ Bootstrap complete"
BOOTSTRAP

echo "  ✓ Server bootstrapped"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Install Node.js + PM2 + deps as launchpad user
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Installing Node.js, PM2, and system dependencies..."

ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" launchpad@"$DROPLET_IP" bash -s <<'INSTALL'
set -e

echo "  → Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
sudo apt install -y nodejs > /dev/null 2>&1
echo "    ✓ Node.js $(node --version)"

echo "  → Installing PM2..."
sudo npm install -g pm2 > /dev/null 2>&1
echo "    ✓ PM2 $(pm2 --version)"

echo "  → Installing Playwright system deps..."
sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2t64 libatspi2.0-0 \
  > /dev/null 2>&1
echo "    ✓ Playwright system deps installed"

echo "  ✓ All dependencies installed"
INSTALL

echo "  ✓ Dependencies installed"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Clone repo (requires manual step for private repos)
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Preparing repository clone..."

# Upload the VPS SSH public key to use with GitHub (deploy key)
# The VPS needs its OWN SSH key for GitHub access
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" launchpad@"$DROPLET_IP" bash -s <<'SSHKEYGEN'
set -e
if [ ! -f ~/.ssh/id_ed25519 ]; then
  echo "  → Generating SSH key for GitHub access..."
  ssh-keygen -t ed25519 -C "launchpad-vps-deploy" -f ~/.ssh/id_ed25519 -N ""
  echo "    ✓ SSH key generated"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VPS Deploy Key (add this to GitHub)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat ~/.ssh/id_ed25519.pub
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SSHKEYGEN

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ VPS Provisioned!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Droplet: $DROPLET_NAME"
echo "  IP:      $DROPLET_IP"
echo "  SSH:     ssh launchpad@$DROPLET_IP"
echo ""
echo "  ─── Remaining Steps ───"
echo ""
echo "  1. Add the deploy key above to GitHub:"
echo "     https://github.com/axx-archive/Launchpad/settings/keys"
echo "     (check 'Allow write access' — needed for git pull)"
echo ""
echo "  2. SSH in and clone the repo:"
echo "     ssh launchpad@$DROPLET_IP"
echo "     git clone git@github.com:axx-archive/Launchpad.git ~/PitchApp"
echo ""
echo "  3. Run the setup script:"
echo "     cd ~/PitchApp/scripts/cron && ./setup-vps.sh"
echo ""
echo "  4. Edit .env with your credentials:"
echo "     nano ~/PitchApp/scripts/cron/.env"
echo "     (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY)"
echo ""
echo "  5. Re-run setup to start PM2:"
echo "     cd ~/PitchApp/scripts/cron && ./setup-vps.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
