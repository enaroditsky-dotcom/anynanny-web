import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BroadcastResponderArrivalLine } from "../components/parent/broadcast-responder-arrival-line";
import { NowSoonTimeRecommendation } from "../components/parent/now-soon-time-recommendation";
import { NowSpecificTimeInput } from "../components/parent/now-specific-time-input";
import { NowBroadcastAlertBody } from "../components/sitter/now-broadcast-alert-body";
import {
  mergeOpenSitterBroadcast,
  recoverActiveSitterBroadcast
} from "../lib/broadcast/sitter-broadcast-recovery";
import {
  applyNowSoonRecommendation,
  ASAP_TIMING_LABEL,
  classifyNowSpecificTime,
  NOW_ASAP_RECOMMENDATION_WINDOW_MINUTES,
  NOW_PAST_TIME_MESSAGE,
  nowKeepSpecificTimeLabel,
  resolveNowSubmitGate,
  ARRIVAL_PROMPT_LABEL,
  LEGACY_ACCEPT_LABEL,
  NOW_ARRIVAL_OPTIONS,
  NOW_DISMISS_LABEL,
  SPECIFIC_TIME_ACCEPT_LABEL,
  buildNowBroadcastAlertInsert,
  buildNowBroadcastResponseInsert,
  commitNowClockInput,
  composeNowRequestedTime,
  formatNowClockInput,
  normalizeRequestedTime,
  nowArrivalLabel,
  parentArrivalEtaLabel,
  parentNowArrivalLine,
  readNowArrivalRange,
  parseNowRequestDetails,
  publicNowServiceLocation,
  selectedArrivalControlLabel,
  validateNowTimingChoice
} from "../lib/broadcast/now-request-details";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function renderBody(
  details: ReturnType<typeof parseNowRequestDetails>,
  extras?: {
    arrivalOpen?: boolean;
    selectedArrival?: "within_15_min" | "within_30_min" | "within_30_60_min" | null;
  }
): string {
  return renderToStaticMarkup(
    createElement(NowBroadcastAlertBody, {
      details,
      loading: false,
      arrivalOpen: extras?.arrivalOpen ?? false,
      selectedArrival: extras?.selectedArrival ?? null,
      onToggleArrival: () => undefined,
      onSelectArrival: () => undefined,
      onAcceptSpecific: () => undefined,
      onAcceptLegacy: () => undefined,
      onDismiss: () => undefined
    })
  );
}

const homeAddress = {
  city: "חיפה",
  street: "הרצל",
  houseNumber: "42",
  apartment: "5",
  apartmentNumber: "5",
  floor: "3",
  doorCode: "1234",
  intercom: "משפחה כהן",
  entryNotes: "קוד בדלת 1234"
};

assert.equal(publicNowServiceLocation(homeAddress), "הרצל 42, חיפה");
assert.doesNotMatch(publicNowServiceLocation(homeAddress) ?? "", /דירה|קומה|1234|משפחה|apartment|floor/);

const specific = parseNowRequestDetails({
  location_label: "הרצל 42, חיפה",
  timing_mode: "specific_time",
  requested_time: "18:30",
  created_at: new Date().toISOString()
} as { location_label: string; timing_mode: string; requested_time: string });

assert.equal(specific.responseKind, "specific_time");
assert.equal(specific.timingLabel, "18:30");
assert.equal(normalizeRequestedTime("16:00"), "16:00");
assert.equal(normalizeRequestedTime("08:30"), "08:30");
assert.equal(normalizeRequestedTime("18:30"), "18:30");
assert.equal(composeNowRequestedTime("16", "00"), "16:00");
assert.equal(composeNowRequestedTime("8", "30"), "08:30");
assert.equal(normalizeRequestedTime("4:00 PM"), null);
assert.equal(normalizeRequestedTime("04:00 PM"), null);

assert.equal(formatNowClockInput("1"), "1");
assert.equal(formatNowClockInput("14"), "14");
assert.equal(formatNowClockInput("143"), "14:3");
assert.equal(formatNowClockInput("1430"), "14:30");
assert.equal(commitNowClockInput("14"), null);

