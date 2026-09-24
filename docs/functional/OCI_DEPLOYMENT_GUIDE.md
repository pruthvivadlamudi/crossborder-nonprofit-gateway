# 100% Free Production Deployment & Portfolio Guide

### End-to-End Walkthrough: GitHub Showcase, Free DuckDNS Domain, and Oracle Cloud Always Free Deployment

---

## 1. Why Push to GitHub First? (Best Practice & Portfolio)

Pushing this project to your GitHub account first is **strongly recommended** for two essential reasons:

1. **Portfolio & Proof of Work:**
   * It showcases to interviewers, clients, and technical teams that you engineered a full-stack, enterprise-grade FinTech application with **0 CVE vulnerabilities**, strict **Helmet CSP**, **TypeScript**, dual-screen UX, and **FCRA/RBI regulatory compliance**.
   * It timestamps your contributions and proves your software engineering authorship.
2. **GitOps & Seamless Server Updates:**
   * When your code is hosted on GitHub, deploying on your cloud server is as simple as running:
     ```bash
     git clone https://github.com/your-username/paypal-fcra-gateway.git
     ```
   * Any future updates you make on your local machine can be deployed to production in seconds:
     ```bash
     # Local machine:
     git add . && git commit -m "Enhance UI" && git push
     
     # Remote cloud server:
     git pull && npm run build && pm2 restart paypal-gateway
     ```

---

## 2. Step 0: Pushing to GitHub Safely (Never Leak Secrets!)

Our repository includes a pre-configured `.gitignore` that guarantees sensitive local secrets are never committed to a public repository:
* `.env` (contains API keys, passwords)
* `donations.sqlite*` (live database files)
* `backups/*.sqlite` & `backups/*.jsonl` (local backup snapshots & ledger)
* `logs/*.log` (runtime logs)
* `*.key` & `*.pem` (SSH private keys)
* `docs/institutional-records/` (confidential PAN cards, trust deeds, and scans)

### Step-by-Step GitHub Setup:

