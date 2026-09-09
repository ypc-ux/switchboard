import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  SMS_DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  CRON_SECRET: z.string().min(1).optional(),
});

let cached: z.infer<typeof schema> | null = null;

/**
 * Validated environment. Throws loudly at first use rather than failing
 * silently mid-call, which is the failure mode that costs a client a lead.
 */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`switchboard: invalid or missing env vars: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
