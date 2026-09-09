INSERT INTO public.users (id, email, username) VALUES
  ('11111111-1111-1111-1111-111111111111', 'host@example.test', 'Host'),
  ('22222222-2222-2222-2222-222222222222', 'player@example.test', 'Player');

DO $$
DECLARE
  created_room_id text;
  created_room_code text;
  created_round_id text;
  joined_player_id text;
  player_answer_id text;
  returned_points integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

  SELECT result.room_id, result.room_code
  INTO created_room_id, created_room_code
  FROM public.create_game_room_v2(
    3,
    30,
    'world',
    '["Country", "City", "Landmark", "Language"]'::jsonb
  ) AS result;

  IF (SELECT category_pack FROM public.rooms WHERE id = created_room_id) <> 'world'
    OR (SELECT category_labels FROM public.rooms WHERE id = created_room_id) <>
      '["Country", "City", "Landmark", "Language"]'::jsonb THEN
    RAISE EXCEPTION 'Category pack was not stored with the room';
  END IF;

  IF (SELECT count(*) FROM public.players WHERE room_id = created_room_id AND is_host) <> 1 THEN
    RAISE EXCEPTION 'Host player was not created atomically';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  SELECT result.player_id INTO joined_player_id
  FROM public.join_game_room(created_room_code) AS result;

  IF joined_player_id IS NULL THEN
    RAISE EXCEPTION 'Player did not join the room';
  END IF;

  -- Joining twice must reconnect the same player instead of duplicating it.
  PERFORM * FROM public.join_game_room(created_room_code);
  IF (SELECT count(*) FROM public.players WHERE room_id = created_room_id) <> 2 THEN
    RAISE EXCEPTION 'Reconnect created a duplicate player';
  END IF;
  IF (SELECT active.room_id FROM public.get_my_active_room() AS active) <> created_room_id THEN
    RAISE EXCEPTION 'Active room lookup did not restore the joined lobby';
  END IF;

  PERFORM * FROM public.set_room_presence(created_room_id, false);
  IF (SELECT is_connected FROM public.players WHERE id = joined_player_id) THEN
    RAISE EXCEPTION 'Player presence was not marked offline';
  END IF;
  IF NOT (
    SELECT is_connected FROM public.players
    WHERE room_id = created_room_id AND is_host
  ) THEN
    RAISE EXCEPTION 'A player presence update changed another participant';
  END IF;
  PERFORM * FROM public.set_room_presence(created_room_id, true);

  BEGIN
    PERFORM * FROM public.start_game(created_room_id);
    RAISE EXCEPTION 'A non-host unexpectedly started the game';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM * FROM public.start_game(created_room_id);
  SELECT result.round_id INTO created_round_id
  FROM public.start_game_round(created_room_id, 'a') AS result;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  PERFORM * FROM public.save_game_answers(
    created_room_id, created_round_id, 'Alice', 'Ant', 'Athens', 'Anchor', false
  );

  SELECT id INTO player_answer_id
  FROM public.answers
  WHERE round_id = created_round_id AND player_id = joined_player_id;

  -- The trigger must reject a player awarding points to themselves.
  BEGIN
    UPDATE public.answers SET points_earned = 40 WHERE id = player_answer_id;
    RAISE EXCEPTION 'Self-scoring was unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM * FROM public.score_game_answer(player_answer_id, 'animal', true);
    RAISE EXCEPTION 'A non-host unexpectedly scored an answer';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM * FROM public.save_game_answers(
    created_room_id, created_round_id, 'Alice', 'Ant', 'Athens', 'Anchor', true
  );

  -- A non-host cannot close submissions before the timer expires.
  BEGIN
    PERFORM * FROM public.close_game_submissions(created_round_id);
    RAISE EXCEPTION 'Early non-host closure was unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM * FROM public.save_game_answers(
    created_room_id, created_round_id, 'Henry', '  ANT  ', 'Helsinki', 'Hammer', true
  );
  PERFORM * FROM public.close_game_submissions(created_round_id);

  IF (SELECT points_earned FROM public.answers WHERE id = player_answer_id) <> 35 THEN
    RAISE EXCEPTION 'Expected duplicate answer to receive 5 points';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  BEGIN
    PERFORM * FROM public.confirm_game_round(created_round_id);
    RAISE EXCEPTION 'A non-host unexpectedly confirmed the round';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

  SELECT result.points_earned INTO returned_points
  FROM public.score_game_answer(player_answer_id, 'animal', true) AS result;
  IF returned_points <> 35 THEN
    RAISE EXCEPTION 'Expected 35 auto-reviewed points, got %', returned_points;
  END IF;

  SELECT result.points_earned INTO returned_points
  FROM public.score_game_answer(player_answer_id, 'animal', false) AS result;
  IF returned_points <> 30 THEN
    RAISE EXCEPTION 'Rejecting a duplicate did not remove its 5 points';
  END IF;
  IF (
    SELECT points_earned FROM public.answers
    WHERE round_id = created_round_id AND player_id <> joined_player_id
  ) <> 10 THEN
    RAISE EXCEPTION 'The remaining duplicate did not become unique after rejection';
  END IF;

  SELECT result.points_earned INTO returned_points
  FROM public.score_game_answer(player_answer_id, 'animal', true) AS result;

  PERFORM * FROM public.confirm_game_round(created_round_id);
  IF (SELECT total_score FROM public.players WHERE id = joined_player_id) <> 35 THEN
    RAISE EXCEPTION 'Leaderboard total was not updated atomically';
  END IF;
  IF (SELECT status FROM public.rounds WHERE id = created_round_id) <> 'ended' THEN
    RAISE EXCEPTION 'Round was not finalized';
  END IF;

  -- A second round can only begin after the first one is finalized.
  PERFORM * FROM public.start_game_round(created_room_id, 'B');

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  BEGIN
    PERFORM * FROM public.end_game(created_room_id);
    RAISE EXCEPTION 'A non-host unexpectedly ended the game';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM * FROM public.end_game(created_room_id);
  -- A retry must return the existing result rather than duplicate history.
  PERFORM * FROM public.end_game(created_room_id);

  IF (SELECT count(*) FROM public.game_results WHERE room_id = created_room_id) <> 1 THEN
    RAISE EXCEPTION 'Ending a game did not create exactly one history snapshot';
  END IF;
  IF (
    SELECT count(*)
    FROM public.player_game_results AS result
    JOIN public.game_results AS game ON game.id = result.game_result_id
    WHERE game.room_id = created_room_id
  ) <> 2 THEN
    RAISE EXCEPTION 'Completed game history did not snapshot every player';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  IF (SELECT stats.games_played FROM public.get_my_game_stats() AS stats) <> 1 THEN
    RAISE EXCEPTION 'Profile statistics did not include the completed game';
  END IF;
  IF (SELECT stats.wins FROM public.get_my_game_stats() AS stats) <> 1 THEN
    RAISE EXCEPTION 'Winner statistics were not recorded';
  END IF;
  IF (SELECT stats.total_points FROM public.get_my_game_stats() AS stats) <> 35 THEN
    RAISE EXCEPTION 'Profile total points were not recorded';
  END IF;
  IF (SELECT count(*) FROM public.get_my_match_history(20)) <> 1 THEN
    RAISE EXCEPTION 'Match history did not return the completed game';
  END IF;

  BEGIN
    PERFORM * FROM public.request_game_rematch(created_room_id);
    RAISE EXCEPTION 'A non-host unexpectedly requested a rematch';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM * FROM public.request_game_rematch(created_room_id);
  -- Retrying the same request must not skip a game number.
  PERFORM * FROM public.request_game_rematch(created_room_id);

  IF (SELECT status FROM public.rooms WHERE id = created_room_id) <> 'lobby'
    OR (SELECT game_number FROM public.rooms WHERE id = created_room_id) <> 2 THEN
    RAISE EXCEPTION 'Rematch did not reset the room exactly once';
  END IF;
  IF (SELECT count(*) FROM public.players WHERE room_id = created_room_id) <> 2
    OR (SELECT sum(total_score) FROM public.players WHERE room_id = created_room_id) <> 0 THEN
    RAISE EXCEPTION 'Rematch did not preserve players and reset scores';
  END IF;
  IF (SELECT count(*) FROM public.rounds WHERE room_id = created_room_id) <> 0
    OR (SELECT count(*) FROM public.answers WHERE room_id = created_room_id) <> 0 THEN
    RAISE EXCEPTION 'Rematch did not clear old live gameplay data';
  END IF;
  IF (SELECT count(*) FROM public.game_results WHERE room_id = created_room_id) <> 1 THEN
    RAISE EXCEPTION 'Rematch removed completed game history';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  IF (SELECT active.room_status FROM public.get_my_active_room() AS active) <> 'lobby' THEN
    RAISE EXCEPTION 'Rematch lobby was not available for session resume';
  END IF;
END;
$$;

SELECT 'game SQL integration passed' AS result;