function typeClock(keys: string): { draft: string; stored: string } {
  let draft = "";
  for (const key of keys) {
    draft = formatNowClockInput(draft + key);
    const committed = commitNowClockInput(draft);
    if (committed) draft = committed;
  }
  return { draft, stored: commitNowClockInput(draft) ?? "" };
}

assert.deepEqual(typeClock("1430"), { draft: "14:30", stored: "14:30" });
assert.deepEqual(typeClock("1600"), { draft: "16:00", stored: "16:00" });
assert.deepEqual(typeClock("0830"), { draft: "08:30", stored: "08:30" });
assert.deepEqual(typeClock("0915"), { draft: "09:15", stored: "09:15" });
assert.deepEqual(typeClock("14:30"), { draft: "14:30", stored: "14:30" });
assert.deepEqual(typeClock("9:15"), { draft: "09:15", stored: "09:15" });
assert.deepEqual(typeClock("2359"), { draft: "23:59", stored: "23:59" });
assert.deepEqual(typeClock("2400"), { draft: "24:00", stored: "" });
assert.deepEqual(typeClock("1275"), { draft: "12:75", stored: "" });
for (const time of ["08:30", "09:15", "14:00", "16:45", "23:59"]) {
  assert.equal(formatNowClockInput(time), time);
  assert.equal(commitNowClockInput(time), time);
  assert.equal(normalizeRequestedTime(time), time);
  const choice = validateNowTimingChoice("specific_time", time);
  assert.equal(choice.ok, true);
  if (choice.ok) assert.equal(choice.requestedTime, time);
}
assert.equal(commitNowClockInput("24:00"), null);
assert.equal(commitNowClockInput("12:75"), null);
assert.equal(commitNowClockInput("29:80"), null);
assert.equal(normalizeRequestedTime("24:00"), null);
assert.equal(normalizeRequestedTime("12:75"), null);
assert.equal(validateNowTimingChoice("specific_time", "24:00").ok, false);
assert.equal(validateNowTimingChoice("specific_time", "12:75").ok, false);

const sixteen = parseNowRequestDetails({
  timing_mode: "specific_time",
  requested_time: "16:00"
});
assert.equal(sixteen.timingLabel, "16:00");
const sixteenHtml = renderBody(sixteen);
assert.match(sixteenHtml, /מועד נדרש: 16:00/);
assert.doesNotMatch(sixteenHtml, /AM|PM/);

const timeInputHtml = renderToStaticMarkup(
  createElement(NowSpecificTimeInput, {
    value: "16:00",
    onChange: () => undefined
  })
);
assert.match(timeInputHtml, /value="16:00"/);
assert.match(timeInputHtml, /placeholder="16:00"/);
assert.equal((timeInputHtml.match(/<input/g) ?? []).length, 1);
assert.doesNotMatch(timeInputHtml, /type="time"/);
assert.doesNotMatch(timeInputHtml, /AM|PM|לפנה״צ|אחה״צ/);
for (const time of ["08:30", "14:00", "16:45", "23:59"]) {
  const html = renderToStaticMarkup(
    createElement(NowSpecificTimeInput, { value: time, onChange: () => undefined })
  );
  assert.match(html, new RegExp(`value="${time}"`));
  assert.doesNotMatch(html, /AM|PM|לפנה״צ|אחה״צ/);
  assert.doesNotMatch(html, /type="time"/);
}
assert.equal(specific.locationLabel, "הרצל 42, חיפה");

const specificHtml = renderBody(specific);
assert.match(specificHtml, /מיקום: הרצל 42, חיפה/);
assert.match(specificHtml, /מועד נדרש: 18:30/);
assert.ok(
  specificHtml.indexOf("מיקום:") < specificHtml.indexOf("מועד נדרש:"),
  "address row is before the requested time"
);
assert.match(specificHtml, new RegExp(SPECIFIC_TIME_ACCEPT_LABEL));
assert.match(specificHtml, new RegExp(NOW_DISMISS_LABEL.replace("/", "\\/")));
assert.equal((specificHtml.match(new RegExp(SPECIFIC_TIME_ACCEPT_LABEL, "g")) ?? []).length, 1);
assert.doesNotMatch(specificHtml, /מתי תוכלי להגיע/);
assert.doesNotMatch(specificHtml, /תוך 15 דקות/);
assert.doesNotMatch(specificHtml, /תוך 30 דקות/);
assert.doesNotMatch(specificHtml, /בין 30 דקות לשעה/);
assert.doesNotMatch(specificHtml, new RegExp(LEGACY_ACCEPT_LABEL));

