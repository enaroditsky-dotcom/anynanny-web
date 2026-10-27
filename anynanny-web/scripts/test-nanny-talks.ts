import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldPersistOperationalCardRead } from "../lib/notifications/coordination";
import {
  emptyBroadcastArrivalSound,
  observeBroadcastArrivals
} from "../lib/broadcast/broadcast-arrival-sound";
import {
  NANNY_TALK_REFRESH_MS,
  resolveNannyTalkModal,
  talkItemModalQuestionId
} from "../lib/broadcast/nanny-talk-presentation";
import {
  ANYNANNY_SYSTEM_CONVERSATION_TITLE,
  BROADCAST_TALKS_HREF,
  EXPLICIT_BROADCAST_REMOVAL_LABEL,
  NANNY_IMAGE_SRC,
  NANNY_THUMBS_UP_IMAGE_SRC,
  broadcastPendingBadge,
  systemConversationVisible
} from "../lib/broadcast/system-talks";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(NANNY_IMAGE_SRC, "/brand/BROADCAST%20NANNY.png");
assert.equal(NANNY_THUMBS_UP_IMAGE_SRC, "/brand/nanny-thumbs-up.png");
assert.notEqual(NANNY_THUMBS_UP_IMAGE_SRC, NANNY_IMAGE_SRC);

