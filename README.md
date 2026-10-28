# Crypto exchange KYC, wallet screening and Travel Rule compliance with Didit (Next.js)

**Kestrel is an open-source Next.js reference app for a crypto exchange that uses Didit for passkey sign-up, know your customer (KYC) and anti-money laundering (AML) checks before the first deposit, wallet screening on every deposit and withdrawal, Travel Rule withdrawals confirmed with a selfie, and sanctioned wallets declined.**
It is for engineers and compliance teams at exchanges, wallets and crypto asset service providers who want to see KYC, wallet screening and the Travel Rule working together in a trading flow.
Every Didit call is real code you can read, run against your own Didit application and copy into your product.
The exchange is fictional, the integration is not.

![Kestrel, a dark crypto trading screen with markets, candles, an order book and the Didit live feed showing each event](docs/images/kestrel-crypto-exchange-app-home.webp)

Topics: `crypto-exchange`, `cryptocurrency`, `kyc`, `aml`, `travel-rule`, `wallet-screening`, `kyt`, `mica`, `identity-verification`, `transaction-monitoring`, `nextjs`, `typescript`, `didit`, `reference-implementation`.

## What it shows

The app walks through five steps.
Each step names the Didit product and the call that does the work.

### 1. Sign up with a passkey (Didit Authentication)

A trader creates an account in the exchange's own page.
Passkey comes first, with Google, Apple and an email code as fallbacks.
The app wraps the page in `<DiditAuth>` from `@didit-protocol/auth-nextjs` and lets `diditAuthProxy` serve the sign-up, callback and session routes.

![The Kestrel sign-up with Create a passkey, Google, Apple and email code options](docs/images/kestrel-crypto-exchange-passkey-sign-up.webp)

From `middleware.ts` (lines 11-26):

```ts
const proxy = publishableKey()
  ? diditAuthProxy(
      { afterSignOutUrl: "/" },
      {
        DIDIT_PUBLISHABLE_KEY: publishableKey() ?? undefined,
        DIDIT_REDIRECT_URI:
          process.env.DIDIT_REDIRECT_URI?.trim() ||
          `${diditUrls.site}/auth/callback`,
        DIDIT_SESSION_CACHE_SECONDS: process.env.DIDIT_SESSION_CACHE_SECONDS,
      },
    )
  : null;

export default function middleware(request: NextRequest) {
  return proxy ? proxy(request) : NextResponse.next();
}
```

Without a publishable key the app falls back to its own form and a signed account cookie.

### 2. KYC and AML before the first deposit (Didit verification)

The server creates a Didit session for the trader with the onboarding workflow: ID check, liveness, face match, AML screening and IP analysis.
The browser opens the returned URL in the web SDK modal.
Deposits and withdrawals unlock only after Didit approves the account, because the server mints the transaction token only for an approved trader.

![The Didit web SDK modal open on top of Kestrel for the KYC and AML check](docs/images/kestrel-crypto-exchange-verification-modal.webp)

From `app/api/crypto-exchange/account/route.ts` (lines 59-70):

```ts
const result = await didit.sessions.create({
  workflowId: CX_WORKFLOWS.onboarding,
  vendorData,
  callback: CALLBACK,
});
const sessionId = result.data?.session_id;
const url = result.data?.url;

if (!result.ok || typeof sessionId !== "string" || typeof url !== "string") {
  return diditFailure(
    result,
    "The verification session could not be created.",
```

From `lib/didit/browser.ts` (lines 49-58):

```ts
    void sdk.shared.startVerification({
      url,
      configuration: {
        showCloseButton: true,
        showExitConfirmation: true,
        closeModalOnComplete: true,
      },
    });
  });
}
```

### 3. Screen every wallet and confirm Travel Rule withdrawals (Didit Transaction Monitoring)

Each deposit and withdrawal is submitted from the browser with `submitTransaction` and asks Didit to screen the other side's wallet.
Withdrawals are Travel Rule transfers.
A rule holds every low-risk withdrawal with `AWAITING_USER` and a selfie workflow matched to the onboarding face, and the trader releases it in the web SDK.

![A Travel Rule withdrawal held for a selfie step-up with wallet screening results in the Didit live feed](docs/images/kestrel-crypto-exchange-held-transaction.webp)

From `lib/crypto-exchange/transactions.ts` (lines 215-266):