const asap = parseNowRequestDetails({
  location_label: "הרצל 42, חיפה",
  timing_mode: "asap",
  requested_time: null
});
assert.equal(asap.timingLabel, ASAP_TIMING_LABEL);
assert.equal(asap.responseKind, "asap");

const asapHtml = renderBody(asap, { arrivalOpen: true });
assert.match(asapHtml, /מיקום: הרצל 42, חיפה/);
assert.match(asapHtml, /מועד נדרש: בהקדם האפשרי/);
assert.match(asapHtml, /מתי תוכלי להגיע/);
assert.match(asapHtml, /aria-expanded="true"/);
for (const option of NOW_ARRIVAL_OPTIONS) {
  assert.match(asapHtml, new RegExp(option.label));
}
assert.doesNotMatch(asapHtml, new RegExp(SPECIFIC_TIME_ACCEPT_LABEL));
assert.equal(NOW_ARRIVAL_OPTIONS.length, 3);

const closedAsap = renderBody(asap, { arrivalOpen: false });
assert.equal(closedAsap.includes(ARRIVAL_PROMPT_LABEL), true);
assert.doesNotMatch(closedAsap, /תוך 15 דקות/);

const selectedHtml = renderBody(asap, {
  arrivalOpen: false,
  selectedArrival: "within_30_min"
});
assert.match(selectedHtml, /היי, אני יכולה להגיע תוך 30 דקות/);
assert.doesNotMatch(selectedHtml, /מתי תוכלי להגיע/);
assert.equal(selectedArrivalControlLabel("within_30_min"), "היי, אני יכולה להגיע תוך 30 דקות");
assert.equal(nowArrivalLabel("within_30_min"), "היי, אני יכולה להגיע תוך 30 דקות");

const saved = buildNowBroadcastResponseInsert({
  alertId: "alert-1",
  sitterId: "sitter-1",
  arrivalRange: "within_30_min"
});
assert.equal(readNowArrivalRange(saved), "within_30_min");
assert.equal(readNowArrivalRange({ arrival_range: "within_30_min" }), "within_30_min");
assert.equal(readNowArrivalRange({ arrival_range: "תוך 30 דקות" }), null);
assert.equal(readNowArrivalRange(null), null);

function renderArrivalLine(timingMode: unknown, arrivalRange: unknown): string {
  return renderToStaticMarkup(
    createElement(BroadcastResponderArrivalLine, { timingMode, arrivalRange })
  );
}

assert.equal(parentArrivalEtaLabel("within_15_min"), "יכולה להגיע תוך 15 דקות");
assert.equal(parentArrivalEtaLabel("within_30_min"), "יכולה להגיע תוך 30 דקות");
assert.equal(parentArrivalEtaLabel("within_30_60_min"), "יכולה להגיע בין 30 דקות לשעה");

const asapFifteen = renderArrivalLine("asap", "within_15_min");
assert.match(asapFifteen, /🕒 יכולה להגיע תוך 15 דקות/);
assert.doesNotMatch(asapFifteen, /היי, אני יכולה/);

const asapThirty = renderArrivalLine("asap", "within_30_min");
assert.match(asapThirty, /🕒 יכולה להגיע תוך 30 דקות/);
assert.equal(parentNowArrivalLine({ timingMode: "asap", arrivalRange: "within_30_min" }), "יכולה להגיע תוך 30 דקות");

const asapHour = renderArrivalLine("asap", "within_30_60_min");
assert.match(asapHour, /🕒 יכולה להגיע בין 30 דקות לשעה/);

assert.equal(renderArrivalLine("asap", null), "");
assert.equal(parentNowArrivalLine({ timingMode: "asap", arrivalRange: null }), null);
assert.equal(renderArrivalLine("asap", undefined), "");

