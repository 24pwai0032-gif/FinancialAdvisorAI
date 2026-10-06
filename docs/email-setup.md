# Transactional email setup

Verification and password-reset emails are **config-only** — no code changes.
The mailer (`backend/app/modules/auth/mailer.py`) supports three transports:

| `MAIL_TRANSPORT` | Behaviour |
|---|---|
| `console` *(default)* | Logs the link instead of sending it. Good for local dev. |
| `smtp` | Any SMTP provider: Gmail, Amazon SES, Mailgun, Postmark, … |
| `sendgrid` | SendGrid HTTP API (`SENDGRID_API_KEY`). |

Links in emails point at the **frontend** (`WEB_APP_URL`), e.g.
`/verify-email?token=…`. Clicking a verification link verifies the account *and*
signs the user straight into `/app`.

> Bank linking requires a verified email, so turn on a real transport before
> inviting real users.

## Choose a provider

| | **Dedicated Gmail** | **Amazon SES** *(recommended)* | **SendGrid** |
|---|---|---|---|
| Effort | ~5 min | ~30 min + a domain | ~10 min |
| Cost | Free | ~$0.10 / 1,000 emails | Free tier, then paid |
| Limit | ~500/day | Millions (after production access) | Plan-based |
| Deliverability | OK (no brand domain) | Strong (DKIM/SPF on your domain) | Strong |

## Option A — Dedicated Gmail (quick start)

1. Create a **new** Google account for sending (don't reuse a personal one).
2. Turn on 2-Step Verification, then create an **App Password** at
   <https://myaccount.google.com/apppasswords>.
3. Set:
   ```env
   MAIL_TRANSPORT=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_STARTTLS=true
   SMTP_USERNAME=your-sender@gmail.com
   SMTP_PASSWORD=<16-char app password>   # secret
   MAIL_FROM=your-sender@gmail.com
   ```

## Option B — Amazon SES

1. In SES, **verify a domain** (add the DKIM CNAMEs + an SPF record to DNS).
2. **Request production access** — SES starts in sandbox mode and can only send
   to verified addresses.
3. Create **SMTP credentials** (SES → SMTP settings). These are not your AWS keys.
4. Set:
   ```env
   MAIL_TRANSPORT=smtp
   SMTP_HOST=email-smtp.<region>.amazonaws.com
   SMTP_PORT=587
   SMTP_STARTTLS=true
   SMTP_USERNAME=<SES SMTP username>
   SMTP_PASSWORD=<SES SMTP password>      # secret
   MAIL_FROM=no-reply@yourdomain.com      # must be on the verified domain
   ```

## Option C — SendGrid

```env
MAIL_TRANSPORT=sendgrid
SENDGRID_API_KEY=<key>                    # secret
MAIL_FROM=no-reply@yourdomain.com         # a verified sender
```

## Where to set it

- **Render:** service → *Environment* → add the variables (mark passwords/keys
  as secret) → the service redeploys.
- **AWS ECS:** add the plain values to the task definition `environment` and the
  password as an SSM SecureString referenced from `secrets` — see
  [deploy-aws.md](deploy-aws.md).

The backend validates this at startup: `MAIL_TRANSPORT=smtp` without
`SMTP_HOST` (or `sendgrid` without a key) fails fast instead of silently never
sending.

## Verify

1. Sign up with an inbox you control.
2. The backend log should show `email sent` (or `email send failed` with the
   provider's error — usually a wrong password, 2FA off, SES still in sandbox,
   or `MAIL_FROM` not on a verified domain).
3. Click the link — you should land in `/app`, signed in.