```ts
export function buildWithdrawalPayload(input: {
  txnId: string;
  fullName: string;
  asset: Asset;
  amount: string;
  destination: WithdrawalDestination;
  address: string;
  beneficiaryName: string;
}): DiditTransactionPayload {
  const beneficiary = input.beneficiaryName.trim() || input.fullName;
  const address = input.address.trim();

  return {
    txnId: input.txnId,
    category: "travelRule",
    details: {
      direction: "out",
      amount: input.amount,
      currency: input.asset,
      currencyType: "crypto",
      actionType: "withdrawal",
      cryptoParams: { crypto_chain: ASSETS[input.asset].chain },
    },
    subject: { type: "individual", fullName: input.fullName },
    counterparty: {
      type: "individual",
      fullName: beneficiary,
      paymentMethod: {
        type:
          input.destination === "own-wallet"
            ? "unhosted_wallet"
            : "crypto_wallet",
        accountId: address,
      },
    },
    customProperties: {
      demo_app: CX_DEMO_APP,
      withdrawal_destination: input.destination,
    },
    travelRule: {
      // Ignored once Travel Rule is enabled: Didit drives the exchange itself.
      status: "AWAITING_COUNTERPARTY",
      originatorData: { name: input.fullName },
      beneficiaryData: { name: beneficiary, wallet_address: address },
    },
    includeCryptoScreening: true,
  };
}

/* ── The trimmed view the demo's own API routes return ─────────────────── */

export interface ScreeningView {
```

From `lib/crypto-exchange/policy.ts` (lines 100-127):

```ts
    {
      title:
        "Withdrawal step-up: selfie re-authentication (crypto exchange demo)",
      description:
        "Every low-risk Kestrel withdrawal waits for the user to pass a selfie check matched against their onboarding face before it can be broadcast.",
      category: "fraud_prevention",
      mode: "ACTIVE",
      evaluation_mode: "ALL",
      scope: { directions: ["OUTBOUND"] },
      conditions: [
        DEMO_SCOPE,
        { field: "custom_values.wallet_risk_score", operator: "lt", value: 75 },
        {
          field: "custom_values.wallet_sanctioned",
          operator: "ne",
          value: true,
        },
      ],
      actions: [
        {
          type: "change_status",
          value: "AWAITING_USER",
          workflow_id: stepUpWorkflowId,
        },
      ],
    },
  ];
}
```

### 4. Decline a sanctioned wallet (Didit rules)

A withdrawal to a wallet attributed to a sanctioned entity is declined by a rule and never reaches the step-up.
High-risk exposure is held for review.

![Kestrel declining a withdrawal to a sanctioned wallet, with the Didit live feed showing the declined transaction](docs/images/kestrel-crypto-exchange-fraud-blocked.webp)

From `lib/crypto-exchange/policy.ts` (lines 79-100):

```ts
{
  title: "Wallet risk: sanctioned wallet (crypto exchange demo)",
  description:
    "Declines a Kestrel transfer when the other side's wallet is itself attributed to a sanctioned entity. Demo-scoped copy of the library's sanctions counterparty rule.",
  category: "crypto_monitoring",
  mode: "ACTIVE",
  evaluation_mode: "ALL",
  scope: {},
  conditions: [
    DEMO_SCOPE,
    {
      field: "custom_values.wallet_sanctioned",
      operator: "eq",
      value: true,
    },
  ],
  actions: [
    { type: "add_score", value: 90 },
    { type: "change_status", value: "DECLINED" },
  ],
},
{
```

### 5. See it in the console

The console view modal shows what each trader, transaction and wallet screening looks like in the Didit Console, filled with the visitor's own data.
It is a preview drawn by the app, not an embedded console.

![The console view modal showing the trader, a screened deposit and the Travel Rule transfer](docs/images/kestrel-crypto-exchange-console-view.webp)

The app also works on a phone.

![Kestrel on a phone with the markets list and the Didit live pill](docs/images/kestrel-crypto-exchange-phone.webp)

## How it works

```mermaid
sequenceDiagram
    participant T as Trader browser
    participant A as Kestrel (Next.js)
    participant D as Didit
    T->>D: Passkey sign-up (Authentication)
    T->>D: Device fingerprint (signals)
    T->>A: Create account
    A->>D: POST /v3/session/ with the onboarding workflow
    A-->>T: Session URL
    T->>D: startVerification (KYC and AML)
    A->>D: GET /v3/session/{id}/decision/
    T->>A: Deposit or withdraw
    A->>D: POST /v3/transactions/sdk-token/
    A-->>T: Transaction token
    T->>D: submitTransaction with wallet screening
    D-->>T: AWAITING_USER and action_required (selfie)
    T->>D: startVerification for the step-up
    D-->>T: Declined for a sanctioned wallet
```

