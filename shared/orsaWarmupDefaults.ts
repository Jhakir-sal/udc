// Operator-reviewed example, not proof of a provider-approved IP allowance.
export const ORSA_WARMUP_WEEK_ONE_PRESET = {
  hourlyLimit: 25,
  dailyLimit: 250,
  minIntervalSeconds: 144,
  providerHourlyLimit: 35,
  reservedHourly: 10,
};

export const ORSA_WARMUP_WEEK_TWO_PRESET = {
  hourlyLimit: 50,
  dailyLimit: 500,
  minIntervalSeconds: 72,
  providerHourlyLimit: 60,
  reservedHourly: 10,
};

export const ORSA_WARMUP_EXPANDED_PRESET = {
  hourlyLimit: 120,
  dailyLimit: 1000,
  minIntervalSeconds: 30,
  providerHourlyLimit: 130,
  reservedHourly: 10,
};

export const ORSA_WARMUP_DEFAULTS = {
  enabled: false,
  paused: true,
  ...ORSA_WARMUP_WEEK_ONE_PRESET,
};

// Manually reviewed full-list option. Loading this never enables or starts sends.
export const ORSA_FULL_LIST_PRESET = {
  hourlyLimit: 720,
  dailyLimit: 10000,
  minIntervalSeconds: 5,
  providerHourlyLimit: 730,
  reservedHourly: 10,
};

// Draft-only faster option. Provider capacity and delivery review are still required.
export const ORSA_FAST_OUTREACH_PRESET = {
  hourlyLimit: 900,
  dailyLimit: 10000,
  minIntervalSeconds: 4,
  providerHourlyLimit: 910,
  reservedHourly: 10,
};
