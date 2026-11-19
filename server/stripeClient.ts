import Stripe from "stripe";

async function getConnectorSecretKey(): Promise<string | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const settings = data.items?.[0]?.settings;
    const key = settings?.secret ?? settings?.secret_key;
    if (typeof key === "string" && (key.startsWith("sk_") || key.startsWith("rk_"))) {
      return key;
    }
    return null;
  } catch (err) {
    console.error("[Stripe] Failed to fetch connector credentials:", err);
    return null;
  }
}

/**
 * Returns a fresh authenticated Stripe client, or null if Stripe is not configured.
 * Payment operations continue to prefer the Replit Stripe connection.
 */
export async function getStripeClient(): Promise<Stripe | null> {
  const connectorKey = await getConnectorSecretKey();
  if (connectorKey) return new Stripe(connectorKey);

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey && (envKey.startsWith("sk_") || envKey.startsWith("rk_"))) {
    return new Stripe(envKey);
  }
  return null;
}

/** Identity needs a key from an account where Stripe Identity is enabled. */
export async function getStripeIdentityClient(): Promise<Stripe | null> {
  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey && (envKey.startsWith("sk_") || envKey.startsWith("rk_"))) {
    return new Stripe(envKey);
  }
  return getStripeClient();
}