const specificCard = renderArrivalLine("specific_time", "within_30_min");
assert.equal(specificCard, "");
assert.equal(
  parentNowArrivalLine({ timingMode: "specific_time", arrivalRange: "within_30_min" }),
  null
);
assert.equal(parentNowArrivalLine({ timingMode: null, arrivalRange: "within_15_min" }), null);
assert.equal(renderArrivalLine(null, "within_15_min"), "");
assert.equal(saved.arrival_range, "within_30_min");
assert.equal(saved.alert_id, "alert-1");
assert.equal(saved.sitter_id, "sitter-1");
assert.equal(JSON.stringify(saved).includes("תוך 30"), false);

const specificResponse = buildNowBroadcastResponseInsert({
  alertId: "alert-1",
  sitterId: "sitter-1",
  arrivalRange: null
});
assert.equal("arrival_range" in specificResponse, false);

const missing = parseNowRequestDetails({
  city: "חיפה",
  created_at: new Date().toISOString()
} as { location_label?: string });
assert.equal(missing.locationLabel, null);
assert.equal(missing.timingLabel, null);
assert.equal(missing.responseKind, "legacy");
assert.doesNotMatch(renderBody(missing), /בהקדם האפשרי/);
assert.doesNotMatch(renderBody(missing), /מיקום/);
const timedWithoutAddress = renderBody(
  parseNowRequestDetails({
    timing_mode: "specific_time",
    requested_time: "16:00",
    location_label: null
  })
);
assert.match(timedWithoutAddress, /מועד נדרש: 16:00/);
assert.doesNotMatch(timedWithoutAddress, /מיקום/);
assert.doesNotMatch(timedWithoutAddress, /AM|PM/);
assert.match(renderBody(missing), new RegExp(LEGACY_ACCEPT_LABEL));
assert.match(renderBody(missing), new RegExp(NOW_DISMISS_LABEL.replace("/", "\\/")));

assert.equal(
  parseNowRequestDetails({
    timing_mode: "specific_time",
    requested_time: "now"
  }).responseKind,
  "legacy"
);
assert.equal(parseNowRequestDetails({ timing_mode: "soon" }).timingLabel, null);

const asapChoice = validateNowTimingChoice("asap", "18:30");
assert.equal(asapChoice.ok, true);
if (asapChoice.ok) {
  assert.equal(asapChoice.requestedTime, null);
}
const specificChoice = validateNowTimingChoice("specific_time", "18:30:00");
assert.equal(specificChoice.ok, true);
if (specificChoice.ok) {
  assert.equal(specificChoice.requestedTime, "18:30");
}
assert.equal(validateNowTimingChoice(null, null).ok, false);

const inserted = buildNowBroadcastAlertInsert({
  parentId: "parent-1",
  city: "חיפה",
  address: homeAddress,
  timingMode: "specific_time",
  requestedTime: "18:30"
});
assert.equal(inserted.location_label, "הרצל 42, חיפה");
assert.equal(inserted.timing_mode, "specific_time");
assert.equal(inserted.requested_time, "18:30");
assert.equal(inserted.city, "חיפה");
assert.equal("apartment" in inserted, false);
assert.equal("floor" in inserted, false);
assert.equal("doorCode" in inserted, false);

const asapInsert = buildNowBroadcastAlertInsert({
  parentId: "parent-1",
  city: "חיפה",
  address: { city: "חיפה" },
  timingMode: "asap",
  requestedTime: null
});
assert.equal("location_label" in asapInsert, false);
assert.equal(asapInsert.timing_mode, "asap");
assert.equal(asapInsert.requested_time, null);

