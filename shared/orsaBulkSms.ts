export interface BulkSmsCandidate {
  id: string;
  displayName: string | null;
  phone: string | null;
  eligible: boolean;
  reason: string | null;
  consentRecorded: boolean;
}
export interface BulkSmsRun {
  id: string;
  status: string;
  message: string;
  attestation: string;
  timezone: string;
  intervalSeconds: number;
  dailyLimit: number;
  scheduledAt: string;
  pauseReason: string | null;
  createdAt: string;
  counts: Record<string, number>;
}
export interface BulkSmsOverview {
  candidates: BulkSmsCandidate[];
  runs: BulkSmsRun[];
  message: string;
  landingUrl: string;
  deliveryEnabled: boolean;
  workerNotice: string;
}
export interface BulkSmsRecipient {
  id: string;
  memberId: string;
  displayName: string | null;
  phone: string;
  status: string;
  reason: string | null;
  attemptedAt: string | null;
  submittedAt: string | null;
  deliveryStatus: string | null;
}
export interface CreateBulkSmsInput {
  memberIds: string[];
  attestation: string;
  smsPermissionConfirmed: true;
  timezone: string;
  timezoneConfirmed: true;
  intervalSeconds: number;
  dailyLimit: number;
  scheduledAt: string;
}
