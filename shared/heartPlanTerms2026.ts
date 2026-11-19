import { HEARTPLAN_TERMS_SNAPSHOT as PRIOR_TERMS } from "./legalPolicySnapshots";

// Keep the previously accepted policy unchanged for historical consent records.
// New registrations capture this entire version, including the separation of
// preparation from final concierge services.
export const HEARTPLAN_TERMS_CURRENT_SNAPSHOT = `${PRIOR_TERMS}

### **11. HeartPlan Preparation and Final Concierge Services**

HeartPlan is a preparation service for organizing wishes, documents, and information in advance. Any paid HeartPlan purchase is a preparation fee for access to the HeartPlan features for the period shown at checkout. It is not a payment for or toward final Steps After Life concierge services.

Final Steps After Life concierge services are separate from HeartPlan preparation. A family may choose those services when needed, subject to their own terms and any applicable charges disclosed before payment. Buying HeartPlan does not enroll a family in, pay for, or replace those final services. Separately covered ORSA case-service benefits remain in effect under the ORSA benefit.`;