const recovered = recoverActiveSitterBroadcast({
  rows: [
    {
      id: "alert-1",
      city: "חיפה",
      service_type: "sitter",
      status: "active",
      created_at: new Date().toISOString(),
      location_label: "הרצל 42, חיפה",
      timing_mode: "asap",
      requested_time: null
    }
  ],
  sitterCities: ["חיפה"],
  dismissedIds: new Set(),
  paused: false,
  currentId: null
});
assert.equal(recovered.open?.location_label, "הרצל 42, חיפה");
const openedWithoutAddress = {
  id: "alert-1",
  city: "חיפה",
  service_type: "sitter",
  location_label: null,
  timing_mode: null,
  requested_time: null
};
const refreshedWithAddress = mergeOpenSitterBroadcast(openedWithoutAddress, {
  ...openedWithoutAddress,
  location_label: "הרצל 42, חיפה",
  timing_mode: "specific_time",
  requested_time: "16:00"
});
assert.equal(refreshedWithAddress.location_label, "הרצל 42, חיפה");
assert.equal(refreshedWithAddress.requested_time, "16:00");
assert.equal(
  mergeOpenSitterBroadcast(refreshedWithAddress, {
    ...refreshedWithAddress,
    location_label: null
  }).location_label,
  "הרצל 42, חיפה"
);
assert.equal(recovered.open?.timing_mode, "asap");
assert.equal(recovered.clearCurrent, false);

const modal = read("components/sitter/SitterBroadcastAlertModal.tsx");
const parentPage = read("app/parent/broadcast/page.tsx");
const migration = read("supabase/migrations/20260928143000_anynanny_now_location_and_arrival.sql");
const radar = read("app/parent/search/broadcast-radar/page.tsx");

