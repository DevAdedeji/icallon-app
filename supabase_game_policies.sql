-- ICallOn row-level security policies.
-- This script is safe to rerun in the Supabase SQL editor.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- Remove both the original permissive policies and previous versions of the
-- restricted policies before recreating them.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can create own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Hosts can create own rooms" ON public.rooms;
DROP POLICY IF EXISTS "Hosts can update own rooms" ON public.rooms;
DROP POLICY IF EXISTS "Hosts can delete own rooms" ON public.rooms;

DROP POLICY IF EXISTS "Public access to players" ON public.players;
DROP POLICY IF EXISTS "Players are viewable by everyone" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can join rooms" ON public.players;
DROP POLICY IF EXISTS "Hosts can update room players" ON public.players;
DROP POLICY IF EXISTS "Players can leave or hosts can remove them" ON public.players;

DROP POLICY IF EXISTS "Rounds are viewable by everyone" ON public.rounds;
DROP POLICY IF EXISTS "Hosts can insert rounds" ON public.rounds;
DROP POLICY IF EXISTS "Hosts can update rounds" ON public.rounds;
DROP POLICY IF EXISTS "Hosts can delete rounds" ON public.rounds;

DROP POLICY IF EXISTS "Public access to answers" ON public.answers;
DROP POLICY IF EXISTS "Answers are visible when reviewable" ON public.answers;
DROP POLICY IF EXISTS "Players can create own answers" ON public.answers;
DROP POLICY IF EXISTS "Players and hosts can update answers" ON public.answers;
DROP POLICY IF EXISTS "Players and hosts can delete answers" ON public.answers;

-- Profiles are public game metadata, but only their owner can create or edit
-- them. Never put private account data in this table.
CREATE POLICY "Public profiles are viewable by everyone" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can create own profile" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid())::text);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())::text)
  WITH CHECK (id = (SELECT auth.uid())::text);

-- Rooms stay readable so the existing web guest flow and realtime lobby keep
-- working. Room mutations are restricted to the authenticated host.
CREATE POLICY "Rooms are viewable by everyone" ON public.rooms
  FOR SELECT USING (true);

CREATE POLICY "Hosts can create own rooms" ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_id = (SELECT auth.uid())::text);

CREATE POLICY "Hosts can update own rooms" ON public.rooms
  FOR UPDATE TO authenticated
  USING (host_id = (SELECT auth.uid())::text)
  WITH CHECK (host_id = (SELECT auth.uid())::text);

CREATE POLICY "Hosts can delete own rooms" ON public.rooms
  FOR DELETE TO authenticated
  USING (host_id = (SELECT auth.uid())::text);

-- Player rows are readable for lobby presence and leaderboards. A mobile user
-- may only join as themselves, and the host flag must match room ownership.
CREATE POLICY "Players are viewable by everyone" ON public.players
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join rooms" ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = players.room_id
        AND players.is_host = (room.host_id = (SELECT auth.uid())::text)
    )
  );

-- Only the host updates player state and calculated scores.
CREATE POLICY "Hosts can update room players" ON public.players
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = players.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = players.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Players can leave or hosts can remove them" ON public.players
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = players.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Rounds are viewable by everyone" ON public.rounds
  FOR SELECT USING (true);

CREATE POLICY "Hosts can insert rounds" ON public.rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = rounds.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Hosts can update rounds" ON public.rounds
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = rounds.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = rounds.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Hosts can delete rounds" ON public.rounds
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = rounds.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

-- Players can read their own answer while entering it. Everyone can read a
-- round after submissions close, which preserves the shared review screen.
CREATE POLICY "Answers are visible when reviewable" ON public.answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.players AS player
      WHERE player.id = answers.player_id
        AND player.user_id = (SELECT auth.uid())::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = answers.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.rounds AS round
      WHERE round.id = answers.round_id
        AND round.room_id = answers.room_id
        AND round.status IN ('submitted', 'ended')
    )
  );

CREATE POLICY "Players can create own answers" ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(points_earned, 0) = 0
    AND animal_valid IS NOT TRUE
    AND name_valid IS NOT TRUE
    AND place_valid IS NOT TRUE
    AND thing_valid IS NOT TRUE
    AND validated_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.players AS player
      WHERE player.id = answers.player_id
        AND player.room_id = answers.room_id
        AND player.user_id = (SELECT auth.uid())::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.rounds AS round
      WHERE round.id = answers.round_id
        AND round.room_id = answers.room_id
        AND round.status = 'active'
    )
  );

CREATE POLICY "Players and hosts can update answers" ON public.answers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.players AS player
      JOIN public.rounds AS round
        ON round.id = answers.round_id AND round.room_id = answers.room_id
      WHERE player.id = answers.player_id
        AND player.room_id = answers.room_id
        AND player.user_id = (SELECT auth.uid())::text
        AND round.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = answers.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.players AS player
      JOIN public.rounds AS round
        ON round.id = answers.round_id AND round.room_id = answers.room_id
      WHERE player.id = answers.player_id
        AND player.room_id = answers.room_id
        AND player.user_id = (SELECT auth.uid())::text
        AND round.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = answers.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Players and hosts can delete answers" ON public.answers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.players AS player
      WHERE player.id = answers.player_id
        AND player.user_id = (SELECT auth.uid())::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.rooms AS room
      WHERE room.id = answers.room_id
        AND room.host_id = (SELECT auth.uid())::text
    )
  );

-- RLS decides which answer rows a caller may update. This trigger additionally
-- prevents a player from awarding points to themselves or changing identity
-- columns, while still allowing a host to moderate submitted answers.
CREATE OR REPLACE FUNCTION public.enforce_answer_update_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_role text := auth.role();
  owns_answer boolean;
  hosts_room boolean;
BEGIN
  -- Trusted direct database and service-role operations are validated by the
  -- server-side application layer rather than Supabase Auth claims.
  IF request_role IS NULL OR request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.round_id IS DISTINCT FROM OLD.round_id
    OR NEW.player_id IS DISTINCT FROM OLD.player_id
    OR NEW.player_name IS DISTINCT FROM OLD.player_name THEN
    RAISE EXCEPTION 'Answer ownership fields cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.players AS player
    WHERE player.id = OLD.player_id
      AND player.user_id = auth.uid()::text
  ) INTO owns_answer;

  SELECT EXISTS (
    SELECT 1
    FROM public.rooms AS room
    WHERE room.id = OLD.room_id
      AND room.host_id = auth.uid()::text
  ) INTO hosts_room;

  IF owns_answer AND hosts_room THEN
    RETURN NEW;
  END IF;

  IF owns_answer THEN
    IF NEW.animal_valid IS DISTINCT FROM OLD.animal_valid
      OR NEW.name_valid IS DISTINCT FROM OLD.name_valid
      OR NEW.place_valid IS DISTINCT FROM OLD.place_valid
      OR NEW.thing_valid IS DISTINCT FROM OLD.thing_valid
      OR NEW.points_earned IS DISTINCT FROM OLD.points_earned
      OR NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
      RAISE EXCEPTION 'Players cannot validate or score their own answers'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF hosts_room THEN
    IF NEW.animal IS DISTINCT FROM OLD.animal
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.place IS DISTINCT FROM OLD.place
      OR NEW.thing IS DISTINCT FROM OLD.thing
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.time_taken IS DISTINCT FROM OLD.time_taken THEN
      RAISE EXCEPTION 'Hosts cannot rewrite another player''s submitted answers'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update this answer'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS enforce_answer_update_permissions ON public.answers;
CREATE TRIGGER enforce_answer_update_permissions
  BEFORE UPDATE ON public.answers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_answer_update_permissions();
