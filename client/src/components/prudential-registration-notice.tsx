import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import {
  PRUDENTIAL_ACCESS_MESSAGE,
} from "@shared/prudentialOffer";

export function PrudentialRegistrationNotice() {
  return (
    <aside className="pr-registration-notice rounded-xl border border-[#0076D1]/25 bg-[#f0f9ff] p-4 text-sm text-[#001F45]" data-testid="prudential-registration-notice">
      <div className="flex items-start gap-3">
        <span className="pr-registration-icon">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0076D1]" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <p className="font-semibold">Your Prudential partnership offer</p>
          <p className="leading-6">Create your Steps After Life account and verify your email. Your private plan is not shared with Prudential.</p>
          <p className="leading-6">
            {PRUDENTIAL_ACCESS_MESSAGE} No offer review required. This partnership offer has no expiration.
          </p>
          <Link href="/prudential/heartplan" className="block w-fit py-2 underline underline-offset-4">View partnership details</Link>
        </div>
      </div>
    </aside>
  );
}
