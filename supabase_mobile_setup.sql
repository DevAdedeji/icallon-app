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

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS category_pack text NOT NULL DEFAULT 'classic';

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS category_labels jsonb NOT NULL
  DEFAULT '["Name", "Animal", "Place", "Thing"]'::jsonb;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 8;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp NOT NULL DEFAULT now();

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

CREATE TABLE IF NOT EXISTS public.solo_results (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  difficulty text NOT NULL,
  category_pack text NOT NULL,
  player_score integer NOT NULL,
  opponent_score integer NOT NULL,
  won boolean NOT NULL,
  challenge_date date,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT solo_results_mode_valid CHECK (mode IN ('solo', 'daily')),
  CONSTRAINT solo_results_difficulty_valid CHECK (difficulty IN ('easy', 'medium', 'hard')),
  CONSTRAINT solo_results_pack_valid CHECK (category_pack IN ('classic', 'world', 'food', 'entertainment')),
  CONSTRAINT solo_results_player_score_valid CHECK (player_score BETWEEN 0 AND 120),
  CONSTRAINT solo_results_opponent_score_valid CHECK (opponent_score BETWEEN 0 AND 120),
  CONSTRAINT solo_results_daily_date_valid CHECK (
    (mode = 'daily' AND challenge_date IS NOT NULL)
    OR (mode = 'solo' AND challenge_date IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS player_game_results_user_history_idx
  ON public.player_game_results (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS solo_results_user_history_idx
  ON public.solo_results (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS solo_results_daily_user_date_unique
  ON public.solo_results (user_id, challenge_date)
  WHERE mode = 'daily';

ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_results ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Players can view their solo results" ON public.solo_results;
CREATE POLICY "Players can view their solo results" ON public.solo_results
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- History is written only by trusted game functions.
REVOKE INSERT, UPDATE, DELETE ON public.game_results FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_game_results FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.solo_results FROM anon, authenticated;

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

-- Category-aware room creation. The existing function remains available for
-- older clients while current clients use this explicit versioned contract.
CREATE OR REPLACE FUNCTION public.create_game_room_v2(
  requested_max_rounds integer,
  requested_time_per_round integer,
  requested_category_pack text,
  requested_category_labels jsonb
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
  normalized_pack text := lower(trim(requested_category_pack));
  normalized_labels jsonb;
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
  IF normalized_pack NOT IN ('classic', 'world', 'food', 'entertainment', 'custom') THEN
    RAISE EXCEPTION 'Invalid category pack' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(requested_category_labels) <> 'array'
    OR jsonb_array_length(requested_category_labels) <> 4
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(requested_category_labels) AS label
      WHERE length(trim(label)) < 1 OR length(trim(label)) > 24
    )
    OR (SELECT count(DISTINCT lower(trim(label))) FROM jsonb_array_elements_text(requested_category_labels) AS label) <> 4 THEN
    RAISE EXCEPTION 'Four different category labels are required' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(trim(label) ORDER BY position)
  INTO normalized_labels
  FROM jsonb_array_elements_text(requested_category_labels) WITH ORDINALITY AS item(label, position);

  SELECT profile.username INTO profile_name
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
    ) INTO generated_code
    FROM generate_series(1, 6);

    BEGIN
      INSERT INTO public.rooms (
        id, code, host_id, status, max_rounds, time_per_round, current_round,
        category_pack, category_labels
      ) VALUES (
        created_room_id, generated_code, caller_id::text, 'lobby',
        requested_max_rounds, requested_time_per_round, 0,
        normalized_pack, normalized_labels
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
    gen_random_uuid()::text, created_room_id, caller_id::text,
    profile_name, true, 0, true
  );

  RETURN QUERY SELECT created_room_id, generated_code, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_game_room_v2(integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_game_room_v2(integer, integer, text, jsonb) TO authenticated;

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
  matched_room_max_players integer;
  matched_room_player_count integer;
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

  SELECT room.id, room.code, room.host_id, room.status, room.max_players
  INTO matched_room_id, matched_room_code, matched_room_host_id, matched_room_status, matched_room_max_players
  FROM public.rooms AS room
  WHERE room.code = upper(trim(requested_room_code))
  FOR UPDATE;

  IF matched_room_id IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0002';
  END IF;
  IF matched_room_status = 'ended' THEN
    RAISE EXCEPTION 'Room has ended' USING ERRCODE = '55000';
  END IF;

  SELECT count(*)::integer INTO matched_room_player_count
  FROM public.players AS player
  WHERE player.room_id = matched_room_id;

  IF matched_room_player_count >= matched_room_max_players
    AND NOT EXISTS (
      SELECT 1 FROM public.players AS player
      WHERE player.room_id = matched_room_id AND player.user_id = caller_id::text
    ) THEN
    RAISE EXCEPTION 'Room is full' USING ERRCODE = '55000';
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
  DO UPDATE SET is_connected = true, last_seen_at = now()
  RETURNING players.id, players.is_host
  INTO joined_player_id, joined_is_host;

  RETURN QUERY
    SELECT matched_room_id, matched_room_code, joined_player_id, joined_is_host;
END;
$$;

REVOKE ALL ON FUNCTION public.join_game_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_game_room(text) TO authenticated;

-- Place a player into the oldest compatible public lobby, or create one. The
-- advisory lock serializes allocation per pack so concurrent joins cannot
-- overfill a room or unnecessarily create multiple rooms.
CREATE OR REPLACE FUNCTION public.join_public_matchmaking(requested_category_pack text)
RETURNS TABLE (room_id text, room_code text, is_host boolean, matched_existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_pack text := lower(trim(requested_category_pack));
  profile_name text;
  matched_room_id text;
  matched_room_code text;
  created_room record;
  labels jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF normalized_pack NOT IN ('classic', 'world', 'food', 'entertainment') THEN
    RAISE EXCEPTION 'Invalid category pack' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('icallon:matchmaking:' || normalized_pack));

  SELECT profile.username INTO profile_name
  FROM public.users AS profile
  WHERE profile.id = caller_id::text;
  IF profile_name IS NULL THEN
    RAISE EXCEPTION 'Player profile not found' USING ERRCODE = '23503';
  END IF;

  SELECT room.id, room.code
  INTO matched_room_id, matched_room_code
  FROM public.rooms AS room
  WHERE room.is_public
    AND room.status = 'lobby'
    AND room.category_pack = normalized_pack
    AND NOT EXISTS (
      SELECT 1 FROM public.players AS mine
      WHERE mine.room_id = room.id AND mine.user_id = caller_id::text
    )
    AND (SELECT count(*) FROM public.players AS participant WHERE participant.room_id = room.id) < room.max_players
  ORDER BY room.created_at ASC, room.id ASC
  LIMIT 1
  FOR UPDATE;

  IF matched_room_id IS NOT NULL THEN
    INSERT INTO public.players (
      id, room_id, user_id, display_name, is_host, total_score, is_connected
    ) VALUES (
      gen_random_uuid()::text, matched_room_id, caller_id::text,
      profile_name, false, 0, true
    )
    ON CONFLICT ON CONSTRAINT unique_player_per_room
    DO UPDATE SET is_connected = true, last_seen_at = now();

    RETURN QUERY SELECT matched_room_id, matched_room_code, false, true;
    RETURN;
  END IF;

  labels := CASE normalized_pack
    WHEN 'world' THEN '["Country", "City", "Landmark", "Language"]'::jsonb
    WHEN 'food' THEN '["Food", "Drink", "Ingredient", "Restaurant"]'::jsonb
    WHEN 'entertainment' THEN '["Movie", "Song", "Celebrity", "Character"]'::jsonb
    ELSE '["Name", "Animal", "Place", "Thing"]'::jsonb
  END;

  SELECT created.room_id, created.room_code, created.is_host
  INTO created_room
  FROM public.create_game_room_v2(3, 60, normalized_pack, labels) AS created;

  UPDATE public.rooms AS room
  SET is_public = true, max_players = 4
  WHERE room.id = created_room.room_id;

  RETURN QUERY SELECT created_room.room_id::text, created_room.room_code::text, true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_matchmaking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_matchmaking(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_active_room()
RETURNS TABLE (
  room_id text,
  room_code text,
  room_status text,
  is_host boolean,
  current_round integer,
  current_round_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    room.id,
    room.code,
    room.status,
    player.is_host,
    room.current_round,
    room.current_round_id
  FROM public.players AS player
  JOIN public.rooms AS room ON room.id = player.room_id
  WHERE player.user_id = caller_id::text
    AND room.status IN ('lobby', 'playing')
  ORDER BY room.created_at DESC, room.id DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_active_room() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_active_room() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_room_presence(
  requested_room_id text,
  requested_connected boolean
)
RETURNS TABLE (player_id text, is_connected boolean, last_seen_at timestamp)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  updated_player_id text;
  updated_connected boolean;
  updated_last_seen_at timestamp;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.players AS player
  SET is_connected = requested_connected, last_seen_at = now()
  FROM public.rooms AS room
  WHERE player.room_id = requested_room_id
    AND player.user_id = caller_id::text
    AND room.id = player.room_id
    AND room.status IN ('lobby', 'playing')
  RETURNING player.id, player.is_connected, player.last_seen_at
  INTO updated_player_id, updated_connected, updated_last_seen_at;

  IF updated_player_id IS NULL THEN
    RAISE EXCEPTION 'No active room membership found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT updated_player_id, updated_connected, updated_last_seen_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_presence(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_room_presence(text, boolean) TO authenticated;

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

-- Recalculate an entire round because changing one duplicate can change the
-- value of another player's otherwise-identical answer.
CREATE OR REPLACE FUNCTION public.recalculate_game_round_scores(requested_round_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.answers AS answer
  SET
    points_earned = CASE WHEN answer.submitted_at IS NULL THEN 0 ELSE
      (CASE WHEN answer.name_valid THEN
        CASE WHEN (
          SELECT count(*) FROM public.answers AS other
          WHERE other.round_id = answer.round_id
            AND other.submitted_at IS NOT NULL
            AND other.name_valid
            AND lower(regexp_replace(trim(other.name), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(trim(answer.name), '[[:space:]]+', ' ', 'g'))
        ) > 1 THEN 5 ELSE 10 END
      ELSE 0 END) +
      (CASE WHEN answer.animal_valid THEN
        CASE WHEN (
          SELECT count(*) FROM public.answers AS other
          WHERE other.round_id = answer.round_id
            AND other.submitted_at IS NOT NULL
            AND other.animal_valid
            AND lower(regexp_replace(trim(other.animal), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(trim(answer.animal), '[[:space:]]+', ' ', 'g'))
        ) > 1 THEN 5 ELSE 10 END
      ELSE 0 END) +
      (CASE WHEN answer.place_valid THEN
        CASE WHEN (
          SELECT count(*) FROM public.answers AS other
          WHERE other.round_id = answer.round_id
            AND other.submitted_at IS NOT NULL
            AND other.place_valid
            AND lower(regexp_replace(trim(other.place), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(trim(answer.place), '[[:space:]]+', ' ', 'g'))
        ) > 1 THEN 5 ELSE 10 END
      ELSE 0 END) +
      (CASE WHEN answer.thing_valid THEN
        CASE WHEN (
          SELECT count(*) FROM public.answers AS other
          WHERE other.round_id = answer.round_id
            AND other.submitted_at IS NOT NULL
            AND other.thing_valid
            AND lower(regexp_replace(trim(other.thing), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(trim(answer.thing), '[[:space:]]+', ' ', 'g'))
        ) > 1 THEN 5 ELSE 10 END
      ELSE 0 END)
    END,
    updated_at = now()
  WHERE answer.round_id = requested_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_game_round_scores(text) FROM PUBLIC;

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

  -- Letter-matching submitted answers are the sensible default. The host can
  -- still reject nonsense or correct an edge case during review.
  UPDATE public.answers AS answer
  SET
    name_valid = answer.submitted_at IS NOT NULL
      AND answer.name IS NOT NULL
      AND upper(left(trim(answer.name), 1)) = upper(round_record.letter),
    animal_valid = answer.submitted_at IS NOT NULL
      AND answer.animal IS NOT NULL
      AND upper(left(trim(answer.animal), 1)) = upper(round_record.letter),
    place_valid = answer.submitted_at IS NOT NULL
      AND answer.place IS NOT NULL
      AND upper(left(trim(answer.place), 1)) = upper(round_record.letter),
    thing_valid = answer.submitted_at IS NOT NULL
      AND answer.thing IS NOT NULL
      AND upper(left(trim(answer.thing), 1)) = upper(round_record.letter),
    validated_at = CASE WHEN answer.submitted_at IS NOT NULL THEN now() ELSE answer.validated_at END,
    updated_at = now()
  WHERE answer.round_id = requested_round_id;

  PERFORM public.recalculate_game_round_scores(requested_round_id);

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
  IF answer_record.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Only submitted answers can be scored' USING ERRCODE = '55000';
  END IF;

  UPDATE public.answers AS answer
  SET
    name_valid = CASE WHEN requested_category = 'name' THEN requested_valid ELSE answer.name_valid END,
    animal_valid = CASE WHEN requested_category = 'animal' THEN requested_valid ELSE answer.animal_valid END,
    place_valid = CASE WHEN requested_category = 'place' THEN requested_valid ELSE answer.place_valid END,
    thing_valid = CASE WHEN requested_category = 'thing' THEN requested_valid ELSE answer.thing_valid END,
    validated_at = now(),
    updated_at = now()
  WHERE answer.id = requested_answer_id;

  PERFORM public.recalculate_game_round_scores(answer_record.round_id);

  SELECT answer.points_earned INTO calculated_points
  FROM public.answers AS answer
  WHERE answer.id = requested_answer_id;

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

-- Persist one completed solo/daily run. The client-generated result id makes
-- retries safe, while score bounds prevent corrupt profile aggregates.
CREATE OR REPLACE FUNCTION public.record_solo_result(
  requested_result_id text,
  requested_mode text,
  requested_difficulty text,
  requested_category_pack text,
  requested_player_score integer,
  requested_opponent_score integer,
  requested_challenge_date date DEFAULT NULL
)
RETURNS TABLE (result_id text, won boolean, created_at timestamp)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_mode text := lower(trim(requested_mode));
  saved_result public.solo_results%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF length(trim(requested_result_id)) < 8 OR length(trim(requested_result_id)) > 100 THEN
    RAISE EXCEPTION 'Invalid result id' USING ERRCODE = '22023';
  END IF;
  IF normalized_mode NOT IN ('solo', 'daily')
    OR requested_difficulty NOT IN ('easy', 'medium', 'hard')
    OR requested_category_pack NOT IN ('classic', 'world', 'food', 'entertainment')
    OR requested_player_score NOT BETWEEN 0 AND 120
    OR requested_opponent_score NOT BETWEEN 0 AND 120 THEN
    RAISE EXCEPTION 'Invalid solo result' USING ERRCODE = '22023';
  END IF;
  IF (normalized_mode = 'daily') <> (requested_challenge_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Daily challenge date is required only for daily results' USING ERRCODE = '22023';
  END IF;
  IF normalized_mode = 'daily'
    AND requested_challenge_date <> timezone('utc', now())::date THEN
    RAISE EXCEPTION 'Only today''s daily challenge can be recorded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.solo_results (
    id, user_id, mode, difficulty, category_pack,
    player_score, opponent_score, won, challenge_date
  ) VALUES (
    trim(requested_result_id), caller_id::text, normalized_mode,
    requested_difficulty, requested_category_pack,
    requested_player_score, requested_opponent_score,
    requested_player_score > requested_opponent_score,
    requested_challenge_date
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT result.* INTO saved_result
  FROM public.solo_results AS result
  WHERE result.id = trim(requested_result_id)
    AND result.user_id = caller_id::text;

  IF saved_result.id IS NULL THEN
    RAISE EXCEPTION 'Result id is already in use' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY SELECT saved_result.id, saved_result.won, saved_result.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_solo_result(text, text, text, text, integer, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_solo_result(text, text, text, text, integer, integer, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_daily_challenge()
RETURNS TABLE (
  challenge_date date,
  category_pack text,
  seed text,
  completed boolean,
  player_score integer,
  opponent_score integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  today date := timezone('utc', now())::date;
  selected_pack text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  selected_pack := (ARRAY['classic', 'world', 'food', 'entertainment'])[
    mod(today - date '2026-01-01', 4) + 1
  ];

  RETURN QUERY
  SELECT
    today,
    selected_pack,
    'daily:' || today::text,
    result.id IS NOT NULL,
    result.player_score,
    result.opponent_score
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.solo_results AS result
    ON result.user_id = caller_id::text
    AND result.mode = 'daily'
    AND result.challenge_date = today
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_challenge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_progression()
RETURNS TABLE (
  xp bigint,
  level integer,
  level_progress bigint,
  level_target integer,
  multiplayer_games bigint,
  multiplayer_wins bigint,
  solo_games bigint,
  solo_wins bigint,
  daily_challenges bigint,
  total_points bigint,
  best_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH multiplayer AS (
    SELECT
      count(*) AS games,
      count(*) FILTER (WHERE result.is_winner) AS wins,
      COALESCE(sum(result.score), 0)::bigint AS points,
      COALESCE(max(result.score), 0)::integer AS best
    FROM public.player_game_results AS result
    WHERE result.user_id = auth.uid()::text
  ), solo AS (
    SELECT
      count(*) AS all_games,
      count(*) FILTER (WHERE result.mode = 'solo') AS games,
      count(*) FILTER (WHERE result.mode = 'solo' AND result.won) AS wins,
      count(*) FILTER (WHERE result.mode = 'daily') AS dailies,
      count(*) FILTER (WHERE result.won) AS all_wins,
      COALESCE(sum(result.player_score), 0)::bigint AS points,
      COALESCE(max(result.player_score), 0)::integer AS best
    FROM public.solo_results AS result
    WHERE result.user_id = auth.uid()::text
  ), combined AS (
    SELECT
      multiplayer.*,
      solo.all_games,
      solo.games AS solo_game_count,
      solo.wins AS solo_win_count,
      solo.dailies,
      solo.all_wins,
      solo.points AS solo_points,
      solo.best AS solo_best,
      (
        multiplayer.games * 50
        + multiplayer.points
        + multiplayer.wins * 75
        + solo.all_games * 35
        + solo.points
        + solo.all_wins * 50
        + solo.dailies * 25
      )::bigint AS total_xp
    FROM multiplayer CROSS JOIN solo
  )
  SELECT
    combined.total_xp,
    floor(combined.total_xp / 500.0)::integer + 1,
    mod(combined.total_xp, 500::bigint),
    500,
    combined.games,
    combined.wins,
    combined.solo_game_count,
    combined.solo_win_count,
    combined.dailies,
    combined.points + combined.solo_points,
    greatest(combined.best, combined.solo_best)
  FROM combined;
$$;

REVOKE ALL ON FUNCTION public.get_my_progression() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_progression() TO authenticated;

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
