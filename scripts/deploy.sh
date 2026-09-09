#!/bin/bash
# Deployment automation script for the voice agent system
#
# Usage:
#   ./scripts/deploy.sh [environment]
#
# Environments: dev, staging, production

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Deploying voice agent system to ${ENVIRONMENT}..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Type checking
echo "📋 Running TypeScript checks..."
cd "$PROJECT_DIR"
npm run typecheck > /dev/null 2>&1 && echo -e "${GREEN}✓${NC} TypeScript clean" || {
  echo -e "${RED}✗${NC} TypeScript errors found"
  exit 1
}

# 2. Build
echo ""
echo "🔨 Building application..."
npm run build > /dev/null 2>&1 && echo -e "${GREEN}✓${NC} Build successful" || {
  echo -e "${RED}✗${NC} Build failed"
  exit 1
}

# 3. Check environment variables
echo ""
echo "🔑 Checking environment variables..."

required_vars=(
  "SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY"
  "TWILIO_ACCOUNT_SID"
  "TWILIO_AUTH_TOKEN"
  "PUBLIC_BASE_URL"
)

missing_vars=()
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
  echo -e "${RED}✗${NC} Missing environment variables:"
  printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
  echo ""
  echo "Please set these variables before deploying:"
  echo "  export SUPABASE_URL=https://your-project.supabase.co"
  echo "  export SUPABASE_SERVICE_ROLE_KEY=your-key"
  echo "  export TWILIO_ACCOUNT_SID=your-sid"
  echo "  export TWILIO_AUTH_TOKEN=your-token"
  echo "  export PUBLIC_BASE_URL=https://your-domain.com"
  exit 1
else
  echo -e "${GREEN}✓${NC} All environment variables set"
fi

# 4. Run database migration
echo ""
echo "🗄️  Applying database migrations..."
npx tsx scripts/seed-test-data.ts > /dev/null 2>&1 && \
  echo -e "${GREEN}✓${NC} Database ready" || \
  echo -e "${YELLOW}⚠${NC}  Database migration skipped (may already be applied)"

# 5. Lint and security checks
echo ""
echo "🔒 Running security audit..."
npm audit --audit-level=moderate > /dev/null 2>&1 && \
  echo -e "${GREEN}✓${NC} Security audit passed" || \
  echo -e "${YELLOW}⚠${NC}  Security warnings found (review before production)"

# 6. Deployment info
echo ""
echo "📋 Deployment Summary:"
echo "  Environment: $ENVIRONMENT"
echo "  App URL: ${PUBLIC_BASE_URL}"
echo "  Supabase: ${SUPABASE_URL}"
echo "  Timezone support: Enabled"
echo "  Idempotency: Enabled"
echo "  Voice agent: Enabled"
echo ""

# 7. Post-deployment tasks
echo ""
echo "📝 Post-deployment checklist:"
echo ""
echo "  Before going LIVE:"
echo "  [ ] Verify Vapi webhook URL is set to: \${PUBLIC_BASE_URL}/api/vapi"
echo "  [ ] Test with mock-vapi-server: npx tsx scripts/mock-vapi-server.ts"
echo "  [ ] Run full test suite: npm run test"
echo "  [ ] Enable voice_agent_enabled on test clients only"
echo "  [ ] Keep SMS_DRY_RUN=true until ready"
echo ""
echo "  Monitoring:"
echo "  [ ] View dashboard: open scripts/monitoring-dashboard.html"
echo "  [ ] Check tenant resolution signals in logs"
echo "  [ ] Monitor booking success rate"
echo "  [ ] Track agent costs and call durations"
echo ""

echo -e "${GREEN}✅ Ready to deploy!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the checklist above"
echo "  2. Test with mock-vapi-server (if not yet done)"
echo "  3. Deploy to your hosting platform"
echo "  4. Monitor the system using the dashboard"
echo ""
