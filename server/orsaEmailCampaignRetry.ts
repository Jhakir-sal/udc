export type RetryEvidence = {
  retryDeliveryId: string;
  priorTrackingTokenHash: string | null;
  priorAttemptedAt: string;
};

export type CampaignSnapshotRecipient = { id: string; email: string; firstContactOnly?: true } & Partial<RetryEvidence>;

export type RetryDeliveryRecord = {
  id: string;
  memberId: string;
  email: string;
  status: string;
  trackingTokenHash: string | null;
  attemptedAt: Date;
  sentAt: Date | null;
  firstOpenedAt: Date | null;
  firstClickedAt: Date | null;
};

export function eligibleRetryRecipients<T extends { id: string; email: string }>(
  candidates: T[],
  deliveries: RetryDeliveryRecord[],
  optedOut: Set<string>,
): Array<T & RetryEvidence> {
  const memberCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const row of deliveries) {
    memberCounts.set(row.memberId, (memberCounts.get(row.memberId) || 0) + 1);
    emailCounts.set(row.email, (emailCounts.get(row.email) || 0) + 1);
  }
  const held = new Map(deliveries.filter((row) =>
    row.status === "needs_review" && !row.sentAt && !row.firstOpenedAt && !row.firstClickedAt,
  ).map((row) => [`${row.memberId}\0${row.email}`, row]));
  return candidates.flatMap((candidate) => {
    const row = held.get(`${candidate.id}\0${candidate.email}`);
    if (!row || optedOut.has(candidate.email) ||
      memberCounts.get(candidate.id) !== 1 || emailCounts.get(candidate.email) !== 1) return [];
    return [{
      ...candidate,
      retryDeliveryId: row.id,
      priorTrackingTokenHash: row.trackingTokenHash,
      priorAttemptedAt: row.attemptedAt.toISOString(),
    }];
  });
}

// A changed tracking hash means another attempt already claimed this delivery.
// Never let the same confirmed run retry its own failed attempt.
export function matchesRetrySnapshot(
  snapshot: CampaignSnapshotRecipient,
  candidate: CampaignSnapshotRecipient,
): boolean {
  return snapshot.id === candidate.id && snapshot.email === candidate.email &&
    snapshot.retryDeliveryId === candidate.retryDeliveryId &&
    snapshot.priorTrackingTokenHash === candidate.priorTrackingTokenHash;
}

export function isRetrySnapshot(snapshot: CampaignSnapshotRecipient[]): boolean {
  return snapshot.length > 0 && snapshot.every((row) => Boolean(row.retryDeliveryId));
}

export function pendingSnapshotRecipients(
  snapshot: CampaignSnapshotRecipient[],
  available: CampaignSnapshotRecipient[],
): CampaignSnapshotRecipient[] {
  const byKey = new Map(available.map((row) => [`${row.id}\0${row.email}`, row]));
  return snapshot.filter((row) => {
    const candidate = byKey.get(`${row.id}\0${row.email}`);
    return Boolean(candidate && (!row.retryDeliveryId || matchesRetrySnapshot(row, candidate)));
  });
}