import { appendRating, listProfiles, listRatings, saveProfiles } from "@/lib/ratings/repository";
import type { NannyProfile, NannyRating, SubmitRatingInput, UpsertNannyProfileInput } from "@/lib/ratings/types";

export class DuplicateSessionRatingError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} was already rated.`);
    this.name = "DuplicateSessionRatingError";
  }
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 6) || "sitter";
  const checksum = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 10000;
  return `ANN-${base}-${String(checksum).padStart(4, "0")}`;
}

function normalizeProfile(profile: NannyProfile): NannyProfile {
  const safeName = String(profile.nannyName ?? "").trim() || "sitter";
  const generatedId = slugId(safeName);
  return {
    anyNannyId: String(profile.anyNannyId ?? "").trim() || generatedId,
    nannyName: profile.nannyName,
    reputationScore: Number.isFinite(profile.reputationScore) ? profile.reputationScore : 0,
    totalRatings: Number.isFinite(profile.totalRatings) ? profile.totalRatings : 0,
    gender: profile.gender === "male" ? "male" : "female",
    hourlyRateNis: Number.isFinite(profile.hourlyRateNis) ? profile.hourlyRateNis : 55,
    age: Number.isFinite(profile.age) ? profile.age : 24,
    experienceYears: Number.isFinite(profile.experienceYears) ? profile.experienceYears : 1
  };
}

export async function submitNannyRating(input: SubmitRatingInput): Promise<{ rating: NannyRating; profile: NannyProfile }> {
  const existingRatings = await listRatings();
  const duplicate = existingRatings.some((item) => item.sessionId === input.sessionId);

  if (duplicate) {
    throw new DuplicateSessionRatingError(input.sessionId);
  }

  const rating: NannyRating = {
    sessionId: input.sessionId,
    nannyName: input.nannyName.trim(),
    parentName: input.parentName.trim(),
    stars: input.stars,
    comment: input.comment.trim(),
    submittedAt: new Date().toISOString()
  };

  await appendRating(rating);

  const profiles = await listProfiles();
  const targetIndex = profiles.findIndex((item) => item.nannyName === rating.nannyName);

  if (targetIndex === -1) {
    const created: NannyProfile = {
      anyNannyId: `ANN-${Date.now().toString().slice(-6)}`,
      nannyName: rating.nannyName,
      reputationScore: rating.stars,
      totalRatings: 1,
      gender: "female",
      hourlyRateNis: 55,
      age: 24,
      experienceYears: 1
    };
    profiles.push(created);
    await saveProfiles(profiles);
    return { rating, profile: created };
  }

  const profile = profiles[targetIndex];
  const totalScoreBefore = profile.reputationScore * profile.totalRatings;
  const newTotalRatings = profile.totalRatings + 1;
  const newScore = roundTwo((totalScoreBefore + rating.stars) / newTotalRatings);

  const updated: NannyProfile = {
    ...profile,
    totalRatings: newTotalRatings,
    reputationScore: newScore
  };

  profiles[targetIndex] = updated;
  await saveProfiles(profiles);

  return { rating, profile: updated };
}

export async function getNannyProfiles(): Promise<NannyProfile[]> {
  const profiles = await listProfiles();
  return profiles.map(normalizeProfile);
}

export async function getRatedSessionIds(): Promise<Set<string>> {
  const ratings = await listRatings();
  return new Set(ratings.map((item) => item.sessionId));
}

export async function upsertNannyProfile(input: UpsertNannyProfileInput): Promise<NannyProfile> {
  const profiles = await getNannyProfiles();
  const index = profiles.findIndex((profile) => profile.nannyName === input.nannyName.trim());
  const base = index === -1 ? undefined : profiles[index];
  const nextId =
    String(input.anyNannyId ?? "").trim() ||
    base?.anyNannyId ||
    slugId(input.nannyName);
  const next: NannyProfile = {
    anyNannyId: nextId,
    nannyName: input.nannyName.trim(),
    reputationScore: base?.reputationScore ?? 0,
    totalRatings: base?.totalRatings ?? 0,
    gender: input.gender,
    hourlyRateNis: input.hourlyRateNis,
    age: input.age,
    experienceYears: input.experienceYears
  };
  if (index === -1) {
    profiles.push(next);
  } else {
    profiles[index] = next;
  }
  await saveProfiles(profiles);
  return next;
}
