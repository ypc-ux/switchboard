# Dograh Voice Agent Setup & Verification

Self-hosted voice agent for Switchboard's canary deployment. Saves 65-88% vs. Vapi.

## Quick Start

### 1. Configure Environment Variables

Copy the example config:
```bash
cp .env.dograh.example .env.local
```

Set the required variables:
```env
DOGRAH_ENABLED=true
DOGRAH_SIP_DOMAIN=sip.dograh.local    # Your Dograh SIP server
DOGRAH_SIP_PORT=5060                   # Default SIP port
```

### 2. Verify Connectivity

Check that Dograh is reachable:
```bash
# Test SIP connectivity
curl -I sip://$(echo $DOGRAH_SIP_DOMAIN):$(echo $DOGRAH_SIP_PORT)

# Or use SIP OPTIONS
# echo OPTIONS sip:dograh@$DOGRAH_SIP_DOMAIN:$DOGRAH_SIP_PORT | nc -u $DOGRAH_SIP_DOMAIN $DOGRAH_SIP_PORT
```

### 3. Verify in Code

The routing layer will verify connectivity on first use:
- `getDograhConfig()` reads environment variables
- `buildDograhSipUri()` constructs the SIP URI
- `buildDograhDialTwiml()` generates Twilio TwiML
- Routes return proper XML with SIP Dial instructions

### 4. Start Canary at 0%

Initial state:
- Rollout percentage: 0%
- All calls route to Vapi (control group)
- Metrics collection enabled

When ready to test:
```bash
curl -X POST http://localhost:3000/api/admin/canary/rollout \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"percentage": 10}'
```

## Architecture

```
Incoming Call (Twilio)
    ↓
/api/voice/incoming (ring business)
    ↓
/api/voice/status (miss detected)
    ↓
shouldRouteToDograh(caller) checks feature flag
    ├─ if false (0% or caller not in canary)
    │   └─→ Vapi SIP handoff (existing)
    └─ if true (percentage > 0 and caller in canary)
        ├─ getDograhConfig() reads env vars
        ├─ buildDograhDialTwiml() builds XML
        └─→ Dograh SIP handoff (new)
            ↓
        /api/dograh/webhook (end-of-call report)
            ↓
        recordCallMetric() stores to call_metrics
            ↓
        /api/admin/canary/health validates thresholds
```

## Configuration Details

### DOGRAH_SIP_DOMAIN

**Required.** Hostname or IP of Dograh SIP server.

Examples:
- `sip.dograh.local` — local deployment
- `192.168.1.100` — internal IP
- `dograh.example.com` — public domain
- `sip.dograh.aws.internal` — cloud deployment

The Switchboard server will dial this via Twilio:
```
sip:dograh@<DOGRAH_SIP_DOMAIN>:<DOGRAH_SIP_PORT>?client_id=<client-uuid>
```

### DOGRAH_SIP_PORT

**Optional.** Port for SIP (default: 5060).

- `5060` — standard SIP (UDP)
- `5061` — SIP with TLS (TCP)
- `5062` — custom port if firewalled

### DOGRAH_ENABLED

**Optional.** Enable/disable Dograh (default: false).

When false:
- Routing checks fail gracefully
- All calls fall back to Vapi
- No errors or warnings

When true:
- DOGRAH_SIP_DOMAIN must be set
- Routing logic is active
- Metrics collection tracks Dograh calls

## Verification Checklist

Before starting canary deployment:

- [ ] Dograh instance deployed and running
- [ ] SIP port reachable from Switchboard server
- [ ] DOGRAH_SIP_DOMAIN environment variable set
- [ ] DOGRAH_ENABLED=true in environment
- [ ] TypeScript compiles: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Feature flag percentage at 0% (no traffic yet)
- [ ] Metrics collection initialized
- [ ] Admin API responds: `curl http://localhost:3000/api/admin/canary/status`

## Routing Decision Flow

When a call is missed by the business:

```typescript
if (client.voice_agent_enabled) {
  const routeToDograh = await shouldRouteToDograh(From);
  
  if (routeToDograh) {
    // Check Dograh configuration
    const config = getDograhConfig();
    
    if (!config.enabled || !config.sipDomain) {
      // Fall back to textback
      return await sendTextback(...);
    }
    
    // Build and return SIP dial to Dograh
    const twiml = buildDograhDialTwiml(config, client.id);
    return new Response(twiml, { status: 200, headers: { "content-type": "application/xml" } });
  } else {
    // Route to Vapi (control group)
    const handoffToken = await mintHandoffToken(...);
    const twiml = buildVapiDialTwiml(handoffToken);
    return new Response(twiml, { status: 200, headers: { "content-type": "application/xml" } });
  }
}

// Fallback: no voice agent or handoff failed
return await sendTextback(...);
```

