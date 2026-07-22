# Deploying this app

A start-to-finish runbook, written for someone who has never deployed anything.
Follow it top to bottom. Every command is meant to be copy-pasted as-is except
where it says **replace this**.

## What you're building

```
Phone / browser
      |
      v  https://yourapp.com          Vercel — the React app (static files)
      |
      v  https://api.yourapp.com      Oracle VM — the Python API
         Caddy :443   reverse proxy + automatic HTTPS certificate
           |
           v  uvicorn 127.0.0.1:8000  FastAPI, kept alive by systemd
                 |
                 v  Supabase Postgres  (already hosted, unchanged)
```

**Why the extra Caddy piece?** Browsers refuse to let an `https://` page call a
plain `http://` server. So the API needs HTTPS, and HTTPS needs a real hostname
(you can't get a certificate for a bare IP address). Caddy gets and renews that
certificate for free, automatically.

**Cost:** the domain (~$11/year). Everything else is free tier.

---

## Stage 1 — Domain

1. Buy a domain. Cloudflare Registrar sells at cost (~$11/yr for `.com`).
2. You'll create two DNS records. Do the second one in Stage 2, once the server
   exists and you know its IP:

   | Type | Name | Value | Purpose |
   |------|------|-------|---------|
   | (Vercel tells you) | `@` and `www` | (Vercel tells you) | the website |
   | `A` | `api` | your VM's public IP | the backend |

> **If you use Cloudflare:** leave the orange-cloud proxy **OFF** (grey cloud)
> for the `api` record for now. With it on, Caddy's certificate request can fail
> in a way that's hard to diagnose on a first deploy. You can enable it later.

---

## Stage 2 — Create the server (Oracle Cloud Always Free)

1. Sign up at <https://cloud.oracle.com>. It asks for a card to verify identity;
   Always Free resources are not charged.
2. **Compute → Instances → Create instance.**
   - **Image:** Ubuntu 24.04 LTS (ships Python 3.12, matching local development)
   - **Shape:** `VM.Standard.A1.Flex` — ARM, 4 CPUs / 24 GB, Always Free
   - **SSH keys:** upload your public key (see below)

   > **Trap 1 — "Out of host capacity."** ARM instances are often unavailable in
   > a given region. This is normal and not your fault. Either retry later, or
   > pick `VM.Standard.E2.1.Micro` (also Always Free). 1 GB of RAM is plenty for
   > this API.
   >
   > **Escape hatch:** if Oracle fights you for more than an hour, your GitHub
   > Student Pack includes $200 of DigitalOcean credit — a $6/month droplet runs
   > about 2.5 years on that, and every step from Stage 3 on is identical.

   Generate an SSH key first, in Windows PowerShell (press Enter at each prompt):

   ```powershell
   ssh-keygen -t ed25519 -C "finance-app"
   type $env:USERPROFILE\.ssh\id_ed25519.pub   # paste this into Oracle
   ```

3. Note the instance's **public IP**, then create the `api` DNS record from
   Stage 1 pointing at it.

4. Log in (replace the IP):

   ```powershell
   ssh ubuntu@YOUR_SERVER_IP
   ```

### Trap 2 — Oracle blocks ports at TWO separate layers

This is the single most common place people get stuck, because the symptom is
just "the site never loads" with no error anywhere. **Both** layers must be
opened:

**Layer 1 — Oracle's virtual firewall (in the web console):**
Networking → Virtual Cloud Networks → your VCN → Subnet → Security List →
**Add Ingress Rules**. Add two, both with Source CIDR `0.0.0.0/0`:
- Destination port `80` (needed for the certificate check)
- Destination port `443` (HTTPS)

**Layer 2 — the firewall inside the VM.** Oracle's Ubuntu images ship with
iptables rules allowing only SSH. On the server:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Stage 3 — Install the backend

All of this runs **on the server** over SSH.

### 3.1 Install what's needed

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip git curl

# Caddy (the HTTPS reverse proxy)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 3.2 Get the code

If the repo is private, give the server read-only access with a deploy key:

```bash
ssh-keygen -t ed25519 -C "oracle-vm" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy that key into GitHub → your repo → Settings → **Deploy keys** → Add,
leaving "Allow write access" **unchecked**. Then:

```bash
git clone git@github.com:AlfredoBenites/finance-app.git ~/finance-app
cd ~/finance-app/backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

### 3.3 Add the secrets

```bash
sudo nano /etc/finance-app.env
```

Paste this, filling in your real values (no quotes, no spaces around `=`):

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY
FRONTEND_ORIGINS=https://yourapp.com,https://www.yourapp.com
FINNHUB_API_KEY=YOUR_FINNHUB_KEY
ENABLE_DOCS=false
```

Lock it down so only root can read it:

```bash
sudo chmod 600 /etc/finance-app.env
sudo chown root:root /etc/finance-app.env
```

> **Why this matters more now that the app is public:** `SUPABASE_KEY` is the
> service-role key. It bypasses every row-level-security rule in the database,
> so it protects *every user's* data, not just yours. It belongs only in this
> file and in nothing that reaches a browser.

### 3.4 Run it as a service

```bash
sudo cp ~/finance-app/deploy/finance-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now finance-api
sudo systemctl status finance-api     # should say "active (running)"
curl http://127.0.0.1:8000/health     # should print {"status":"ok"}
```

If it isn't running: `sudo journalctl -u finance-api -n 50 --no-pager`

### 3.5 Put HTTPS in front

```bash
sudo cp ~/finance-app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # replace api.example.com with your host
sudo systemctl reload caddy
```

**Checkpoint:** open `https://api.yourapp.com/health` in a browser. You should
see `{"status":"ok"}` and a padlock. If the certificate fails, it's almost
always DNS not yet propagated (wait, then `sudo systemctl reload caddy`) or a
firewall layer from Trap 2.

---

## Stage 4 — Deploy the frontend (Vercel)

1. Sign in at <https://vercel.com> with GitHub and import the repo.
2. **Root Directory: `frontend`** ← easy to miss, and nothing works without it.
   Vite is detected automatically.
3. Add three Environment Variables:

   | Name | Value |
   |------|-------|
   | `VITE_API_BASE_URL` | `https://api.yourapp.com` |
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase **anon** key |

   > **Never put `SUPABASE_KEY` (service role) here.** Anything in a Vercel
   > build ships to the browser and is readable by anyone. Only the anon key is
   > safe there — it's designed to be public, which is why the names differ.

4. Deploy, then add your domain under Settings → Domains.

> `VITE_*` values are baked in when the site is built, so changing one later
> requires a redeploy, not just an edit.

---

## Stage 5 — Supabase settings

Authentication → **URL Configuration**:
- **Site URL:** `https://yourapp.com`
- **Redirect URLs:** add `https://yourapp.com/**`

Without this, confirmation emails send people to `localhost`.

### Email that actually works (required for public signup)

Supabase's built-in email sender is capped at about **2 messages per hour** and
is meant for testing. Left alone, almost nobody who signs up from your video
would receive their confirmation email.

1. Create a free account at <https://resend.com> (3,000 emails/month, no card).
2. Verify your domain there (it gives you DNS records to add).
3. In Supabase → Authentication → **SMTP Settings**, enable custom SMTP and
   paste Resend's host, port, username, and password.
4. Send yourself a test signup to confirm it arrives.

Keep **email confirmation ON**. With working email it blocks junk signups and
makes password resets possible.

---

## Stage 6 — Check it works

1. `https://api.yourapp.com/health` → `{"status":"ok"}`, padlock valid.
2. Load the site and log in as yourself — your real data should appear. (This
   proves CORS, the token round-trip, and the database connection all work.)
3. Go to `/dashboard` and hard-refresh. It must **not** 404 — that proves the
   SPA rewrite.
4. **Open it on your phone.** The thing this was all for.
5. Sign up with a throwaway address; confirm the email arrives.
6. From that new account, confirm you see **none** of your own data.
7. `https://api.yourapp.com/docs` should 404 (docs are off in production).

---

## Shipping changes later

- **Frontend:** just `git push`. Vercel rebuilds automatically.
- **Backend:** SSH in and run:

  ```bash
  ~/finance-app/deploy/deploy.sh
  ```

  It pulls, installs, restarts, and then health-checks — and fails loudly with
  recent logs if the service didn't come back up.

## Useful commands

```bash
sudo systemctl status finance-api        # is it running?
sudo journalctl -u finance-api -f        # live API logs
sudo journalctl -u caddy -f              # live proxy/certificate logs
sudo systemctl restart finance-api       # restart the API
```

## Before the video goes out

These aren't blockers for using the app, but they matter once strangers arrive:

- **Rate limiting** — there is none today, and the API is now public.
- **Token checking cost** — `backend/app/auth.py` asks Supabase to validate the
  token on *every* request. Verifying it locally instead would cut a network
  round-trip off every API call.
- **Backups** — other people's data on a free tier with no point-in-time
  recovery. At minimum, schedule an export.
- **Free-tier ceilings** — 500 MB database, 5 GB egress/month.
- **A short privacy note** — people are entering financial details. Worth
  saying plainly that the app stores no bank credentials (everything is typed
  in by hand), because that's genuinely reassuring and true.