assert.match(modal, /broadcast_responses/);
assert.match(modal, /buildNowBroadcastResponseInsert/);
assert.match(modal, /התעלם \/ לא רלוונטי|NOW_DISMISS_LABEL|NowBroadcastAlertBody/);
assert.match(modal, /<h3[^>]*>\s*⚡ בייביסיטר זמינה בסביבה\s*<\/h3>/);
assert.doesNotMatch(modal, /קריאת ברק/);
assert.doesNotMatch(modal, /קריאה מיידית בסביבה/);
assert.match(modal, /parseNowRequestDetails\(activeAlert\)/);
assert.match(modal, /SITTER_BROADCAST_ALERT_SELECT/);
assert.match(modal, /mergeOpenSitterBroadcast/);
assert.match(
  read("lib/broadcast/now-request-details.ts"),
  /SITTER_BROADCAST_ALERT_SELECT =\s*"id, city, service_type, status, created_at, location_label, timing_mode, requested_time"/
);
assert.match(modal, /recoverActiveSitterBroadcast/);
assert.match(modal, /createPortal/);
assert.match(modal, /anynanny_broadcast_dismissed_v1/);
assert.match(parentPage, /city: city/);
assert.match(parentPage, /buildNowBroadcastAlertInsert/);
assert.match(parentPage, /בהקדם האפשרי/);
assert.match(parentPage, /שעה מסוימת/);
assert.match(parentPage, /NowSpecificTimeInput/);
assert.doesNotMatch(parentPage, /type="time"/);
assert.doesNotMatch(parentPage, /apartment|doorCode|intercom/);
assert.match(radar, /PARENT_BROADCAST_RESPONSE_SELECT/);
assert.match(radar, /readNowArrivalRange/);
assert.match(radar, /BroadcastResponderArrivalLine/);
assert.match(radar, /שליחת בקשה/);
assert.match(radar, /שנות ניסיון/);
assert.match(radar, /כל המידע/);
assert.match(migration, /location_label/);
assert.match(migration, /timing_mode/);
assert.match(migration, /requested_time/);
assert.match(migration, /arrival_range/);
assert.match(migration, /within_15_min/);
assert.match(migration, /within_30_min/);
assert.match(migration, /within_30_60_min/);
assert.match(migration, /specific_time/);
const parserSource = read("lib/broadcast/now-request-details.ts");
const parserBody = parserSource.slice(parserSource.indexOf("export function parseNowRequestDetails"));
assert.doesNotMatch(parserBody, /created_at/);
assert.doesNotMatch(parserBody, /new Date\(/);

const now1720 = new Date(2026, 8, 28, 17, 20, 45, 0);
assert.equal(NOW_ASAP_RECOMMENDATION_WINDOW_MINUTES, 60);
for (const past of ["16:00", "17:00", "17:19", "17:20"]) {
  assert.equal(classifyNowSpecificTime(past, now1720).kind, "past");
  const blocked = resolveNowSubmitGate({
    timingMode: "specific_time",
    requestedTime: past,
    now: now1720
  });
  assert.equal(blocked.action, "block_past");
  if (blocked.action === "block_past") assert.equal(blocked.message, NOW_PAST_TIME_MESSAGE);
}
const oneMinute = classifyNowSpecificTime("17:21", now1720);
assert.equal(oneMinute.kind, "soon");
if (oneMinute.kind === "soon") assert.equal(oneMinute.minutesAhead, 1);
const exactly60 = classifyNowSpecificTime("18:20", now1720);
assert.equal(exactly60.kind, "soon");
if (exactly60.kind === "soon") assert.equal(exactly60.minutesAhead, 60);
const sixtyOne = classifyNowSpecificTime("18:21", now1720);
assert.equal(sixtyOne.kind, "later");
if (sixtyOne.kind === "later") assert.equal(sixtyOne.minutesAhead, 61);

const recommend = resolveNowSubmitGate({
  timingMode: "specific_time",
  requestedTime: "17:21",
  now: now1720
});
assert.equal(recommend.action, "recommend_asap");
const noRecommend = resolveNowSubmitGate({
  timingMode: "specific_time",
  requestedTime: "18:21",
  now: now1720
});
assert.equal(noRecommend.action, "send");
if (noRecommend.action === "send") {
  assert.equal(noRecommend.timingMode, "specific_time");
  assert.equal(noRecommend.requestedTime, "18:21");
}
assert.equal(
  resolveNowSubmitGate({ timingMode: "specific_time", requestedTime: "24:00", now: now1720 }).action,
  "invalid"
);
assert.equal(
  resolveNowSubmitGate({ timingMode: "specific_time", requestedTime: "12:75", now: now1720 }).action,
  "invalid"
);

const switched = applyNowSoonRecommendation("switch_to_asap", "18:00");
assert.equal(switched.timingMode, "asap");
assert.equal(switched.requestedTime, null);
const stayed = applyNowSoonRecommendation("keep_specific", "18:00");
assert.equal(stayed.timingMode, "specific_time");
assert.equal(stayed.requestedTime, "18:00");
assert.equal(nowKeepSpecificTimeLabel("18:00"), "להישאר עם 18:00");
const keptSend = resolveNowSubmitGate({
  timingMode: stayed.timingMode,
  requestedTime: stayed.requestedTime,
  now: now1720,
  acknowledgedSoon: true
});
assert.equal(keptSend.action, "send");
if (keptSend.action === "send") {
  assert.equal(keptSend.timingMode, "specific_time");
  assert.equal(keptSend.requestedTime, "18:00");
}
const asapSend = resolveNowSubmitGate({
  timingMode: "asap",
  requestedTime: "16:00",
  now: now1720
});
assert.equal(asapSend.action, "send");
if (asapSend.action === "send") {
  assert.equal(asapSend.timingMode, "asap");
  assert.equal(asapSend.requestedTime, null);
}

const soonHtml = renderToStaticMarkup(
  createElement(NowSoonTimeRecommendation, {
    requestedTime: "18:00",
    onSwitchToAsap: () => undefined,
    onKeepSpecific: () => undefined
  })
);
assert.match(soonHtml, /השעה שבחרת קרובה מאוד/);
assert.match(soonHtml, /אולי כדאי לבחור באופציה/);
assert.match(soonHtml, /בהקדם האפשרי/);
assert.match(soonHtml, /לעבור לבהקדם האפשרי/);
assert.match(soonHtml, /להישאר עם/);
assert.match(soonHtml, /18:00/);
assert.doesNotMatch(soonHtml, /type="date"|type="time"|AM|PM/);
assert.match(parentPage, /NowSoonTimeRecommendation/);
assert.match(parentPage, /NOW_PAST_TIME_MESSAGE/);
assert.match(parentPage, /resolveNowSubmitGate/);
assert.match(parentPage, /applyNowSoonRecommendation/);
assert.doesNotMatch(parentPage, /type="date"/);
assert.doesNotMatch(parentPage, /type="datetime-local"/);
assert.doesNotMatch(read("components/parent/now-soon-time-recommendation.tsx"), /alert\(/);

console.log("anynanny now arrival option checks passed");
