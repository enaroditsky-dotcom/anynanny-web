import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateSitterBoostProgress,
  hasSavedUpcomingWeekSchedule,
  SITTER_BOOST_CHECKPOINT_LABELS,
  SITTER_PROFILE_BOOST_HREF,
  upcomingScheduleBounds
} from "../lib/sitter/profile-boost-progress";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screen = readFileSync(resolve(root, "components/sitter/sitter-profile-boost-screen.tsx"), "utf8");
const avatar = readFileSync(resolve(root, "components/sitter/sitter-dashboard-avatar.tsx"), "utf8");

const phrases = [
  "🚀 תני בוסט לפרופיל שלך!",
  "רוצה שיותר משפחות יכירו אותך ויבחרו דווקא בך?",
  "💡 המלצות לבוסט",
  "✅ התקדמות בהשלמת הפרופיל",
  "💬 תני למשפחות להכיר אותך באמת",
  "📸 תני פנים לפרופיל שלך",
  "📅 תני לסידור העבודה שלך לעבוד בשבילך",
  "סידור עבודה מעודכן עוזר לך לנהל את הזמינות שלך בצורה מסודרת, לתכנן את השבוע ולהימנע מהתחייבויות חופפות.",
  "כך תוכלי לדעת מתי את פנויה לקבל עבודות חדשות, ולהגיב במהירות לפניות שמתאימות ללוח הזמנים שלך.",
  "כמה דקות של עדכון בכל שבוע יעזרו לך להיות מוכנה להזדמנות העבודה הבאה!",
  "⭐ צברי דירוגים — כל כוכב חשוב!",
  "🤝 תגרמי למשפחה שאת כבר עובדת אצלה להשתמש ב־AnyNanny!",
  "✍️ חוות דעת — תני להורים מרוצים לספר עלייך!",
  "🌟 המוניטין שלך ממשיך לעבוד בשבילך — גם כשהמשמרת נגמרת!",
  "💚 אז מה הסוד לפרופיל שבולט?",
  "תמונה טובה + פרופיל מלא + זמינות מעודכנת + דירוגים + חוות דעת.",
  "כל צעד שאת משלימה מחזק את כרטיס הביקור שלך ועוזר למשפחות להכיר אותך טוב יותר.",
  "מתוך",
  "SITTER_BOOST_CHECKPOINT_LABELS"
];
for (const phrase of phrases) assert.ok(screen.includes(phrase), phrase);
assert.deepEqual([...SITTER_BOOST_CHECKPOINT_LABELS], [
  "העליתי תמונת פרופיל.",
  "מילאתי את הפרטים האישיים שלי.",
  "כתבתי כמה מילים על עצמי.",
  "מילאתי את פרטי הניסיון שלי.",
  "השלמתי את פרטי הכישורים וההעדפות שלי.",
  "עדכנתי ושמרתי את סידור העבודה לשבוע הקרוב.",
  "קיבלתי לפחות דירוג אחד ממשפחה.",
  "קיבלתי לפחות חוות דעת כתובה אחת."
]);
assert.doesNotMatch(screen, /אימות זהות|זהות מאומתת|identity_verified/);
assert.doesNotMatch(screen, /לחיפושים של הורים|לפי מיקום, תאריכים ושעות פנויות/);
assert.match(avatar, /SITTER_PROFILE_BOOST_HREF/);
assert.match(avatar, /rotate\(-90 50 50\)/);
assert.equal(SITTER_PROFILE_BOOST_HREF, "/sitter/profile-boost");

const now = new Date(2026, 10, 25);
assert.deepEqual(upcomingScheduleBounds(now), { start: "2026-11-25", end: "2026-12-01" });
assert.equal(hasSavedUpcomingWeekSchedule(["2026-11-24"], now), false);
assert.equal(hasSavedUpcomingWeekSchedule(["2026-11-28"], now), true);

const empty = evaluateSitterBoostProgress({
  profile: {
    firstName: "   ",
    lastName: "",
    bio: "  ",
    yearsExperience: 0,
    hasCar: false
  },
  savedAvailabilityDates: ["2026-11-01"],
  publishedRatingCount: 0,
  publishedWrittenReviewCount: 0,
  now
});
assert.equal(empty.completed, 0);
assert.equal(empty.percent, 0);
assert.ok(empty.checkpoints.every((state) => state === "incomplete"));

const partial = evaluateSitterBoostProgress({
  profile: {
    accountAvatarUrl: " https://cdn.example/photo.jpg ",
    firstName: "נועה",
    lastName: "כהן",
    birthDate: "1994-04-02",
    bio: "",
    yearsExperienceBand: "3",
    hasCar: false,
    languages: []
  },
  savedAvailabilityDates: [],
  publishedRatingCount: 2,
  publishedWrittenReviewCount: 0,
  now
});
assert.deepEqual(partial.checkpoints, [
  "complete",
  "complete",
  "incomplete",
  "complete",
  "incomplete",
  "incomplete",
  "complete",
  "incomplete"
]);
assert.equal(partial.completed, 4);
assert.equal(partial.percent, 50);

const full = evaluateSitterBoostProgress({
  profile: {
    profileAvatarUrl: "/photo.png",
    firstName: "נועה",
    lastName: "כהן",
    homeCity: "חיפה",
    bio: "אוהבת לעבוד עם ילדים",
    experienceAgeGroups: ["toddlers"],
    preferredAges: "3-6",
    homeworkHelp: false
  },
  savedAvailabilityDates: ["2026-11-30"],
  publishedRatingCount: 1,
  publishedWrittenReviewCount: 1,
  now
});
assert.equal(full.completed, 8);
assert.equal(full.percent, 100);

const unknown = evaluateSitterBoostProgress({
  profile: null,
  savedAvailabilityDates: null,
  publishedRatingCount: null,
  publishedWrittenReviewCount: null,
  now
});
assert.equal(unknown.completed, 0);
assert.ok(unknown.checkpoints.every((state) => state === "unknown"));

console.log("sitter profile boost checks passed.");
