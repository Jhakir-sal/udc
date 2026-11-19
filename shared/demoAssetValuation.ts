// Scripted examples only: never use these figures as real market evidence.
export const DEMO_VALUATION_ITEMS = [
  {
    id: "watch",
    name: "Sample stainless-steel watch",
    category: "Watch",
    description: "Fictional automatic watch, original box, no service history.",
    lowCents: 180000,
    highCents: 260000,
    evidence: ["Reference and serial number", "Authentication and service history", "Recent verified sales of the same model"],
  },
  {
    id: "vehicle",
    name: "Sample family sedan",
    category: "Car or vehicle",
    description: "Fictional 2018 sedan, 75,000 miles, clean title assumed.",
    lowCents: 1050000,
    highCents: 1350000,
    evidence: ["VIN and title", "Mileage and inspection report", "Recent verified local sales"],
  },
  {
    id: "jewelry",
    name: "Sample gold ring",
    category: "Jewelry",
    description: "Fictional 14-karat gold ring with an ungraded stone.",
    lowCents: 40000,
    highCents: 80000,
    evidence: ["Metal weight and purity", "Stone grading or jeweler appraisal", "Recent verified comparable sales"],
  },
] as const;

export const DEMO_VALUATION_CONDITIONS = [
  { id: "excellent", label: "Excellent", multiplier: 1.15 },
  { id: "good", label: "Good", multiplier: 1 },
  { id: "fair", label: "Fair", multiplier: 0.75 },
] as const;

export type DemoValuationCondition = typeof DEMO_VALUATION_CONDITIONS[number]["id"];

export function getDemoAssetEstimate(itemId: string, conditionId: string) {
  const item = DEMO_VALUATION_ITEMS.find((entry) => entry.id === itemId);
  const condition = DEMO_VALUATION_CONDITIONS.find((entry) => entry.id === conditionId);
  if (!item || !condition) throw new Error("Choose a sample item and a supported condition.");
  const lowCents = Math.round(item.lowCents * condition.multiplier);
  const highCents = Math.round(item.highCents * condition.multiplier);
  const midpointCents = Math.round((lowCents + highCents) / 2);
  return {
    item,
    condition: condition.label,
    lowCents,
    highCents,
    midpointCents,
    purchaseTargetCents: Math.round(midpointCents * 0.8),
    source: "Scripted demo — not live AI or verified market evidence",
  };
}