function pngSize(relativePath: string) {
  const buf = readFileSync(new URL(`../${relativePath}`, import.meta.url));
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const broadcastPng = pngSize("public/brand/BROADCAST NANNY.png");
const thumbsPng = pngSize("public/brand/nanny-thumbs-up.png");
assert.equal(broadcastPng.width, 1287);
assert.equal(broadcastPng.height, 1222);
assert.deepEqual(thumbsPng, broadcastPng);
assert.equal(EXPLICIT_BROADCAST_REMOVAL_LABEL, "סגור ומחק את ההודעה");
assert.equal(ANYNANNY_SYSTEM_CONVERSATION_TITLE, "AnyNanny — הודעות מערכת");
assert.equal(broadcastPendingBadge(0, 0), null);
assert.equal(broadcastPendingBadge(1, 0), "1");
assert.equal(broadcastPendingBadge(2, 1), "3");
assert.equal(broadcastPendingBadge(9, 1), "9+");
assert.equal(systemConversationVisible(0), false);
assert.equal(systemConversationVisible(2), true);

assert.equal(shouldPersistOperationalCardRead({ markRead: true, kind: "admin_broadcast" }), false);
assert.equal(shouldPersistOperationalCardRead({ markRead: true, kind: "booking_request" }), false);

const frame = read("components/broadcast/nanny-talks-frame.tsx");
assert.match(frame, /data-nanny-talks-modal/);
assert.match(frame, /role="dialog"/);
assert.match(frame, /aria-modal="true"/);
assert.match(frame, /Escape/);
assert.match(frame, /data-nanny-speech-bubble/);
assert.doesNotMatch(frame, /data-nanny-speech-tail|<svg/);
assert.match(frame, /overflow-y-auto/);
assert.match(frame, /max-h-\[min\(70dvh,34rem\)\]/);
assert.match(frame, /object-contain/);
assert.match(frame, /createPortal/);
assert.match(frame, /document\.body/);
assert.match(frame, /imageSrc = NANNY_IMAGE_SRC/);
assert.match(frame, /src=\{imageSrc\}/);
assert.match(frame, /h-16 w-auto max-w-\[4\.25rem\] shrink-0 object-contain object-bottom sm:h-\[5\.25rem\] sm:max-w-\[5rem\]/);
assert.equal(frame.match(/<img/g)?.length, 1);
assert.match(frame, /dir="rtl"/);
assert.match(frame, /text-right/);
assert.match(frame, /data-nanny-speech-bubble[\s\S]*data-nanny-character/);
assert.doesNotMatch(frame, /-translate-x-\[72%\]/);
assert.doesNotMatch(frame, /start-8/);
assert.doesNotMatch(frame, /<img[^>]*alt="[^"]+"/);

const overlay = read("components/notifications/global-coordination-notifications.tsx");
assert.match(overlay, /resolveNannyTalkModal/);
assert.match(overlay, /NANNY_TALK_REFRESH_MS/);
assert.match(overlay, /broadcast_question_recipients/);
assert.match(overlay, /pathname, inboxRefresh/);
assert.doesNotMatch(overlay, /current \?\? nextId/);
assert.match(overlay, /NannyTalksFrame/);
assert.match(overlay, /nannyTalkImageSrc\(regularBroadcast\.payload\)/);
assert.match(
  read("app/broadcast/talks/page.tsx"),
  /selected\.nannyVariant === "thumbs_up" \? NANNY_THUMBS_UP_IMAGE_SRC : undefined/
);
assert.match(overlay, /BroadcastQuestionAnswer/);
assert.match(overlay, /dismissUnansweredQuestionCard/);
assert.match(overlay, /setHiddenBroadcastIds/);
assert.match(overlay, /operationalItems/);
assert.match(overlay, /isInternalBroadcastCtaRoute/);
assert.doesNotMatch(overlay, /<UnansweredQuestionCard|<UnansweredQuestionsInboxCard/);
const regularDismiss = overlay.slice(overlay.indexOf("const dismissRegularTalk"), overlay.indexOf("const removeRegularTalk"));
assert.doesNotMatch(regularDismiss, /markNotificationsRead|removeOwnRegularBroadcast/);

const answer = read("components/broadcast/broadcast-question-answer.tsx");
const savedStart = answer.indexOf("{saved ? (");
const savedBlock = answer.slice(savedStart, answer.indexOf(") : null}", savedStart));
assert.doesNotMatch(savedBlock, /EXPLICIT_BROADCAST_REMOVAL_LABEL/);
const closeStart = answer.indexOf("{saved ? (", answer.indexOf("עדכון תשובה"));
const closeBlock = answer.slice(closeStart, answer.indexOf(") : null}", closeStart));
assert.match(closeBlock, /EXPLICIT_BROADCAST_REMOVAL_LABEL/);
assert.match(closeBlock, /removeFromInbox/);
assert.match(answer, /removeOwnBroadcastQuestion/);
assert.match(answer, /if \(!result\.ok\)/);

const nav = read("components/bottom-nav.tsx");
assert.match(nav, /useBroadcastMessagesBadge/);
assert.match(nav, /data-broadcast-messages-badge/);
assert.match(nav, /hasUnreadMessages/);
assert.equal(nav.match(/badgeKey: "questions"/g)?.length ?? 0, 0);

assert.doesNotMatch(read("app/parent/settings/page.tsx"), /MyQuestionsSettingsLink|השאלות שלי|broadcast/i);
assert.doesNotMatch(read("app/sitter/settings/page.tsx"), /MyQuestionsSettingsLink|השאלות שלי|broadcast/i);
assert.match(read("app/parent/messages/page.tsx"), /AnynannySystemConversation/);
assert.match(read("app/sitter/messages/page.tsx"), /AnynannySystemConversation/);
assert.match(read("components/broadcast/anynanny-system-conversation.tsx"), /ANYNANNY_SYSTEM_CONVERSATION_TITLE/);
assert.match(read("components/broadcast/anynanny-system-conversation.tsx"), /BROADCAST_TALKS_HREF/);
assert.equal(BROADCAST_TALKS_HREF, "/broadcast/talks");
assert.doesNotMatch(read("components/broadcast/anynanny-system-conversation.tsx"), /textarea|chat_rooms/);

const migration = read("supabase/migrations/20261025163000_broadcast_question_removed_at.sql");
assert.match(migration, /removed_at/);
assert.match(migration, /first_responded_at is not null/);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /grant execute on function public\.remove_own_broadcast_question\(uuid\) to authenticated/);
assert.doesNotMatch(migration, /delete from/i);

