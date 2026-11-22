import Stripe from "stripe";

/**
 * Returns a fresh authenticated Stripe client, or null if Stripe is not configured.
 */
export async function getStripeClient(): Promise<Stripe | null> {
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
