-- Run this in the Supabase SQL editor before releasing the mobile app.
-- Run supabase_game_policies.sql first. This script is safe to rerun. The app
-- needs a public profile row because rooms.host_id references public.users.

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

-- Track which completed game belongs to a room when the same group rematches.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS game_number integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.game_results (
  id text PRIMARY KEY,
  room_id text NOT NULL,
  room_code text NOT NULL,
  game_number integer NOT NULL,
  max_rounds integer NOT NULL,
  player_count integer NOT NULL,
  completed_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT game_results_room_game_unique UNIQUE (room_id, game_number),
  CONSTRAINT game_results_game_number_positive CHECK (game_number > 0),
  CONSTRAINT game_results_player_count_positive CHECK (player_count > 0)
);

CREATE TABLE IF NOT EXISTS public.player_game_results (
  id text PRIMARY KEY,
  game_result_id text NOT NULL REFERENCES public.game_results(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  score integer NOT NULL,
  position integer NOT NULL,
  is_winner boolean NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT player_game_results_game_user_unique UNIQUE (game_result_id, user_id),
  CONSTRAINT player_game_results_score_nonnegative CHECK (score >= 0),
  CONSTRAINT player_game_results_position_positive CHECK (position > 0)
);

CREATE INDEX IF NOT EXISTS player_game_results_user_history_idx
  ON public.player_game_results (user_id, created_at DESC);

ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their game results" ON public.game_results;
CREATE POLICY "Participants can view their game results" ON public.game_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.player_game_results AS participant
      WHERE participant.game_result_id = game_results.id
        AND participant.user_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "Players can view their result rows" ON public.player_game_results;
CREATE POLICY "Players can view their result rows" ON public.player_game_results
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- History is written only by trusted game functions.
REVOKE INSERT, UPDATE, DELETE ON public.game_results FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_game_results FROM anon, authenticated;

-- Create the room and its host player atomically. Generating the code in the
-- database removes the client-side check/insert race around unique room codes.
CREATE OR REPLACE FUNCTION public.create_game_room(
  requested_max_rounds integer,
  requested_time_per_round integer
)
RETURNS TABLE (room_id text, room_code text, is_host boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  created_room_id text;
  generated_code text;
  profile_name text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF requested_max_rounds NOT IN (3, 5, 7, 10) THEN
    RAISE EXCEPTION 'Invalid number of rounds' USING ERRCODE = '22023';
  END IF;
  IF requested_time_per_round NOT IN (30, 60, 90, 120) THEN
    RAISE EXCEPTION 'Invalid round timer' USING ERRCODE = '22023';
  END IF;

  SELECT profile.username
  INTO profile_name
  FROM public.users AS profile
  WHERE profile.id = caller_id::text;

  IF profile_name IS NULL THEN
    RAISE EXCEPTION 'Player profile not found' USING ERRCODE = '23503';
  END IF;

  FOR attempt IN 1..10 LOOP
    created_room_id := gen_random_uuid()::text;
    SELECT string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::integer + 1, 1),
      ''
    )
    INTO generated_code
    FROM generate_series(1, 6);

    BEGIN
      INSERT INTO public.rooms (
        id, code, host_id, status, max_rounds, time_per_round, current_round
      ) VALUES (
        created_room_id,
        generated_code,
        caller_id::text,
        'lobby',
        requested_max_rounds,
        requested_time_per_round,
        0
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      created_room_id := NULL;
    END;
  END LOOP;

  IF created_room_id IS NULL THEN
    RAISE EXCEPTION 'Could not allocate a unique room code';
  END IF;

  INSERT INTO public.players (
    id, room_id, user_id, display_name, is_host, total_score, is_connected
  ) VALUES (
    gen_random_uuid()::text,
    created_room_id,
    caller_id::text,
    profile_name,
    true,
    0,
    true
  );

  RETURN QUERY SELECT created_room_id, generated_code, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_game_room(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_game_room(integer, integer) TO authenticated;

-- Join and reconnect in one transaction. The database derives identity,
-- display name, and host status instead of trusting values from the device.
CREATE OR REPLACE FUNCTION public.join_game_room(requested_room_code text)
RETURNS TABLE (room_id text, room_code text, player_id text, is_host boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  matched_room_id text;
  matched_room_code text;
  matched_room_host_id text;
  matched_room_status text;
  joined_player_id text;
  joined_is_host boolean;
  profile_name text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF upper(trim(requested_room_code)) !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid room code' USING ERRCODE = '22023';
  END IF;

  SELECT room.id, room.code, room.host_id, room.status
  INTO matched_room_id, matched_room_code, matched_room_host_id, matched_room_status
  FROM public.rooms AS room
  WHERE room.code = upper(trim(requested_room_code))
  FOR UPDATE;

  IF matched_room_id IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;
  IF matched_room_status = 'ended' THEN
    RAISE EXCEPTION 'Room has ended' USING ERRCODE = '55000';
  END IF;

  SELECT profile.username
  INTO profile_name
  FROM public.users AS profile
  WHERE profile.id = caller_id::text;

  IF profile_name IS NULL THEN
    RAISE EXCEPTION 'Player profile not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.players (
    id, room_id, user_id, display_name, is_host, total_score, is_connected
  ) VALUES (
    gen_random_uuid()::text,
    matched_room_id,
    caller_id::text,
    profile_name,
    matched_room_host_id = caller_id::text,
    0,
    true
  )
  ON CONFLICT ON CONSTRAINT unique_player_per_room
  DO UPDATE SET is_connected = true
  RETURNING players.id, players.is_host
  INTO joined_player_id, joined_is_host;

  RETURN QUERY
    SELECT matched_room_id, matched_room_code, joined_player_id, joined_is_host;
END;
$$;

REVOKE ALL ON FUNCTION public.join_game_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_game_room(text) TO authenticated;

-- Host-only state transition from lobby to gameplay.
CREATE OR REPLACE FUNCTION public.start_game(requested_room_id text)
RETURNS TABLE (room_id text, room_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rooms AS room
  SET status = 'playing', started_at = COALESCE(room.started_at, now()), current_round = 0
  WHERE room.id = requested_room_id
    AND room.host_id = caller_id::text
    AND room.status = 'lobby';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the host can start a lobby game' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT requested_room_id, 'playing'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.start_game(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_game(text) TO authenticated;

-- Start one round and update the room pointer in a single transaction.
CREATE OR REPLACE FUNCTION public.start_game_round(
  requested_room_id text,
  requested_letter text
)
RETURNS TABLE (round_id text, round_number integer, letter text, started_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  room_record public.rooms%ROWTYPE;
  previous_round_status text;
  created_round_id text := gen_random_uuid()::text;
  next_round_number integer;
  normalized_letter text := upper(trim(requested_letter));
  round_started_at timestamptz := now();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF normalized_letter !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Choose one letter from A to Z' USING ERRCODE = '22023';
  END IF;

  SELECT room.* INTO room_record
  FROM public.rooms AS room
  WHERE room.id = requested_room_id
  FOR UPDATE;

  IF room_record.id IS NULL OR room_record.host_id <> caller_id::text THEN
    RAISE EXCEPTION 'Only the host can start a round' USING ERRCODE = '42501';
  END IF;
  IF room_record.status <> 'playing' THEN
    RAISE EXCEPTION 'The game is not active' USING ERRCODE = '55000';
  END IF;

  IF room_record.current_round_id IS NOT NULL THEN
    SELECT game_round.status INTO previous_round_status
    FROM public.rounds AS game_round
    WHERE game_round.id = room_record.current_round_id;

    IF previous_round_status <> 'ended' THEN
      RAISE EXCEPTION 'Finish the current round before starting another' USING ERRCODE = '55000';
    END IF;
  END IF;

  next_round_number := room_record.current_round + 1;
  IF next_round_number > room_record.max_rounds THEN
    RAISE EXCEPTION 'All configured rounds are complete' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rounds (
    id, room_id, round_number, letter, status, started_at
  ) VALUES (
    created_round_id,
    requested_room_id,
    next_round_number,
    normalized_letter,
    'active',
    round_started_at
  );

  UPDATE public.rooms
  SET current_round = next_round_number, current_round_id = created_round_id
  WHERE id = requested_room_id;

  RETURN QUERY
    SELECT created_round_id, next_round_number, normalized_letter, round_started_at;
END;
$$;

REVOKE ALL ON FUNCTION public.start_game_round(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_game_round(text, text) TO authenticated;

-- Atomically save one authenticated player's draft or final submission.
CREATE OR REPLACE FUNCTION public.save_game_answers(
  requested_room_id text,
  requested_round_id text,
  requested_name text,
  requested_animal text,
  requested_place text,
  requested_thing text,
  requested_submit boolean DEFAULT false
)
RETURNS TABLE (answer_id text, submitted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  player_record public.players%ROWTYPE;
  round_record public.rounds%ROWTYPE;
  saved_answer_id text;
  saved_submitted_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT player.* INTO player_record
  FROM public.players AS player
  WHERE player.room_id = requested_room_id
    AND player.user_id = caller_id::text;

  IF player_record.id IS NULL THEN
    RAISE EXCEPTION 'Join the room before submitting answers' USING ERRCODE = '42501';
  END IF;

  SELECT game_round.* INTO round_record
  FROM public.rounds AS game_round
  WHERE game_round.id = requested_round_id
    AND game_round.room_id = requested_room_id
  FOR UPDATE;

  IF round_record.id IS NULL OR round_record.status <> 'active' THEN
    RAISE EXCEPTION 'This round is not accepting answers' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.answers (
    id, room_id, round_id, player_id, player_name,
    name, animal, place, thing, submitted_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    requested_room_id,
    requested_round_id,
    player_record.id,
    player_record.display_name,
    NULLIF(left(trim(requested_name), 80), ''),
    NULLIF(left(trim(requested_animal), 80), ''),
    NULLIF(left(trim(requested_place), 80), ''),
    NULLIF(left(trim(requested_thing), 80), ''),
    CASE WHEN requested_submit THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (room_id, round_id, player_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    animal = EXCLUDED.animal,
    place = EXCLUDED.place,
    thing = EXCLUDED.thing,
    submitted_at = CASE
      WHEN requested_submit THEN COALESCE(answers.submitted_at, now())
      ELSE answers.submitted_at
    END,
    updated_at = now()
  WHERE answers.submitted_at IS NULL
  RETURNING answers.id, answers.submitted_at
  INTO saved_answer_id, saved_submitted_at;

  IF saved_answer_id IS NULL THEN
    RAISE EXCEPTION 'Answers have already been submitted' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY SELECT saved_answer_id, saved_submitted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_game_answers(text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_game_answers(text, text, text, text, text, text, boolean) TO authenticated;

-- The host may close early. Any joined player may close an expired round so a
-- backgrounded or disconnected host cannot leave everyone stuck indefinitely.
CREATE OR REPLACE FUNCTION public.close_game_submissions(requested_round_id text)
RETURNS TABLE (round_id text, round_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  round_record public.rounds%ROWTYPE;
  room_record public.rooms%ROWTYPE;
  is_participant boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT game_round.* INTO round_record
  FROM public.rounds AS game_round
  WHERE game_round.id = requested_round_id
  FOR UPDATE;

  IF round_record.id IS NULL THEN
    RAISE EXCEPTION 'Round not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT room.* INTO room_record
  FROM public.rooms AS room
  WHERE room.id = round_record.room_id;

  SELECT EXISTS (
    SELECT 1 FROM public.players AS player
    WHERE player.room_id = room_record.id AND player.user_id = caller_id::text
  ) INTO is_participant;

  IF NOT is_participant THEN
    RAISE EXCEPTION 'Join the room before changing round state' USING ERRCODE = '42501';
  END IF;
  IF room_record.host_id <> caller_id::text
    AND now() < round_record.started_at + make_interval(secs => room_record.time_per_round) THEN
    RAISE EXCEPTION 'Only the host can close submissions early' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rounds
  SET status = 'submitted', ended_at = COALESCE(ended_at, now())
  WHERE id = requested_round_id AND status = 'active';

  RETURN QUERY SELECT requested_round_id, 'submitted'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.close_game_submissions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_game_submissions(text) TO authenticated;

-- The database computes points after changing one host-reviewed category.
CREATE OR REPLACE FUNCTION public.score_game_answer(
  requested_answer_id text,
  requested_category text,
  requested_valid boolean
)
RETURNS TABLE (answer_id text, points_earned integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  answer_record public.answers%ROWTYPE;
  room_host_id text;
  calculated_points integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF requested_category NOT IN ('name', 'animal', 'place', 'thing') THEN
    RAISE EXCEPTION 'Invalid answer category' USING ERRCODE = '22023';
  END IF;

  SELECT answer.* INTO answer_record
  FROM public.answers AS answer
  WHERE answer.id = requested_answer_id
  FOR UPDATE;

  IF answer_record.id IS NULL THEN
    RAISE EXCEPTION 'Answer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT room.host_id INTO room_host_id
  FROM public.rooms AS room
  JOIN public.rounds AS game_round ON game_round.room_id = room.id
  WHERE room.id = answer_record.room_id
    AND game_round.id = answer_record.round_id
    AND game_round.status = 'submitted';

  IF room_host_id IS NULL OR room_host_id <> caller_id::text THEN
    RAISE EXCEPTION 'Only the host can score submitted answers' USING ERRCODE = '42501';
  END IF;

  UPDATE public.answers AS answer
  SET
    name_valid = CASE WHEN requested_category = 'name' THEN requested_valid ELSE answer.name_valid END,
    animal_valid = CASE WHEN requested_category = 'animal' THEN requested_valid ELSE answer.animal_valid END,
    place_valid = CASE WHEN requested_category = 'place' THEN requested_valid ELSE answer.place_valid END,
    thing_valid = CASE WHEN requested_category = 'thing' THEN requested_valid ELSE answer.thing_valid END,
    validated_at = now(),
    updated_at = now()
  WHERE answer.id = requested_answer_id
  RETURNING (
    (CASE WHEN answer.name_valid THEN 10 ELSE 0 END) +
    (CASE WHEN answer.animal_valid THEN 10 ELSE 0 END) +
    (CASE WHEN answer.place_valid THEN 10 ELSE 0 END) +
    (CASE WHEN answer.thing_valid THEN 10 ELSE 0 END)
  ) INTO calculated_points;

  UPDATE public.answers
  SET points_earned = calculated_points
  WHERE id = requested_answer_id;

  RETURN QUERY SELECT requested_answer_id, calculated_points;
END;
$$;

REVOKE ALL ON FUNCTION public.score_game_answer(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.score_game_answer(text, text, boolean) TO authenticated;

-- Commit a round and refresh every player's total in one transaction.
CREATE OR REPLACE FUNCTION public.confirm_game_round(requested_round_id text)
RETURNS TABLE (round_id text, round_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  round_record public.rounds%ROWTYPE;
  room_host_id text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT game_round.* INTO round_record
  FROM public.rounds AS game_round
  WHERE game_round.id = requested_round_id
  FOR UPDATE;

  SELECT room.host_id INTO room_host_id
  FROM public.rooms AS room
  WHERE room.id = round_record.room_id;

  IF round_record.id IS NULL OR round_record.status <> 'submitted'
    OR room_host_id <> caller_id::text THEN
    RAISE EXCEPTION 'Only the host can confirm a submitted round' USING ERRCODE = '42501';
  END IF;

  UPDATE public.players AS player
  SET total_score = COALESCE((
    SELECT sum(answer.points_earned)
    FROM public.answers AS answer
    WHERE answer.room_id = round_record.room_id
      AND answer.player_id = player.id
  ), 0)
  WHERE player.room_id = round_record.room_id;

  UPDATE public.rounds
  SET status = 'ended', ended_at = COALESCE(ended_at, now())
  WHERE id = requested_round_id;

  RETURN QUERY SELECT requested_round_id, 'ended'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_game_round(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_game_round(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_game(requested_room_id text)
RETURNS TABLE (room_id text, room_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  room_record public.rooms%ROWTYPE;
  result_id text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT room.* INTO room_record
  FROM public.rooms AS room
  WHERE room.id = requested_room_id
  FOR UPDATE;

  IF room_record.id IS NULL OR room_record.host_id <> caller_id::text
    OR room_record.status NOT IN ('playing', 'ended') THEN
    RAISE EXCEPTION 'Only the host can end an active game' USING ERRCODE = '42501';
  END IF;

  IF room_record.status = 'playing' THEN
    UPDATE public.rooms AS room
    SET status = 'ended', ended_at = COALESCE(room.ended_at, now())
    WHERE room.id = requested_room_id
    RETURNING room.* INTO room_record;
  END IF;

  INSERT INTO public.game_results (
    id, room_id, room_code, game_number, max_rounds, player_count, completed_at
  )
  SELECT
    gen_random_uuid()::text,
    room_record.id,
    room_record.code,
    room_record.game_number,
    room_record.max_rounds,
    count(*)::integer,
    COALESCE(room_record.ended_at, now())
  FROM public.players AS player
  WHERE player.room_id = room_record.id
  ON CONFLICT ON CONSTRAINT game_results_room_game_unique DO NOTHING;

  SELECT result.id INTO result_id
  FROM public.game_results AS result
  WHERE result.room_id = room_record.id
    AND result.game_number = room_record.game_number;

  INSERT INTO public.player_game_results (
    id, game_result_id, user_id, display_name, score, position, is_winner, created_at
  )
  SELECT
    gen_random_uuid()::text,
    result_id,
    ranked.user_id,
    ranked.display_name,
    ranked.total_score,
    ranked.position,
    ranked.position = 1,
    COALESCE(room_record.ended_at, now())
  FROM (
    SELECT
      player.user_id,
      player.display_name,
      player.total_score,
      row_number() OVER (
        ORDER BY player.total_score DESC, player.joined_at ASC, player.id ASC
      )::integer AS position
    FROM public.players AS player
    WHERE player.room_id = room_record.id
      AND player.user_id IS NOT NULL
  ) AS ranked
  ON CONFLICT (game_result_id, user_id) DO NOTHING;

  RETURN QUERY SELECT requested_room_id, 'ended'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.end_game(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_game(text) TO authenticated;

-- Keep the group together while resetting only the live state. Completed
-- scores remain available in the immutable history snapshot created above.
CREATE OR REPLACE FUNCTION public.request_game_rematch(requested_room_id text)
RETURNS TABLE (room_id text, room_status text, game_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  room_record public.rooms%ROWTYPE;
  next_game_number integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT room.* INTO room_record
  FROM public.rooms AS room
  WHERE room.id = requested_room_id
  FOR UPDATE;

  IF room_record.id IS NULL OR room_record.host_id <> caller_id::text THEN
    RAISE EXCEPTION 'Only the host can request a rematch' USING ERRCODE = '42501';
  END IF;

  -- A repeated request after the reset returns the same state instead of
  -- incrementing the game number again.
  IF room_record.status = 'lobby' AND room_record.current_round = 0
    AND room_record.started_at IS NULL THEN
    RETURN QUERY SELECT room_record.id, 'lobby'::text, room_record.game_number;
    RETURN;
  END IF;

  IF room_record.status <> 'ended' THEN
    RAISE EXCEPTION 'Finish the game before requesting a rematch' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.game_results AS result
    WHERE result.room_id = room_record.id
      AND result.game_number = room_record.game_number
  ) THEN
    RAISE EXCEPTION 'The completed game result is not ready' USING ERRCODE = '55000';
  END IF;

  next_game_number := room_record.game_number + 1;

  UPDATE public.rooms AS room
  SET
    status = 'lobby',
    game_number = next_game_number,
    current_round = 0,
    current_round_id = NULL,
    started_at = NULL,
    ended_at = NULL
  WHERE room.id = requested_room_id;

  DELETE FROM public.rounds AS game_round
  WHERE game_round.room_id = requested_room_id;

  UPDATE public.players AS player
  SET total_score = 0, is_connected = true
  WHERE player.room_id = requested_room_id;

  RETURN QUERY SELECT requested_room_id, 'lobby'::text, next_game_number;
END;
$$;

REVOKE ALL ON FUNCTION public.request_game_rematch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_game_rematch(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_game_stats()
RETURNS TABLE (
  games_played bigint,
  wins bigint,
  total_points bigint,
  best_score integer,
  current_win_streak bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ordered_results AS (
    SELECT
      result.is_winner,
      row_number() OVER (
        ORDER BY game.completed_at DESC, result.id DESC
      ) AS recent_position
    FROM public.player_game_results AS result
    JOIN public.game_results AS game ON game.id = result.game_result_id
    WHERE result.user_id = auth.uid()::text
  ), totals AS (
    SELECT
      count(*) AS games_played,
      count(*) FILTER (WHERE result.is_winner) AS wins,
      COALESCE(sum(result.score), 0) AS total_points,
      COALESCE(max(result.score), 0) AS best_score
    FROM public.player_game_results AS result
    WHERE result.user_id = auth.uid()::text
  )
  SELECT
    totals.games_played,
    totals.wins,
    totals.total_points,
    totals.best_score,
    COALESCE(
      (SELECT min(recent_position) - 1 FROM ordered_results WHERE NOT is_winner),
      (SELECT count(*) FROM ordered_results)
    ) AS current_win_streak
  FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_my_game_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_game_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_match_history(requested_limit integer DEFAULT 20)
RETURNS TABLE (
  game_result_id text,
  room_code text,
  game_number integer,
  completed_at timestamp,
  score integer,
  placement integer,
  is_winner boolean,
  player_count integer,
  winner_name text,
  winner_score integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  bounded_limit integer := least(greatest(COALESCE(requested_limit, 20), 1), 50);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    game.id,
    game.room_code,
    game.game_number,
    game.completed_at,
    mine.score,
    mine.position,
    mine.is_winner,
    game.player_count,
    winner.display_name,
    winner.score
  FROM public.player_game_results AS mine
  JOIN public.game_results AS game ON game.id = mine.game_result_id
  JOIN LATERAL (
    SELECT result.display_name, result.score
    FROM public.player_game_results AS result
    WHERE result.game_result_id = game.id
    ORDER BY result.position ASC
    LIMIT 1
  ) AS winner ON true
  WHERE mine.user_id = caller_id::text
  ORDER BY game.completed_at DESC, game.id DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_match_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_match_history(integer) TO authenticated;
