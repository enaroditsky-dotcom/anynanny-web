-- Parents must be able to pause/fill/cancel their own broadcasts.
-- Table already had INSERT+SELECT RLS; UPDATE was missing, so client
-- updates affected 0 rows with no PostgREST error.
CREATE POLICY "Parents can update their own alerts"
ON public.broadcast_alerts
FOR UPDATE
TO authenticated
USING (auth.uid() = parent_id)
WITH CHECK (auth.uid() = parent_id);
