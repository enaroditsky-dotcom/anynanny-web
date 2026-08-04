"use client";

import { useState } from "react";

type Props = {
  sessionId: string;
  nannyName: string;
  parentName: string;
  alreadyRated?: boolean;
};

export function NannyRatingForm({ sessionId, nannyName, parentName, alreadyRated = false }: Props) {
  const [ratingValue, setRatingValue] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(alreadyRated);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSubmitting(true);

    const commentTrimmed = comment.trim() ? comment.trim().slice(0, 2000) : null;
    const payload = {
      session_id: sessionId.trim(),
      rating: ratingValue,
      comment: commentTrimmed
    };

    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error("[NannyRatingForm] submit failed", response.status, bodyText);
      if (response.status === 409) {
        setLocked(true);
      }
      setSubmitting(false);
      return;
    }

    setComment("");
    setRatingValue(5);
    setLocked(true);
    setSubmitting(false);
  };

  return (
    <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
      <div>
        <p className="mb-2 text-sm font-medium text-navy-900">
          Rate this nanny{nannyName ? `: ${nannyName}` : ""}
          {parentName ? <span className="block text-xs font-normal text-slate-500">From {parentName}</span> : null}
        </p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              className={`rounded-lg px-3 py-1 text-lg ${value <= ratingValue ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-500"} ${locked ? "cursor-not-allowed opacity-70" : ""}`}
              type="button"
              onClick={() => setRatingValue(value)}
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
    </form>
  );
}