## Features and where they live

| Capability | Didit product | Where in the code |
| --- | --- | --- |
| Passkey, Google, Apple and email-code sign-up | Authentication | `middleware.ts`, `app/layout.tsx`, `lib/didit/provider.tsx` |
| Device fingerprint and bot score | Signals SDK | `lib/didit/browser.ts`, `lib/didit/provider.tsx` |
| KYC and AML onboarding | Verification and AML screening | `app/api/crypto-exchange/account/route.ts`, `scripts/lib/workflows.mjs` |
| Transactions unlock after approval | Verification decision | `app/api/crypto-exchange/token/route.ts` |
| Wallet screening on deposits and withdrawals | Transaction Monitoring, Wallet Screening | `lib/crypto-exchange/transactions.ts` |
| Travel Rule withdrawals | Travel Rule | `lib/crypto-exchange/policy.ts`, `lib/crypto-exchange/transactions.ts` |
| Selfie step-up on withdrawals | Rules and biometric re-check | `lib/crypto-exchange/policy.ts` |
| Sanctioned wallet declined | Rules | `lib/crypto-exchange/policy.ts` |
| Live narration of every event | Demo layer | `demo-layer/` |

## Quick start

You need Node.js 22.18 or later and npm.
The first four steps take about ten minutes.

1. Install the dependencies.

   ```bash
   cd crypto-exchange-kyc-travel-rule-nextjs
   npm install
   ```

