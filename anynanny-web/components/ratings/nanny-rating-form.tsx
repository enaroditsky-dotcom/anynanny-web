"use client";

import { useState } from "react";

type Props = {
  sessionId: string;
  nannyName: string;
  parentName: string;
  alreadyRated?: boolean;
};

export function NannyRatingForm({ sessionId, nannyName, parentName, alreadyRated = false }: Props) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(alreadyRated);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        nannyName,
        parentName,
        stars,
        comment
      })
    });

    if (!response.ok) {
      if (response.status === 409) {
        setMessage("This session was already rated.");
        setLocked(true);
      } else {
        setMessage("Could not submit rating. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    const data = (await response.json()) as { profile: { reputationScore: number } };
    setMessage(`Thanks! Updated reputation score: ${data.profile.reputationScore.toFixed(2)} / 5`);
    setComment("");
    setStars(5);
    setLocked(true);
    setSubmitting(false);
  };

  return (
    <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
      <div>
        <p className="mb-2 text-sm font-medium text-navy-900">Rate this nanny</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              className={`rounded-lg px-3 py-1 text-lg ${value <= stars ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-500"} ${locked ? "cursor-not-allowed opacity-70" : ""}`}
              type="button"
              onClick={() => setStars(value)}
              aria-label={`Set ${value} stars`}
              disabled={locked}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-navy-900" htmlFor={`comment-${sessionId}`}>
          Comment
        </label>
        <textarea
          id={`comment-${sessionId}`}
          className="w-full rounded-lg border border-navy-200 p-2 text-sm"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Share your feedback about the nanny..."
          required
          disabled={locked}
        />
      </div>

      <button
        className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={submitting || locked}
      >
        {locked ? "Already Rated" : submitting ? "Submitting..." : "Submit Rating"}
      </button>

      {message ? <p className="text-sm font-medium text-navy-700">{message}</p> : null}
    </form>
  );
}
