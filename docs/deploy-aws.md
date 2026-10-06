# Deploying on AWS (ECS Fargate + RDS + Terraform)

The scale-out alternative to the default [Vercel + Render + Neon](deployment.md)
deployment: the same Docker image on **ECS Fargate**, with **RDS PostgreSQL**,
secrets in **SSM Parameter Store**, and the whole stack as Terraform. (AWS App
Runner is closed to new customers, so ECS Fargate is the managed-container path.)

> **Two ways to deploy:**
> - **A. Terraform (recommended)** — `infra/terraform/` provisions the whole
>   stack *with* an Application Load Balancer (stable HTTPS endpoint, autoscaling).
>   This is the production-grade path.
> - **B. Manual CLI** — a single Fargate task with a public IP and no load
>   balancer. Faster to stand up and fine for a demo; documented at the bottom.

---

## 1. Architecture

```
Browser ──► Vercel (Next.js 16 frontend + BFF route handlers)
                       │  (server-side only; browser never calls the API directly)
                       ▼
              AWS ECS Fargate  (FastAPI / Uvicorn, container port 8080)
                       │                    │
              AWS RDS PostgreSQL      Upstash Redis (serverless)
```

- The browser only talks to Vercel (same-origin) — **no CORS**. The Next BFF
  (`/api/auth/*`, `/api/backend/[...path]`) calls the backend server-side using
  the server-only `API_BASE_URL`. Access token lives in memory; refresh token is
  an httpOnly first-party cookie (`mw_rt`).
- Backend is stateless → scale horizontally. State is Postgres + Redis.

## 2. Prerequisites

- **Accounts:** AWS, Vercel, Upstash (Redis), a GitHub repo, a domain (for HTTPS
  + email). Optional: Plaid, Groq/Anthropic (AI), Google Cloud (OAuth).
- **Tools:** Docker, AWS CLI, Vercel CLI, Terraform ≥ 1.5 (for path A), Python
  3.12 (to run DB migrations), Node 20+.
- **Repo layout:**
  - `backend/` — FastAPI app, `Dockerfile`, `db/migrations/*.sql`,
    `scripts/migrate.py`, `backend/deploy/task-definition.json`.
  - `frontend/` — Next.js app (deploys to Vercel).
  - `infra/terraform/` — full IaC (network, rds, ecs, alb, autoscaling, iam, observability).

## 3. Configuration (env vars & secrets)

The backend reads everything from env (`backend/app/config.py`). Store secrets in
**AWS SSM Parameter Store** (SecureString) and reference them from the ECS task
definition; put non-secrets as plain task env.

**Secrets (SSM SecureString):**

| Name | What |
|---|---|
| `DATABASE_URL` | App role DSN: `postgresql://app_user:PASS@RDS:5432/financial_advisor?sslmode=require` (non-owner role — RLS enforced) |
| `MIGRATION_DATABASE_URL` | Owner DSN (runs DDL): `postgresql://OWNER:PASS@RDS:5432/...?sslmode=require` |
| `REDIS_URL` | Upstash `rediss://...` URL |
| `JWT_ACCESS_SECRET` | random ≥ 32 chars |
| `JWT_REFRESH_SECRET` | random ≥ 32 chars |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENC_KEY` | Plaid creds + a 32-byte base64 enc key |
| `GROQ_API_KEY` | AI provider key (or Anthropic) |
| `SMTP_PASSWORD` | only if email enabled — see [email-setup.md](email-setup.md) |

**Non-secret task env:**

| Name | Value |
|---|---|
| `ENV` | `production` |
| `PORT` | `8080` |
| `WEB_APP_URL` | the Vercel app URL (used in verification/reset email links) |
| `ALLOWED_HOSTS` | the backend's public host (or `*` only if behind a trusted proxy) |
| `TRUST_ANY_HOST` | `true` **only** if there's no stable hostname (manual path); prefer `false` + a real host behind the ALB |
| `PLAID_ENV` | `sandbox` or `production` |
| `PLAID_PRODUCTS` | `transactions,liabilities,investments` |
| `SYNC_WORKER_ENABLED` | `true` (drains the durable sync_jobs queue) |
| `TOKEN_BUDGET_FREE` | e.g. `2000000` (per-user daily AI token budget; default 10k is very low) |
| `MAIL_TRANSPORT` | `console` (no email) or `smtp` (see [email-setup.md](email-setup.md)) |
| `GOOGLE_CLIENT_ID` | only if "Continue with Google" is enabled (see §7) |

**Vercel env (frontend), Production scope:**

| Name | Value |
|---|---|
| `API_BASE_URL` | **server-only** (no `NEXT_PUBLIC_`). The backend base URL — the ALB HTTPS URL (path A) or `http://<fargate-ip>:8080` (path B) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | only if Google sign-in is enabled (same value as backend `GOOGLE_CLIENT_ID`) |

## 4. Provision data stores

1. **RDS PostgreSQL** (18.x, `db.t4g.micro` for demo / larger for prod), DB name
   `financial_advisor`, `sslmode=require`. Create two roles: an **owner** (DDL /
   migrations) and a non-owner **`app_user`** (the app connects as this — RLS is
   `FORCE`d and the app role is not `BYPASSRLS`). Lock the security group to the
   backend's SG (path A) or to known IPs (path B).
   - The admin console uses SECURITY DEFINER functions; the owner/admin role used
     by those must be able to read cross-tenant. Last time `BYPASSRLS` was granted
     to the migration role — see migrations `009`, `012`.
