"use client";

import { cancellationContactHref, type CancellationRequesterRole } from "@/lib/bookings/cancellation-request";
import type { CancellationAttentionState } from "@/lib/bookings/use-cancellation-attention";
import { ShiftCancellationApprovedModal } from "@/components/bookings/shift-cancellation-approved-modal";
import { ShiftCancellationIncomingModal } from "@/components/bookings/shift-cancellation-incoming-modal";

export function CancellationAttentionModals({
  attention,
  role
}: {
  attention: CancellationAttentionState;
  role: CancellationRequesterRole;
}) {
  const incoming = attention.incomingItem;
  const approved = attention.approvedItem;

  return (
    <>
      <ShiftCancellationIncomingModal
        open={Boolean(incoming)}
        item={incoming}
        contactHref={incoming ? cancellationContactHref(role, incoming.partnerId) : "/"}
        busy={attention.busy}
        error={incoming ? attention.error : null}
        viewerRole={role}
        onLater={() => {
          if (incoming) attention.dismissIncomingForNow(incoming.id);
        }}
        onApprove={() => {
          if (incoming) void attention.approveIncoming(incoming.id);
        }}
      />
      <ShiftCancellationApprovedModal
        open={Boolean(approved) && !incoming}
        item={approved}
        busy={attention.busy}
        error={approved && !incoming ? attention.error : null}
        onAcknowledge={() => {
          if (approved) void attention.acknowledgeApproved(approved.id);
        }}
      />
    </>
  );
}
