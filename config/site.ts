export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Kestrel",
  description: "A fictional crypto exchange running Didit end to end: a passkey sign-up, KYC and AML before the first deposit, deposits screened by the sending wallet, a Travel Rule withdrawal with a selfie and a sanctioned wallet declined.",
  /** This app's public URL. Callbacks and redirects are built from it. */
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  links: {
    console: "https://business.didit.me",
    docs: "https://docs.didit.me",
    website: "https://didit.me",
  },
};