1. Go to **[github.com](https://github.com/)** and log in.
2. Click the **+** icon in the top right → **New repository**.
3. **Repository name:** `paypal-fcra-crossborder-engine` (or `crossborder-nonprofit-gateway`).
4. **Description:** *Production-grade cross-border donation and FCRA compliance gateway for non-profits.*
5. **Visibility:** Choose **Public** (to showcase on your portfolio) or **Private**.
6. **Do NOT** check "Add a README" or "Add .gitignore" (we already have comprehensive ones).
7. Click **Create repository**.
8. On your local machine (PowerShell in the project folder):

```powershell
# 1. Initialize Git (if not already initialized)
git init

# 2. Stage all project files (safe: .gitignore filters out secrets)
git add .

# 3. Check staged files to verify .env is NOT included
git status

# 4. Commit your codebase
git commit -m "feat: complete cross-border non-profit gateway with dual screens, structured logging and database redundancy"

# 5. Set default branch to main
git branch -M main

# 6. Add your GitHub remote (replace with your actual GitHub URL)
git remote add origin https://github.com/YOUR_USERNAME/paypal-fcra-crossborder-engine.git

# 7. Push to GitHub
git push -u origin main
```

---

## 3. Step 1: Claim Your 100% Free Domain on DuckDNS

1. Navigate to **[duckdns.org](https://www.duckdns.org/)**.
2. Click **Sign in with GitHub** (or Google).
3. Under **domains**, type your desired subdomain (e.g., `my-charity-donations` or `global-philanthropy`).
4. Click **add domain**.
5. Your domain is instantly created: `yourname.duckdns.org`.
6. Keep this tab open—we will paste your server's IP address here once your Oracle instance is running.

---

## 4. Step 2: Provision Your Free 24/7 Oracle Cloud Server

1. Sign up at **[oracle.com/cloud/free](https://www.oracle.com/cloud/free/)** (Always Free tier).
2. In the OCI Console, go to **Compute > Instances > Create Instance**.
3. **Name:** `paypal-fcra-gateway`
4. **Image & Shape:**
   * Image: **Ubuntu 22.04 LTS**.
   * Shape: **VM.Standard.A1.Flex (Ampere ARM)** → Allocate **2 OCPUs** and **12 GB RAM** *(100% Always Free)*.
   * *Alternative (if ARM is out of stock in your region):* **VM.Standard.E2.1.Micro (AMD)**.
5. **Networking:**
   * Select *Create new virtual cloud network (VCN)*.
   * Ensure *Assign a public IPv4 address* is checked.
6. **SSH Keys:**
   * Select *Generate a key pair for me* and click **Save Private Key** (`oci_key.key`).
7. Click **Create**. Within 60 seconds, the instance will show `RUNNING`.
8. Copy the **Public IP Address** (e.g., `129.146.xxx.xxx`).

---

## 5. Step 3: Link DuckDNS Domain to Your Oracle Public IP

1. Go back to your **DuckDNS** browser tab.
2. In the **current ip** box next to your domain, paste your **Oracle Public IP**.
3. Click **update ip**.
4. Now, `yourname.duckdns.org` points directly to your Oracle server.

---

## 6. Step 4: Open Cloud & Host Firewalls

### A. Oracle Cloud Console (VCN Security List):
1. On your instance page, click your **Virtual Cloud Network (VCN)**.
2. Click **Security Lists** → Click **Default Security List**.
3. Click **Add Ingress Rules** and add:
   * **Rule 1 (HTTP):** Source `0.0.0.0/0`, Protocol `TCP`, Port `80`.
   * **Rule 2 (HTTPS):** Source `0.0.0.0/0`, Protocol `TCP`, Port `443`.

### B. Ubuntu Server Host Firewall (via SSH):
From your computer terminal:
```bash
ssh -i path/to/oci_key.key ubuntu@<YOUR_PUBLIC_IP>
```
Run these commands on the server:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

---

## 7. Step 5: Install Dependencies & Deploy from GitHub

Inside your remote Ubuntu terminal:

```bash
# 1. Update OS and install Node.js 20 LTS & PM2
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
sudo npm install -g pm2

# 2. Clone directly from your GitHub repository
cd ~
git clone https://github.com/YOUR_USERNAME/paypal-fcra-crossborder-engine.git paypal-app
cd paypal-app

# 3. Install production packages & create production .env
npm install
nano .env
```

Paste your production secrets:
```env
PORT=3000
NODE_ENV=production
PAYPAL_MODE=sandbox          # Switch to 'live' when approved
PAYPAL_CLIENT_ID=your_client_id_here
PAYPAL_CLIENT_SECRET=your_client_secret_here
ADMIN_PASSWORD=SetAStrongPassword2026!
JWT_SECRET=super-secure-token-secret-2026-audit
LOG_LEVEL=INFO
```
*(Press `Ctrl + O`, `Enter`, then `Ctrl + X`)*.

```bash
# 4. Build TypeScript to JavaScript
npm run build

# 5. Launch under PM2 process supervisor
pm2 start dist/server.js --name "paypal-gateway"
pm2 startup
# (Copy and run the command printed by PM2)
pm2 save
```

---

## 8. Step 6: Enable Automated HTTPS / SSL with Caddy

Install Caddy to automatically handle Let's Encrypt SSL certificates for your DuckDNS domain:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Configure your DuckDNS domain in Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Replace contents with:
```caddy
yourname.duckdns.org {
    reverse_proxy localhost:3000
}
```
*(Replace `yourname.duckdns.org` with your actual DuckDNS domain)*.

Restart Caddy:
```bash
sudo systemctl restart caddy
```

---

## 9. Step 7: Prevent Oracle Free-Tier Idle Reclamation

Oracle automatically pauses Always Free instances if 7-day average CPU/RAM utilization stays below 20%. To keep your instance running 24/7/365:

```bash
sudo nano /etc/systemd/system/oci-heartbeat.service
```
Paste:
```ini
[Unit]
Description=OCI Always Free Heartbeat
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/bin/bash -c "while true; do dd if=/dev/zero of=/tmp/heartbeat bs=1M count=100 status=none; rm /tmp/heartbeat; sleep 300; done"
Restart=always

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oci-heartbeat.service
```

---

## 10. Step 8: Configure PayPal Webhook

In **[developer.paypal.com](https://developer.paypal.com/dashboard/applications/)**:
* Go to your App → **Add Webhook**.
* URL: `https://yourname.duckdns.org/api/webhooks/paypal`
* Event: `PAYMENT.CAPTURE.COMPLETED`.
* Save.

Your project is now **publicly accessible**, **SSL-encrypted**, **hosted 24/7 for $0.00**, and **backed up by a GitHub repository showcase**!
