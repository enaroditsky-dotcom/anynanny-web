export type NannyRating = {
  sessionId: string;
  nannyName: string;
  parentName: string;
  stars: number;
  comment: string;
  submittedAt: string;
};

export type NannyProfile = {
  anyNannyId: string;
  nannyName: string;
  reputationScore: number;
  totalRatings: number;
  gender: "male" | "female";
  hourlyRateNis: number;
  age: number;
  experienceYears: number;
};

export type SubmitRatingInput = {
  sessionId: string;
  nannyName: string;
  parentName: string;
  stars: number;
  comment: string;
};

export type SortMode = "score_desc" | "score_asc" | "name_asc" | "ratings_desc";

export type UpsertNannyProfileInput = {
  anyNannyId?: string;
  nannyName: string;
  gender: "male" | "female";
  hourlyRateNis: number;
  age: number;
  experienceYears: number;
};