2. Create a free Didit account in the [Didit Console](https://business.didit.me).
   Open your application and copy its API key.
   A key that starts with `sk_test_` belongs to a sandbox application, a key that starts with `sk_live_` to a live one.
   See [sandbox and test data](https://docs.didit.me/integration/sandbox-testing) for what the sandbox does and does not run.
3. Copy the environment file and paste the key.

   ```bash
   cp .env.example .env
   # then set API_KEY=... in .env
   ```

4. Create the 2 workflows and the rules this app needs on your Didit application.
   The script finds what already exists by name, creates only what is missing, and writes the workflow ids to `.env`.

   ```bash
   npm run setup
   ```

   Add `-- --dry-run` to print what it would change without changing anything.
5. Start the app and open [http://localhost:3000](http://localhost:3000).

   ```bash
   npm run dev
   ```

Two things to know before you test the transaction steps.

- Verification sessions on a sandbox application are never billed and use test data.
  Transaction Monitoring does not evaluate rules for a sandbox application, so the held transactions and the step-ups that follow them only appear on a live application, at the [list prices](https://docs.didit.me/getting-started/pricing).
- Didit Authentication is turned on per application by Didit.
  When you have a publishable key, set `DIDIT_PUBLISHABLE_KEY` and register `http://localhost:3000/auth/callback` as a redirect URI.
  Without a key the app keeps its own sign-in form and everything else still works.

The setup script also switches on the Travel Rule settings the demo needs (`TRAVEL_RULE_SETTINGS` in `lib/crypto-exchange/policy.ts`).
It reads the current settings first and updates only the keys that differ.

## Configuration

| Variable | Required | What it is |
| --- | --- | --- |
| `API_KEY` | Yes | Server-side Didit API key from your application in the Didit Console. Never sent to the browser. |
| `NEXT_PUBLIC_SITE_URL` | No | This app's public URL, used for callbacks and redirects. Defaults to `http://localhost:3000`. |
| `DIDIT_WORKFLOW_ONBOARDING` | Written by `npm run setup` | Account opening: ID check, liveness, face match, AML screening and IP analysis. |
| `DIDIT_WORKFLOW_STEP_UP` | Written by `npm run setup` | Selfie step-up a Travel Rule withdrawal opens: liveness and a face match against the onboarding selfie. |
| `DIDIT_PUBLISHABLE_KEY` | No | Didit Authentication publishable key (`pk_test_` or `pk_live_`). Empty keeps the app's own sign-in form. |
| `DIDIT_REDIRECT_URI` | No | The callback registered for the Authentication application. Defaults to the site URL plus `/auth/callback`. |
| `DIDIT_SESSION_CACHE_SECONDS` | No | Seconds the Authentication session is cached before it is checked again. |
| `DIDIT_CONSOLE_ORG_ID` | No | Organization id behind `API_KEY`, for Console deep links. Read from the API when empty. |
| `DIDIT_CONSOLE_APP_ID` | No | Application id behind `API_KEY`, for Console deep links. Read from the API when empty. |

## Project structure

```text
app/page.tsx                         The app, served at /
app/layout.tsx                       Root layout: Didit Authentication provider and signals
app/api/crypto-exchange/             Route handlers that call Didit with the server-side key
app/api/didit/events-token/route.ts  Mints the monitoring token the browser sends signals events with
middleware.ts                        Didit Authentication routes and session refresh
components/crypto-exchange/          The screens and the hook that drives the flow
lib/crypto-exchange/                 What this app sends to Didit and the rules it installs
lib/didit/                           The shared Didit client: server calls, browser SDK helpers, Authentication, signals
demo-layer/                          The Didit live layer and the console view (demo only, see below)
scripts/setup.mjs                    npm run setup: workflows, rules and lists on your Didit application
styles/                              The app's own look
tests/                               Unit tests (npm test) and the recorded Didit answers they use
e2e/                                 Playwright end-to-end tests that replay recorded answers
public/                              Images the app uses and the Didit logo
```

## Adapt it to your product

1. Replace the brand.
   The look lives in `styles/kestrel.css`, the screens in `components/crypto-exchange/`, and the name and rules text in `lib/didit/demos.ts`.
2. Change the policy.
   The risk thresholds, the step-up and the Travel Rule settings are in `lib/crypto-exchange/policy.ts`, installed by `npm run setup`.
3. Change the workflows.
   `scripts/lib/workflows.mjs` holds the onboarding and step-up workflow definitions.
   You can also build them in the Didit Console and paste their ids into `.env`.
4. Replace the market data.
   The prices, candles and order book in `lib/crypto-exchange/markets.ts` are generated sample data, so connect your own matching engine and custody.
5. Persist what you need.
   The demo keeps state in signed cookies and in Didit, so add your own database for accounts, balances and orders.

## Remove the demo-only layers

Everything that exists only to teach what happens lives in one folder, `demo-layer/`.
It holds the "Didit live" feed that narrates each Didit event, the callouts pinned to the app, the console view modal, the demo bar with the five steps, and the event builders and console pages that feed them.
Your product does not need any of it.
The Didit integration itself does not depend on the layer: Authentication, signals, the web SDK modal, transaction submission and the route handlers live in `lib/didit/`, `lib/crypto-exchange/` and `app/api/`.

The layer is reached from a handful of files, listed below, so removing it is a short, mechanical job.
It is not a one-line switch, because the demo screen mixes the app with the walkthrough.

1. Delete the `demo-layer/` folder.
2. In `app/page.tsx`, delete the `import "@/demo-layer/live.css"` line.
3. In the demo screen (the `*-demo.tsx` file under `components/`), replace the `<DemoShell>` wrapper with a plain `<div>` that keeps the `data-app` attribute, because the app's stylesheet is scoped to it.
   Then delete the blocks that only feed the walkthrough: the `live` store and every `live.push(...)` call, the `callouts`, `consoleTabs`, `tiles` and `integration` values, the console modal state, and the step bookkeeping (`done`, `step`, `onStep`).
4. In the other files below, delete the imports of `@/demo-layer/...` and the lines that use them.
5. Delete `public/brand/` if you do not show the Didit logo.
6. Run `npm run typecheck` and fix what it reports.
   The tests that cover the event builders and console pages (`*-live.test.mjs`) go with the layer.

These files import the layer:

- `app/page.tsx`
- `components/crypto-exchange/exchange.tsx`
- `components/crypto-exchange/kestrel-demo.tsx`
- `components/crypto-exchange/modals.tsx`

## Security notes

- The Didit API key is server-side only.
  It is read in `lib/didit/config.ts` and used by the route handlers in `app/api/`.
  The browser never sees it: it gets a session URL for the web SDK, a short-lived transaction token (`POST /v3/transactions/sdk-token/`) or a monitoring token for signals events.
- The tokens are bound to one `vendor_data` when the server mints them.
  Didit takes the subject of every transaction and event from the token, so a tampered browser cannot submit on behalf of another person.
- Every route that returns Didit data re-checks that the record belongs to the visitor who started it.
  The demo identity is either the signed-in Didit Authentication user or a signed, httpOnly cookie.
- Verification decisions are read from the API with the server-side key (`GET /v3/session/{id}/decision/`).
  This app does not receive webhooks.
  If you add a webhook endpoint, read the raw request body and verify the `X-Signature-V2` HMAC-SHA256 signature before you trust it, as described in the [webhooks guide](https://docs.didit.me/integration/webhooks).
- Do not commit `.env`.
  `.gitignore` already excludes it, and `.env.example` holds no secrets.
- Rotate the API key in the Didit Console if it ever leaks.

## Testing

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (next lint)
npm test            # unit tests, no Didit account needed
npm run build && npm run test:e2e   # Playwright against the production build
```

The unit tests and the end-to-end tests replay recorded Didit answers from `tests/fixtures/`.
They need no API key and never bill your application.
`npm test` loads fake workflow ids from `tests/test.env`.
Install the Playwright browser once with `npx playwright install chromium`.

## Deploy

The app is a standard Next.js 15 application with route handlers and middleware, so it runs on Vercel or on any Node host.

1. Set the variables from `.env.example` in your host's environment, with `NEXT_PUBLIC_SITE_URL` set to the public URL.
2. Run `npm run build` and `npm run start`, or let Vercel build it.
3. If you use Didit Authentication, add `<your URL>/auth/callback` to the application's redirect URIs and your URL to its allowed origins in the Didit Console.
4. Run `npm run setup` once against the application you deploy with.

The demo keeps its state in signed cookies and in Didit itself.
Before you take real traffic, move anything you need to keep into your own database.

## FAQ

### How do I add KYC and AML before a crypto exchange deposit?

Create a Didit workflow with the ID, liveness, face match and AML features, create a session for the trader after sign-up, and open its URL in the web SDK modal.
Mint the transaction token only after the decision is approved.
This repo does that: see `app/api/crypto-exchange/account/route.ts` and `app/api/crypto-exchange/token/route.ts`.
The crypto bundle (KYC, AML and wallet screening) is $0.68 per verification on the [Didit price list](https://docs.didit.me/getting-started/pricing).

### How do I screen deposit and withdrawal wallets?

Submit each deposit and withdrawal as a monitored transaction with the wallet address and `includeCryptoScreening`.
Didit screens the wallet and returns the result on the transaction, and your rules act on it.
Wallet screening is $0.15 per screening.
See `buildWithdrawalPayload` in `lib/crypto-exchange/transactions.ts`.

### What is the Travel Rule and how does Didit handle it?

The Travel Rule requires crypto asset service providers to exchange originator and beneficiary information for transfers.
You submit a withdrawal with the category `travelRule` and Didit drives the exchange with the counterparty.
This demo turns the Travel Rule on with `npm run setup`.
Read the [Travel Rule guide](https://docs.didit.me/transaction-monitoring/travel-rule) for networks, thresholds and wallet ownership proof.

### How do I decline transfers to sanctioned wallets?

Add a rule that declines a transaction when the counterparty wallet is attributed to a sanctioned entity.
The rule in `lib/crypto-exchange/policy.ts` does this and tags the transaction.

### Do the rules and screening run on a sandbox application?

No.
Transaction Monitoring does not evaluate rules or screen wallets for a sandbox application, so the held withdrawal and the declined wallet need a live application.
Onboarding with a sandbox key works and is never billed.
See [sandbox and test data](https://docs.didit.me/integration/sandbox-testing).

### Is this production ready?

It is a reference implementation.
Copy the integration patterns, but bring your own matching engine, custody and compliance policy before you go live.

## Docs and live demo

- Live demo: [https://demos.didit.me/crypto-exchange](https://demos.didit.me/crypto-exchange)
- Didit documentation: [docs.didit.me](https://docs.didit.me)
- Didit Authentication: [overview](https://docs.didit.me/authentication/overview) and [Next.js quickstart](https://docs.didit.me/authentication/quickstarts/nextjs)
- Web SDK: [JavaScript SDK](https://docs.didit.me/integration/web-sdks/javascript-sdk)
- Transaction Monitoring: [SDK transaction submission](https://docs.didit.me/transaction-monitoring/sdk-transaction-submission), [SDK event submission](https://docs.didit.me/transaction-monitoring/sdk-event-submission) and [rules API](https://docs.didit.me/transaction-monitoring/rules-api)
- Workflows: [create a workflow](https://docs.didit.me/management-api/workflows/create)
- Pricing: [docs.didit.me/getting-started/pricing](https://docs.didit.me/getting-started/pricing) and [didit.me/pricing](https://didit.me/pricing)

## License

MIT, copyright Didit.
See [LICENSE](LICENSE).
