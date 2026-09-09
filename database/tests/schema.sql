DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;

CREATE TABLE public.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE public.rooms (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  host_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'lobby',
  max_rounds integer NOT NULL DEFAULT 5,
  time_per_round integer NOT NULL DEFAULT 60,
  current_round integer NOT NULL DEFAULT 0,
  current_round_id text,
  category_pack text NOT NULL DEFAULT 'classic',
  category_labels jsonb NOT NULL DEFAULT '["Name", "Animal", "Place", "Thing"]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  ended_at timestamp
);

CREATE TABLE public.players (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  is_host boolean NOT NULL DEFAULT false,
  total_score integer NOT NULL DEFAULT 0,
  is_connected boolean NOT NULL DEFAULT true,
  joined_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT unique_player_per_room UNIQUE (room_id, user_id)
);

CREATE TABLE public.rounds (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  letter text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamp NOT NULL DEFAULT now(),
  ended_at timestamp
);

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_current_round_id_fkey
  FOREIGN KEY (current_round_id) REFERENCES public.rounds(id) ON DELETE SET NULL;

CREATE TABLE public.answers (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id text NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  animal text,
  name text,
  place text,
  thing text,
  animal_valid boolean DEFAULT false,
  name_valid boolean DEFAULT false,
  place_valid boolean DEFAULT false,
  thing_valid boolean DEFAULT false,
  points_earned integer NOT NULL DEFAULT 0,
  time_taken integer,
  submitted_at timestamp,
  validated_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
