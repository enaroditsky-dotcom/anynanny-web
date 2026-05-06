"use client";

import { useMemo, useState } from "react";
import type { NannyProfile, SortMode } from "@/lib/ratings/types";

type Props = {
  profiles: NannyProfile[];
};

export function ReputationBoard({ profiles }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("score_desc");
  const [minScore, setMinScore] = useState(0);

  const visibleProfiles = useMemo(() => {
    const filtered = profiles.filter((profile) => profile.reputationScore >= minScore);
    const sorted = [...filtered];

    sorted.sort((a, b) => {
      if (sortMode === "score_desc") return b.reputationScore - a.reputationScore;
      if (sortMode === "score_asc") return a.reputationScore - b.reputationScore;
      if (sortMode === "ratings_desc") return b.totalRatings - a.totalRatings;
      return a.nannyName.localeCompare(b.nannyName);
    });

    return sorted;
  }, [profiles, sortMode, minScore]);

  return (
    <div>
      <div className="mb-3 grid gap-3 rounded-xl border border-navy-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm text-navy-900">
          Sort by
          <select
            className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
          >
            <option value="score_desc">Top rated first</option>
            <option value="score_asc">Lowest rated first</option>
            <option value="ratings_desc">Most ratings first</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </label>

        <label className="text-sm text-navy-900">
          Minimum reputation score
          <input
            className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm"
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={minScore}
            onChange={(event) => setMinScore(Number(event.target.value))}
          />
        </label>
      </div>

      {visibleProfiles.length === 0 ? (
        <p className="rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-700 shadow-sm">
          No nannies match the current filter.
        </p>
      ) : (
        <div className="space-y-2">
          {visibleProfiles.map((profile) => (
            <div key={profile.nannyName} className="rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-800 shadow-sm">
              {profile.nannyName}: {profile.reputationScore.toFixed(2)} / 5 ({profile.totalRatings} ratings)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
