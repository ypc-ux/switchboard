import type { CrmAdapter } from "./index";

/** For clients who run no CRM. Deliberately does nothing. */
export const noopCrm: CrmAdapter = {
  provider: "noop",
  async upsertContact() {
    return {};
  },
  async logActivity() {
    /* intentionally empty */
  },
};