2. **Upstash Redis** — create a database, copy the `rediss://` URL → `REDIS_URL`.

## 5. Run database migrations

From `backend/` with the owner DSN:

```bash
export MIGRATION_DATABASE_URL="postgresql://OWNER:PASS@RDS:5432/financial_advisor?sslmode=require"
python -m scripts.migrate     # applies db/migrations/*.sql idempotently (tracks applied)
```

Create the first **admin** user afterward (insert into `admins` with a bcrypt
`password_hash` — see `backend/app/modules/admin/` for the hashing helper).

## 6. Deploy — Path A: Terraform (recommended)

`infra/terraform/` provisions VPC/subnets, RDS, ECR, ECS Fargate **behind an
ALB** (stable HTTPS, no IP churn), autoscaling, IAM, and CloudWatch.

```bash
cd infra/terraform
terraform init
terraform plan    # review; set vars (region, image tag, secret ARNs, domain/cert)
terraform apply
```

Then build & push the image and roll the service (see commands in Path B steps
2–3, but the service runs behind the ALB target group — no IP repoint needed).
Point Vercel `API_BASE_URL` at the **ALB HTTPS URL** once.

> The ALB needs the account's ELB limit available + an ACM cert for HTTPS. The
> previous account had ELB creation blocked, which is why Path B (no LB) was used.
> Resolve the limit (support request) to use this path.

## 7. Deploy the frontend (Vercel)

1. Import the repo into Vercel, root directory `frontend/`.
2. Set the Vercel env vars from §3 (Production).
3. Deploy. CI auto-deploy is wired in `.github/workflows/deploy-frontend.yml`
   (token-based; needs repo secret `VERCEL_TOKEN`).

## 8. Optional integrations

- **Email** (verification/reset links): [email-setup.md](email-setup.md) — dedicated Gmail
  stopgap or Amazon SES (recommended). No code change; config only.
- **Continue with Google**: create an OAuth **Web** client in Google Cloud
  Console; authorized JS origin = the Vercel URL. Set `GOOGLE_CLIENT_ID` (backend)
  + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel). The button is hidden until set.
- **Plaid**: sandbox works out of the box; production needs Plaid approval.

## 9. CI/CD (GitHub Actions, already in repo)

- `ci.yml` — backend lint/mypy/pytest + AI-safety eval + frontend lint/test/build (on PR + main).
- `deploy-backend.yml` — build → ECR → ECS. **Deploy job is gated to manual
  dispatch** until repo secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are
  set; to enable push-to-deploy, flip the `if:` in the deploy job to
  `github.ref == 'refs/heads/main'`.
- `deploy-frontend.yml` — Vercel deploy on push to main (needs `VERCEL_TOKEN`).

## 10. Verify

```bash
curl https://<backend>/health/ready           # {"status":"ready","checks":{"db":"ok","redis":"ok"}}
# Sign up → (email on) verify link logs straight into /app; (email off) link is logged server-side.
# Admin: POST /api/v1/admin/auth/login ; Plaid link flow from the dashboard.
```

---

## Appendix — Path B: Manual CLI (no load balancer)

A single Fargate task with a **public IP** and no ALB — useful when the account
can't create load balancers yet. The catch: **the IP changes on every deploy**,
so Vercel `API_BASE_URL` must be repointed each time.

```bash
# Build & push
REG=<acct>.dkr.ecr.<region>.amazonaws.com ; IMAGE=$REG/moneywealth-backend
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin $REG
docker build --platform linux/amd64 --provenance=false -t $IMAGE:latest backend
docker push $IMAGE:latest

# Register task def (start from backend/deploy/task-definition.json: set image,
# environment, and SSM secret ARNs) then roll the service
aws ecs register-task-definition --cli-input-json file://taskdef.json --region <region>
aws ecs update-service --cluster moneywealth --service moneywealth-backend \
  --task-definition moneywealth-backend:<rev> --force-new-deployment --region <region>

# Get the new public IP → update Vercel API_BASE_URL → redeploy frontend
TASK=$(aws ecs list-tasks --cluster moneywealth --service-name moneywealth-backend \
  --desired-status RUNNING --query "taskArns[0]" --output text --region <region>)
ENI=$(aws ecs describe-tasks --cluster moneywealth --tasks $TASK --region <region> \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value|[0]" --output text)
aws ec2 describe-network-interfaces --network-interface-ids $ENI --region <region> \
  --query "NetworkInterfaces[0].Association.PublicIp" --output text
```

Security notes for Path B: the task SG opens 8080 to `0.0.0.0/0` and the backend
runs **http** (no TLS) with `TRUST_ANY_HOST=true`. Acceptable for a short-lived
demo only — **prefer Path A (ALB + HTTPS) for anything real.**

---

## What you need to supply

An AWS account + deploy credentials, a Redis (Upstash or ElastiCache), RDS with
the two roles above, fresh JWT secrets, Plaid + AI keys, a domain + ACM cert
(Path A), and the GitHub repo secrets `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` (and `VERCEL_TOKEN` for frontend auto-deploys).
