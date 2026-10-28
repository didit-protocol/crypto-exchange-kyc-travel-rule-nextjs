/**
 * The demo definition: brand, workflows (ids come from the environment, see
 * `npm run setup`), the rules the demo enforces and its copy. The Demo bar,
 * the Didit live layer and the route handlers read it from here.
 *
 * No `@/` imports: the setup script loads the policy that reads this file
 * straight from Node.
 */

import { defineDemo, workflowId } from "./config.ts";

export const kestrel = defineDemo({
  id: "kestrel",
  route: "/",
  industry: "Crypto exchange",
  brand: { name: "Kestrel", initial: "K", mark: "#14B8A6" },
  vendorPrefix: "kestrel-",
  workflows: {
    onboarding: workflowId("DIDIT_WORKFLOW_ONBOARDING"),
    stepUp: workflowId("DIDIT_WORKFLOW_STEP_UP"),
  },
  rules: {
    walletScreening: "Every deposit screened by the sending wallet",
    travelRule: "Travel Rule withdrawals confirmed with a selfie",
  },
  copy: {
    tagline: "Buy, hold and send crypto",
    story:
      "KYC and AML before the first deposit, deposits screened by wallet, a Travel Rule withdrawal with a selfie, and a sanctioned wallet declined.",
  },
});

export const DEMOS = [kestrel];
