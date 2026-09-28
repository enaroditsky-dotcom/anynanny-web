import React from "react";
import {
  ARRIVAL_PROMPT_LABEL,
  ARRIVAL_PROMPT_OPEN_LABEL,
  LEGACY_ACCEPT_LABEL,
  NOW_ARRIVAL_OPTIONS,
  NOW_DISMISS_LABEL,
  SPECIFIC_TIME_ACCEPT_LABEL,
  selectedArrivalControlLabel,
  type NowArrivalRange,
  type ParsedNowRequest
} from "@/lib/broadcast/now-request-details";

type NowBroadcastAlertBodyProps = {
  details: ParsedNowRequest;
  loading: boolean;
  arrivalOpen: boolean;
  selectedArrival: NowArrivalRange | null;
  onToggleArrival: () => void;
  onSelectArrival: (value: NowArrivalRange) => void;
  onAcceptSpecific: () => void;
  onAcceptLegacy: () => void;
  onDismiss: () => void;
};

const primaryButtonClass =
  "w-full rounded-2xl bg-[#001F3F] px-3 py-3 text-center text-[13px] font-bold leading-snug text-white shadow-md transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

const optionButtonClass =
  "min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-[13px] font-bold leading-snug text-[#001F3F] transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export function NowBroadcastAlertBody({
  details,
  loading,
  arrivalOpen,
  selectedArrival,
  onToggleArrival,
  onSelectArrival,
  onAcceptSpecific,
  onAcceptLegacy,
  onDismiss
}: NowBroadcastAlertBodyProps) {
  const selectedLabel =
    selectedArrival && details.responseKind === "asap" && !arrivalOpen
      ? selectedArrivalControlLabel(selectedArrival)
      : "";

  const arrivalControlLabel = selectedLabel
    ? selectedLabel
    : arrivalOpen
      ? ARRIVAL_PROMPT_OPEN_LABEL
      : ARRIVAL_PROMPT_LABEL;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 overflow-x-hidden text-center">
      {details.locationLabel ? (
        <p className="break-words text-sm font-semibold leading-snug text-[#001F3F]">
          📍 מיקום: {details.locationLabel}
        </p>
      ) : null}

      {details.timingLabel ? (
        <p className="break-words text-sm font-semibold leading-snug text-[#001F3F]">
          🕒 מועד נדרש: {details.timingLabel}
        </p>
      ) : null}

      <div className="flex w-full min-w-0 flex-col gap-2">
        {details.responseKind === "specific_time" ? (
          <button
            type="button"
            disabled={loading}
            onClick={onAcceptSpecific}
            className={primaryButtonClass}
          >
            {SPECIFIC_TIME_ACCEPT_LABEL}
          </button>
        ) : null}

        {details.responseKind === "asap" ? (
          <div className="w-full min-w-0">
            <button
              type="button"
              disabled={loading}
              aria-expanded={arrivalOpen}
              onClick={() => {
                if (selectedArrival && !arrivalOpen) {
                  onSelectArrival(selectedArrival);
                  return;
                }
                onToggleArrival();
              }}
              className={`${primaryButtonClass} flex items-center justify-center gap-2 ${
                selectedLabel ? "ring-2 ring-[#00A86B]" : ""
              }`}
            >
              <span className="min-w-0 flex-1 break-words">{arrivalControlLabel}</span>
            </button>

            {arrivalOpen ? (
              <div className="mt-2 flex w-full min-w-0 flex-col gap-2">
                {NOW_ARRIVAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={loading}
                    aria-pressed={selectedArrival === option.value}
                    onClick={() => onSelectArrival(option.value)}
                    className={optionButtonClass}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {details.responseKind === "legacy" ? (
          <button
            type="button"
            disabled={loading}
            onClick={onAcceptLegacy}
            className={primaryButtonClass}
          >
            {loading ? "שולח מענה..." : LEGACY_ACCEPT_LABEL}
          </button>
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={onDismiss}
          className="w-full rounded-2xl border border-slate-200 bg-white py-2 text-[13px] font-bold text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {NOW_DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}