const talks = read("lib/broadcast/system-talks.ts");
assert.match(talks, /is\("removed_at", null\)/);
assert.match(talks, /fetchUnreadAdminBroadcastNotifications/);
assert.match(talks, /if \(result\.error\) return \{ ok: false/);
assert.doesNotMatch(talks, /localStorage|sessionStorage|\.delete\(/);

const coordination = read("lib/notifications/coordination.ts");
assert.match(coordination, /ordinaryAdminBroadcastsForReplay/);
assert.match(coordination, /isAdminBroadcastNotificationKind\(args\.kind\)\) return false/);

const open = {
  operationalPending: false,
  pendingQuestionVisible: true,
  dismissedQuestionIds: [] as string[],
  heldQuestionId: null as string | null,
  heldQuestionVisible: true,
  hiddenBroadcastIds: [] as string[]
};

const questionWhileOpen = resolveNannyTalkModal({
  ...open,
  pendingQuestionId: null,
  broadcastId: null
});
assert.equal(questionWhileOpen, null);
const questionArrived = resolveNannyTalkModal({
  ...open,
  pendingQuestionId: "question-new",
  broadcastId: null
});
assert.deepEqual(questionArrived, { type: "question", questionId: "question-new" });
assert.deepEqual(
  resolveNannyTalkModal({ ...open, pendingQuestionId: "question-load", broadcastId: null }),
  { type: "question", questionId: "question-load" }
);
assert.deepEqual(
  resolveNannyTalkModal({ ...open, pendingQuestionId: null, broadcastId: "broadcast-new" }),
  { type: "broadcast", broadcastId: "broadcast-new" }
);

const messageQuestionId = talkItemModalQuestionId({
  kind: "question",
  id: "question-message",
  pending: true
});
assert.equal(messageQuestionId, "question-message");
assert.deepEqual(
  resolveNannyTalkModal({ ...open, pendingQuestionId: messageQuestionId, broadcastId: null }),
  { type: "question", questionId: "question-message" }
);
assert.equal(
  talkItemModalQuestionId({ kind: "question", id: "question-answered", pending: false }),
  null
);
assert.equal(talkItemModalQuestionId({ kind: "broadcast", id: "broadcast-message", pending: true }), null);

const dismissed = resolveNannyTalkModal({
  ...open,
  pendingQuestionId: "question-dismissed",
  dismissedQuestionIds: ["question-dismissed"],
  broadcastId: null
});
assert.equal(dismissed, null);
assert.equal(
  resolveNannyTalkModal({
    ...open,
    pendingQuestionId: "question-dismissed",
    dismissedQuestionIds: ["question-dismissed"],
    broadcastId: null
  }),
  null
);

assert.deepEqual(
  resolveNannyTalkModal({
    ...open,
    operationalPending: true,
    pendingQuestionId: "question-waiting",
    broadcastId: "broadcast-waiting"
  }),
  null
);
assert.deepEqual(
  resolveNannyTalkModal({
    ...open,
    pendingQuestionId: "question-newest",
    broadcastId: "broadcast-older"
  }),
  { type: "question", questionId: "question-newest" }
);

const switchedAccount = resolveNannyTalkModal({
  ...open,
  pendingQuestionId: "question-next-account",
  dismissedQuestionIds: [],
  heldQuestionId: null,
  broadcastId: null
});
assert.deepEqual(switchedAccount, { type: "question", questionId: "question-next-account" });
assert.match(overlay, /setActiveQuestionId\(null\)/);
assert.match(overlay, /setDismissedQuestionIds\(\[\]\)/);

assert.deepEqual(
  resolveNannyTalkModal({
    ...open,
    pendingQuestionId: "question-still-pending",
    dismissedQuestionIds: [],
    heldQuestionId: null,
    broadcastId: "broadcast-hidden"
  }),
  { type: "question", questionId: "question-still-pending" }
);
assert.equal(
  resolveNannyTalkModal({
    ...open,
    pendingQuestionId: null,
    broadcastId: "broadcast-hidden",
    hiddenBroadcastIds: ["broadcast-hidden"]
  }),
  null
);
assert.equal(NANNY_TALK_REFRESH_MS >= 10000 && NANNY_TALK_REFRESH_MS <= 30000, true);

const tone = read("lib/broadcast/play-broadcast-arrival-tone.ts");
assert.match(tone, /areSoundAlertsEnabled/);
assert.match(tone, /659\.25/);
assert.match(tone, /catch/);
assert.match(overlay, /rememberBroadcastArrival/);
assert.match(overlay, /playBroadcastArrivalTone/);
assert.match(overlay, /arrivalSoundRef\.current = emptyBroadcastArrivalSound\(\)/);
assert.match(read("components/sitter/SitterBroadcastAlertModal.tsx"), /function playAlertSound/);
assert.doesNotMatch(read("components/broadcast/nanny-talks-frame.tsx"), /data-nanny-speech-tail/);

let sound = emptyBroadcastArrivalSound();
const baselineQuestion = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "question",
  ids: ["question-old"],
  ready: false,
  audible: true
});
assert.equal(baselineQuestion.play, false);
sound = baselineQuestion.state;
const primedQuestion = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "question",
  ids: ["question-old"],
  ready: true,
  audible: true
});
assert.equal(primedQuestion.play, false);
sound = primedQuestion.state;
const primedBroadcast = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "broadcast",
  ids: ["broadcast-old"],
  ready: true,
  audible: true
});
assert.equal(primedBroadcast.play, false);
sound = primedBroadcast.state;
const poll = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "question",
  ids: ["question-old"],
  ready: true,
  audible: true
});
assert.equal(poll.play, false);
sound = poll.state;
const newQuestion = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "question",
  ids: ["question-old", "question-new"],
  ready: true,
  audible: true
});
assert.equal(newQuestion.play, true);
sound = newQuestion.state;
const replayQuestion = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "question",
  ids: ["question-old", "question-new"],
  ready: true,
  audible: true
});
assert.equal(replayQuestion.play, false);
sound = replayQuestion.state;
const hiddenArrival = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "broadcast",
  ids: ["broadcast-old", "broadcast-new"],
  ready: true,
  audible: false
});
assert.equal(hiddenArrival.play, false);
sound = hiddenArrival.state;
const visibleArrival = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "broadcast",
  ids: ["broadcast-old", "broadcast-new"],
  ready: true,
  audible: true
});
assert.equal(visibleArrival.play, true);
sound = visibleArrival.state;
const reconnect = observeBroadcastArrivals(sound, {
  userId: "account-a",
  channel: "broadcast",
  ids: ["broadcast-old", "broadcast-new"],
  ready: true,
  audible: true
});
assert.equal(reconnect.play, false);
const switched = observeBroadcastArrivals(reconnect.state, {
  userId: "account-b",
  channel: "question",
  ids: ["question-new"],
  ready: true,
  audible: true
});
assert.equal(switched.play, false);
const loggedOut = observeBroadcastArrivals(switched.state, {
  userId: null,
  channel: "broadcast",
  ids: ["broadcast-new"],
  ready: true,
  audible: true
});
assert.equal(loggedOut.play, false);
assert.equal(loggedOut.state.userId, null);
assert.match(read("app/parent/messages/page.tsx"), /AnynannySystemConversation/);
assert.match(read("app/sitter/messages/page.tsx"), /AnynannySystemConversation/);
assert.doesNotMatch(overlay, /isOperationalCardsSuppressedRoute\(pathname\)\) return null/);

console.log("nanny talks checks passed");
