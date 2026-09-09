# Onboarding a client

## 0. A2P 10DLC registration — start this first

US SMS to consumer numbers requires brand + campaign registration through
Twilio. It takes **days to weeks** and it can be rejected. Nothing about
missed-call text-back reaches a real phone until it clears.

Start it on day one of the engagement, before any build work, because it is
the long pole and it is entirely outside your control.

While it is pending, `sms_dry_run = true` lets you build, demo and test the
full flow end to end — messages are recorded in the `messages` table exactly
as they would be sent, just never handed to Twilio.

## 1. Buy the number

A local number in the client's area code. This becomes the number they
advertise; their existing line stays where it is and receives forwarded calls.

## 2. Point the webhooks

On the number's configuration in Twilio Console:

| Event | URL | Method |
|---|---|---|
| A call comes in | `https://<your-domain>/api/voice/incoming` | POST |
| A message comes in | `https://<your-domain>/api/sms/incoming` | POST |

The status callback is set by the app itself in TwiML — do not configure it here.

## 3. Seed the client

```bash
npx tsx scripts/seed-client.ts \
  --slug=acme-hvac \
  --name="Acme HVAC" \
  --twilio=+14045550100 \
  --forward=+14045550199 \
  --alert=+14045550188 \
  --booking=https://acme.example.com/book \
  --tz=America/New_York
```

`--live=true` disables dry run. Do not pass it until step 0 has cleared.

## 4. Fill in the business knowledge

Slice 1 only needs `name` and `booking_url`. Populating `business_knowledge`
now (services, hours, prices, faqs, booking rules) means the voice agent works
the day it ships rather than needing a discovery call at that point.

## 5. Set the cron

Vercel Cron on `POST /api/cron/drain`, every 15 minutes, with
`Authorization: Bearer $CRON_SECRET`. Without it, texts deferred by quiet
hours are never sent.

## 6. Test before going live

```bash
npx tsx scripts/simulate.ts --to=+14045550100 --from=+1<your-mobile>
```

Then confirm in the database:

```sql
select to_number, kind, status, dry_run, created_at
from messages order by created_at desc limit 10;
```

Expect exactly one `textback` row per missed call — and still exactly one
after replaying the same webhook.

## 7. Go live

1. A2P 10DLC approved
2. Forward number confirmed correct — a wrong number here sends every call
   into the void
3. Quiet hours match the client's expectations
4. Text-back copy approved by the client, in their voice
5. `--live=true`
6. Place one real call from a real phone and confirm the text arrives

## Go-live checklist for the client conversation

- Their advertised number changes to the Twilio number, or they forward their
  existing number to it
- They will get an SMS alert whenever a caller replies
- STOP works and is honoured permanently
- No texts during quiet hours; held ones send at the next allowed window