## Monitoring

### Real-Time Status

```bash
# Check rollout percentage and status
curl http://localhost:3000/api/admin/canary/status

# Response:
# {
#   "percentage": 0,
#   "enabled": false,
#   "updated_at": "2026-09-10T12:00:00Z"
# }
```

### Health Checks

```bash
# Get canary health metrics
curl http://localhost:3000/api/admin/canary/health?hours=1

# Response:
# {
#   "healthy": true,
#   "issues": [],
#   "metrics": {
#     "total_calls": 0,
#     "dograh_calls": 0,
#     "vapi_calls": 0,
#     "booking_rate": null,
#     "error_rate": null
#   }
# }
```

### Detailed Metrics

```bash
# Get aggregated metrics
curl "http://localhost:3000/api/admin/canary/metrics?hours=24"

# Get per-client metrics
curl "http://localhost:3000/api/admin/canary/per-client?hours=24"
```

## Canary Rollout Timeline

### Day 1-2: 10% Rollout
- Expect ~10% of callers routed to Dograh
- ~90% to Vapi (control)
- Monitor booking_rate (target: >60%)
- Monitor error_rate (target: <10%)

### Day 3-4: 25% Rollout
- Expect ~25% to Dograh
- Increase if metrics healthy

### Day 5-6: 50% Rollout
- Expect ~50% to Dograh
- 1:1 comparison vs. Vapi

### Day 7: 100% Rollout
- All traffic to Dograh
- Monitor for 48 hours
- Decommission Vapi if stable

## Rollback

If issues occur at any stage:

```bash
# Instantly revert all traffic to Vapi
curl -X POST http://localhost:3000/api/admin/canary/rollout \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"percentage": 0}'
```

## Troubleshooting

### Dograh Not Reachable

**Symptom:** "connection refused" or "no route to host"

**Check:**
1. Dograh instance is running: `ssh dograh-server systemctl status dograh`
2. SIP port open: `nc -zv <DOGRAH_SIP_DOMAIN> <DOGRAH_SIP_PORT>`
3. Firewall rules allow Switchboard → Dograh
4. Network connectivity: `ping <DOGRAH_SIP_DOMAIN>`

### No Metrics Being Recorded

**Symptom:** call_metrics table empty

**Check:**
1. Rollout percentage > 0: `curl http://localhost:3000/api/admin/canary/status`
2. Caller phone hash matches canary range (probabilistic)
3. Dograh webhook accessible: check logs for incoming POST requests
4. Metrics endpoint working: `curl http://localhost:3000/api/admin/canary/metrics`

### Bookings Not Appearing

**Symptom:** Dograh calls complete but no bookings in database

**Check:**
1. Dograh webhook is firing: `tail -f logs/dograh-webhook.log`
2. `booking_made` in payload: check POST body in webhook logs
3. Bookings table RLS: verify service_role can insert
4. `/api/dograh/tools/book-appointment` accessible from Dograh

### High Error Rate

**Symptom:** error_rate > 10%

**Check:**
1. Error column in call_metrics: `select error, count(*) from call_metrics where routed_to='dograh' group by error`
2. Dograh logs: `ssh dograh-server tail -f /var/log/dograh/agent.log`
3. Network latency: measure SIP round-trip time
4. Dograh resource usage: CPU, memory, disk

## Testing

### Unit Tests

```bash
npm test -- src/lib/dograh/__tests__/handoff.test.ts
```

Tests cover:
- Environment variable parsing
- SIP URI generation
- TwiML formatting
- Connectivity verification

### Integration Tests

```bash
npm test -- src/app/api/voice/status/__tests__/dograh-integration.test.ts
```

Tests cover:
- Routing decision flow
- Metric recording
- Fallback behavior
- Error handling

### Manual Testing

1. **Set rollout to 10%:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/canary/rollout \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"percentage": 10}'
   ```

2. **Make test call to Twilio number** (will be missed)

3. **Check metrics:**
   ```bash
   curl http://localhost:3000/api/admin/canary/metrics?hours=1
   ```

4. **Verify call routed correctly:**
   - Dograh logs show incoming SIP call
   - call_metrics table has entry with routed_to='dograh'
   - Either booking created or missed-call SMS sent

5. **Reset to 0%:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/canary/rollout \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"percentage": 0}'
   ```

## References

- [Dograh GitHub](https://github.com/dograh-ai/dograh)
- [Dograh Docs](https://dograh.ai/docs)
- [Switchboard Canary Deployment](./CANARY-DEPLOYMENT.md)
- [SIP Protocol (RFC 3261)](https://tools.ietf.org/html/rfc3261)
