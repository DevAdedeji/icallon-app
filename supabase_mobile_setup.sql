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
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET is_connected = true
  RETURNING players.id, players.is_host
  INTO joined_player_id, joined_is_host;

  RETURN QUERY
    SELECT matched_room_id, matched_room_code, joined_player_id, joined_is_host;
END;
$$;

REVOKE ALL ON FUNCTION public.join_game_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_game_room(text) TO authenticated;
