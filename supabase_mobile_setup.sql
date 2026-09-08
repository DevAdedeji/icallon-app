-- Run this in the Supabase SQL editor before releasing the mobile app.
-- It is safe to rerun. The app needs a public profile row because rooms.host_id
-- references public.users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'Users can create own profile'
  ) THEN
    CREATE POLICY "Users can create own profile" ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid()::text = id);
  END IF;
END $$;

-- A player may only be entered once in a room, including after a reconnect.
CREATE UNIQUE INDEX IF NOT EXISTS players_room_user_unique
  ON public.players (room_id, user_id)
  WHERE user_id IS NOT NULL;

-- Old app versions could create duplicate draft rows during concurrent autosaves.
-- Keep the most recently updated/submitted row for each player and round.
WITH ranked_answers AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY room_id, round_id, player_id
      ORDER BY submitted_at DESC NULLS LAST, updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM public.answers
)
DELETE FROM public.answers AS answer
USING ranked_answers AS ranked
WHERE answer.id = ranked.id AND ranked.row_number > 1;

-- Prevent duplicate answer rows when a device retries an autosave.
CREATE UNIQUE INDEX IF NOT EXISTS answers_player_round_unique
  ON public.answers (room_id, round_id, player_id);
