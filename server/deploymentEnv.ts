export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === "production" &&
    process.env.WEBSITE_SLOT_NAME?.toLowerCase() === "production";
}
