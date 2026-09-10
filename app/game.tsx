import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { applyAnswerScore, duplicateAnswerKeys, remainingRoundSeconds } from '@/features/game/game-state';
import { categoryEntries } from '@/features/game/category-packs';
import { Leaderboard } from '@/features/game/leaderboard';
import {
  closeSubmissions,
  confirmRound,
  endGame as endGameSession,
  saveGameAnswers,
  scoreAnswer,
  startRound,
  requestRematch,
} from '@/features/game/game-service';
import { supabase } from '@/lib/supabase/client';
import { AnswerValues, EMPTY_ANSWERS, GameAnswer, getPlayer, Player, Room, Round } from '@/lib/game';
import { useRoomPresence } from '@/features/rooms/use-room-presence';
import { InteractivePressable as Pressable } from '@/components/interactive-pressable';
import { useGameFeedback } from '@/features/feedback/game-feedback';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function GameScreen() {
  const { playSound } = useGameFeedback();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [reviewAnswers, setReviewAnswers] = useState<GameAnswer[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const answersReady = useRef(false);
  const answersRef = useRef<AnswerValues>(EMPTY_ANSWERS);
  const hasSubmittedRef = useRef(false);
  const endRequested = useRef(false);
  const reviewQueue = useRef<Promise<void>>(Promise.resolve());
  const reviewRevision = useRef(0);
  const optimisticReview = useRef(new Map<string, { valid: boolean; revision: number }>());
  const reviewRoundId = useRef<string | null>(null);
  const finalizingGame = useRef(false);
  const lastCountdownSound = useRef<number | null>(null);
  const lastRoundSound = useRef<string | null>(null);

  const isHost = Boolean(room && userId && room.host_id === userId);

  useEffect(() => {
    answersRef.current = answers;
    hasSubmittedRef.current = hasSubmitted;
  }, [answers, hasSubmitted]);

  const loadGame = useCallback(async () => {
    if (!roomId || !userId) {
      setNotice('This game link is incomplete.');
      setLoading(false);
      return;
    }

    try {
      const { data: nextRoom, error: roomError } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (roomError) throw roomError;
      if (!nextRoom) throw new Error('This room is no longer available.');

      const nextPlayer = await getPlayer(roomId, userId);
      if (!nextPlayer) throw new Error('You are not a player in this room.');

      let nextRound: Round | null = null;
      if (nextRoom.current_round_id) {
        const { data, error: roundError } = await supabase.from('rounds').select('*').eq('id', nextRoom.current_round_id).maybeSingle();
        if (roundError) throw roundError;
        nextRound = (data as Round | null) ?? null;
      }

      setRoom(nextRoom as Room);
      setPlayer(nextPlayer);
      setRound(nextRound);
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'The latest game state could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  useRoomPresence(roomId, loadGame);

  useEffect(() => {
    const task = setTimeout(() => { void loadGame(); }, 0);
    return () => clearTimeout(task);
  }, [loadGame]);

  useEffect(() => {
    if (room?.status === 'lobby') {
      router.replace({ pathname: '/lobby', params: { roomId: room.id } });
    }
  }, [room]);

  const loadMyAnswers = useCallback(async () => {
    if (!round || !player) return;
    answersReady.current = false;
    setAnswers(EMPTY_ANSWERS);
    setHasSubmitted(false);
    const { data, error } = await supabase.from('answers').select('name, animal, place, thing, submitted_at').eq('round_id', round.id).eq('player_id', player.id).maybeSingle();
    if (error) {
      setNotice('Your saved answers could not be loaded.');
      return;
    }
    setAnswers({ name: data?.name ?? '', animal: data?.animal ?? '', place: data?.place ?? '', thing: data?.thing ?? '' });
    setHasSubmitted(Boolean(data?.submitted_at));
    answersReady.current = true;
  }, [round, player]);

  const loadReviewAnswers = useCallback(async () => {
    if (!round) return;
    const { data, error } = await supabase.from('answers').select('*').eq('round_id', round.id).not('submitted_at', 'is', null).order('player_name');
    if (error) {
      setNotice('Submitted answers could not be loaded.');
      return;
    }
    const nextAnswers = ((data ?? []) as GameAnswer[]).map((answer) => {
      let nextAnswer = answer;
      for (const category of ['name', 'animal', 'place', 'thing'] as const) {
        const decision = optimisticReview.current.get(`${answer.id}:${category}`);
        if (decision) nextAnswer = applyAnswerScore(nextAnswer, category, decision.valid, nextAnswer.points_earned);
      }
      return nextAnswer;
    });
    setReviewAnswers(nextAnswers);
  }, [round]);

  useEffect(() => {
    if (reviewRoundId.current === round?.id) return;
    reviewRoundId.current = round?.id ?? null;
    reviewQueue.current = Promise.resolve();
    reviewRevision.current = 0;
    optimisticReview.current.clear();
  }, [round?.id]);

  useEffect(() => {
    const task = setTimeout(() => {
      if (round?.status === 'active') void loadMyAnswers();
      if (round?.status === 'submitted') void loadReviewAnswers();
    }, 0);
    return () => clearTimeout(task);
  }, [round?.id, round?.status, loadMyAnswers, loadReviewAnswers]);

  useEffect(() => {
    if (!roomId) return;
    let active = true;

    // Route transitions can remount before removeChannel finishes. Supabase
    // reuses identical topics, so every mount needs its own subscription key.
    const channelTopic = `mobile-game-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelTopic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        if (active) void loadGame();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, () => {
        if (active) void loadGame();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${roomId}` }, () => {
        if (active && round?.status === 'submitted') void loadReviewAnswers();
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('offline');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [roomId, loadGame, loadReviewAnswers, round?.status]);

  useEffect(() => {
    if (!round || round.status !== 'active' || !room) return;
    endRequested.current = false;
    const tick = () => {
      const remaining = remainingRoundSeconds(round.started_at, room.time_per_round);
      setSecondsLeft(remaining);
      if (remaining === 0 && !endRequested.current) {
        endRequested.current = true;
        void (async () => {
          try {
            if (player && !hasSubmittedRef.current) {
              await saveGameAnswers(room.id, round.id, answersRef.current, true);
              setHasSubmitted(true);
            }
            // Give every connected device time to flush its final keystroke.
            await new Promise((resolve) => setTimeout(resolve, 850));
            await closeSubmissions(round.id);
          } catch {
            // Retry if this device reached zero slightly before the database.
            endRequested.current = false;
          }
        })();
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [player, round, room]);

  useEffect(() => {
    if (round?.status !== 'active' || secondsLeft < 1 || secondsLeft > 5) {
      lastCountdownSound.current = null;
      return;
    }
    if (lastCountdownSound.current !== secondsLeft) {
      lastCountdownSound.current = secondsLeft;
      playSound('countdown');
    }
  }, [playSound, round?.status, secondsLeft]);

  useEffect(() => {
    if (round?.status === 'active' && lastRoundSound.current !== round.id) {
      lastRoundSound.current = round.id;
      playSound('roundStart');
    }
  }, [playSound, round?.id, round?.status]);

  useEffect(() => {
    if (!round || !player || round.status !== 'active' || !answersReady.current || hasSubmitted) return;
    const timer = setTimeout(() => {
      saveGameAnswers(roomId, round.id, answers).catch(error => setNotice(error.message));
    }, 700);
    return () => clearTimeout(timer);
  }, [answers, hasSubmitted, player, roomId, round]);

  const chooseLetter = async (letter: string) => {
    if (!room || !isHost || saving) return;
    setSaving(true);
    try {
      await startRound(room.id, letter);
      await loadGame();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start the round'); }
    finally { setSaving(false); }
  };

  const submitAnswers = async () => {
    if (!round || !player || saving || submittingAnswers) return;
    setSubmittingAnswers(true);
    try {
      if (!hasSubmitted) {
        await saveGameAnswers(roomId, round.id, answers, true);
      }
      setHasSubmitted(true);
      setNotice('Answers submitted. Waiting for the round to end.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not submit answers'); }
    finally { setSubmittingAnswers(false); }
  };

  const finishSubmissions = async () => {
    if (!round || !player || !isHost || saving || submittingAnswers) return;
    setSaving(true);
    try {
      // Persist the host's current input before the database promotes every
      // player's autosaved draft to a final submission.
      if (!hasSubmitted) {
        await saveGameAnswers(roomId, round.id, answers, true);
      }
      playSound('submit');
      // Autosave is debounced on every device. Let other players' final
      // keystrokes arrive before the database promotes all drafts.
      await new Promise((resolve) => setTimeout(resolve, 850));
      await closeSubmissions(round.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not close submissions.');
    } finally {
      setSaving(false);
    }
  };

  const validate = (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => {
    const revision = ++reviewRevision.current;
    const decisionKey = `${answer.id}:${category}`;
    optimisticReview.current.set(decisionKey, { valid, revision });
    setReviewAnswers(current => current.map(item => item.id === answer.id
      ? applyAnswerScore(item, category, valid, item.points_earned)
      : item));

    // Keep review taps instant while serializing writes so rapid decisions
    // cannot reach the database out of order.
    reviewQueue.current = reviewQueue.current
      .catch(() => undefined)
      .then(async () => {
        const points = await scoreAnswer(answer.id, category, valid);
        if (optimisticReview.current.get(decisionKey)?.revision === revision) {
          optimisticReview.current.delete(decisionKey);
        }
        setReviewAnswers(current => current.map(item => item.id === answer.id
          ? applyAnswerScore(item, category, valid, points)
          : item));
        if (revision === reviewRevision.current) await loadReviewAnswers();
      })
      .catch(async (error) => {
        if (optimisticReview.current.get(decisionKey)?.revision === revision) {
          optimisticReview.current.delete(decisionKey);
        }
        if (revision !== reviewRevision.current) return;
        setNotice(error instanceof Error ? error.message : 'Could not score this answer.');
        await loadReviewAnswers();
      });
  };

  const confirmReview = async () => {
    if (!round || !room || !isHost) return;
    setSaving(true);
    try {
      await reviewQueue.current;
      await confirmRound(round.id);
      playSound('success');
      await loadGame();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not confirm this round'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    const isFinalRoundComplete = Boolean(
      room
      && round
      && isHost
      && room.status === 'playing'
      && round.status === 'ended'
      && round.round_number >= room.max_rounds,
    );

    if (!isFinalRoundComplete) {
      if (round?.status !== 'ended') finalizingGame.current = false;
      return;
    }
    if (finalizingGame.current || !room) return;

    finalizingGame.current = true;
    void endGameSession(room.id)
      .then(loadGame)
      .catch((error) => {
        finalizingGame.current = false;
        setNotice(error instanceof Error ? error.message : 'Could not prepare the final leaderboard. Retrying…');
        setTimeout(() => { void loadGame(); }, 1500);
      });
  }, [isHost, loadGame, room, round]);

  const rematch = async () => {
    if (!room || !isHost || rematching) return;
    setRematching(true);
    setNotice(null);
    try {
      await requestRematch(room.id);
      await loadGame();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start the rematch.');
      setRematching(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#7CFD4D" /></View>;
  if (!room || !player) return <View style={styles.center}><Text style={styles.message}>{notice ?? 'Game unavailable.'}</Text><Pressable onPress={() => router.replace('/game-lobby')}><Text style={styles.link}>Back to home</Text></Pressable></View>;

  if (room.status === 'ended') return <Leaderboard isHost={isHost} isRematching={rematching} roomId={room.id} onRematch={rematch} onExit={() => router.replace('/game-lobby')} />;
  if (room.status === 'lobby') return <View style={styles.center}><ActivityIndicator color="#7CFD4D" /><Text style={styles.message}>Preparing the rematch…</Text></View>;
  const roundNumber = round?.round_number ?? (room.current_round_id ? room.current_round + 1 : (room.current_round || 1));
  const categories = categoryEntries(room.category_pack, room.category_labels);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.replace('/game-lobby')}><AntDesign name="close" color="#9CB7A1" size={22} /></Pressable>
        <View style={styles.roomIdentity}>
          <Text style={styles.roomCode}>{room.code}</Text>
          <Text style={connectionStatus === 'connected' ? styles.liveText : styles.reconnectingText}>
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}
          </Text>
        </View>
        <Text style={styles.roundCount}>R{Math.min(roundNumber, room.max_rounds)}/{room.max_rounds}</Text>
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={styles.content}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled">
        {notice && <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
        {!round && <LetterPicker number={roundNumber} isHost={isHost} isPublic={room.is_public} onPick={chooseLetter} busy={saving} />}
        {round?.status === 'active' && <AnswerEntry categories={categories} round={round} answers={answers} onChange={setAnswers} secondsLeft={secondsLeft} submitting={submittingAnswers} closing={saving} submitted={hasSubmitted} isHost={isHost} isPublic={room.is_public} onSubmit={submitAnswers} onEnd={finishSubmissions} />}
        {round?.status === 'submitted' && <Review categories={categories} round={round} answers={reviewAnswers} isHost={isHost} onValidate={validate} onConfirm={confirmReview} busy={saving} />}
        {round?.status === 'ended' && (round.round_number >= room.max_rounds
          ? <Waiting text="Preparing the final leaderboard…" />
          : isHost
            ? <LetterPicker number={round.round_number + 1} isHost isPublic={room.is_public} onPick={chooseLetter} busy={saving} />
            : <RoundComplete />)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function LetterPicker({ number, isHost, isPublic, onPick, busy }: { number: number; isHost: boolean; isPublic: boolean; onPick: (letter: string) => void; busy: boolean }) {
  const [hoveredLetter, setHoveredLetter] = useState<string | null>(null);
  const [focusedLetter, setFocusedLetter] = useState<string | null>(null);

  if (!isHost) return <Waiting text="The host is choosing the letter for this round…" />;
  if (isPublic) return <View><Text style={styles.kicker}>ROUND {number}</Text><Text style={styles.title}>Ready for the draw?</Text><Text style={styles.subtitle}>The server picks an unused letter so Quick Match stays fair for everyone.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => onPick('A')} style={[styles.primaryButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#071108" /> : <Text style={styles.primaryText}>Draw letter & start</Text>}</Pressable></View>;
  return <View><Text style={styles.kicker}>ROUND {number}</Text><Text style={styles.title}>Choose a letter</Text><Text style={styles.subtitle}>Everyone’s answers must start with this letter.</Text><View style={styles.letters}>{LETTERS.map(letter => {
    const highlighted = hoveredLetter === letter || focusedLetter === letter;
    return <Pressable accessibilityRole="button" accessibilityLabel={`Choose letter ${letter}`} feedback="selection" testID={`letter-option-${letter}`} disabled={busy} key={letter} onHoverIn={() => setHoveredLetter(letter)} onHoverOut={() => setHoveredLetter(current => current === letter ? null : current)} onFocus={() => setFocusedLetter(letter)} onBlur={() => setFocusedLetter(current => current === letter ? null : current)} onPress={() => onPick(letter)} style={({ pressed }) => [styles.letter, (highlighted || pressed) && styles.letterHighlighted]}><View style={styles.letterGlyph}><Text style={[styles.letterText, styles.centeredLetterText, highlighted && styles.letterTextHighlighted]}>{letter}</Text></View></Pressable>;
  })}</View></View>;
}

export function AnswerEntry({ categories, round, answers, onChange, secondsLeft, submitting, closing, submitted, isHost, isPublic, onSubmit, onEnd }: { categories: ReturnType<typeof categoryEntries>; round: Round; answers: AnswerValues; onChange: (next: AnswerValues) => void; secondsLeft: number; submitting: boolean; closing: boolean; submitted: boolean; isHost: boolean; isPublic: boolean; onSubmit: () => void; onEnd: () => void }) {
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const [letterEntrance] = useState(() => new Animated.Value(0.65));
  const [timerPulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.spring(letterEntrance, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [letterEntrance, round.id]);

  useEffect(() => {
    if (secondsLeft > 10 || secondsLeft < 1) return;
    Animated.sequence([
      Animated.timing(timerPulse, { toValue: 1.08, duration: 110, useNativeDriver: true }),
      Animated.timing(timerPulse, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [secondsLeft, timerPulse]);

  const actionsBusy = submitting || closing;
  return <View><View style={styles.gameHeader}><View><Text style={styles.kicker}>LETTER</Text><Animated.Text style={[styles.bigLetter, { transform: [{ scale: letterEntrance }] }]}>{round.letter}</Animated.Text></View><Animated.View style={[styles.timer, secondsLeft <= 10 && styles.timerDanger, { transform: [{ scale: timerPulse }] }]}><Text style={styles.timerText}>{clock}</Text></Animated.View></View><Text style={styles.subtitle}>{submitted ? 'Answers submitted. Waiting for the round to end.' : 'Enter one answer for each category. Answers save automatically.'}</Text><View style={styles.fields}>{categories.map(({ key, label }) => <View key={key}><Text style={styles.label}>{label}</Text><TextInput testID={`answer-${key}`} value={answers[key]} onChangeText={text => onChange({ ...answers, [key]: text })} autoCapitalize="words" autoCorrect={false} editable={secondsLeft > 0 && !submitted} placeholder={`${label} starting with ${round.letter}`} placeholderTextColor="#6C806F" style={[styles.input, submitted && styles.disabled]} /></View>)}</View><Pressable accessibilityRole="button" testID="submit-answers-button" disabled={actionsBusy || secondsLeft === 0 || submitted} onPress={onSubmit} style={[styles.primaryButton, (actionsBusy || secondsLeft === 0 || submitted) && styles.disabled]}>{submitting ? <ActivityIndicator testID="submit-answers-spinner" color="#071108" /> : <Text style={styles.primaryText}>{submitted ? 'Answers submitted' : 'Submit answers'}</Text>}</Pressable>{isHost && <Pressable accessibilityRole="button" testID="close-submissions-button" disabled={actionsBusy} onPress={onEnd} style={[styles.secondaryButton, actionsBusy && styles.disabled]}>{closing ? <ActivityIndicator testID="close-submissions-spinner" color="#E6F3E8" /> : <Text style={styles.secondaryText}>{isPublic ? 'End submissions & score' : 'End submissions & review'}</Text>}</Pressable>}</View>;
}

export function Review({ categories, round, answers, isHost, onValidate, onConfirm, busy }: { categories: ReturnType<typeof categoryEntries>; round: Round; answers: GameAnswer[]; isHost: boolean; onValidate: (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => void; onConfirm: () => void; busy: boolean }) {
  const duplicateKeys = duplicateAnswerKeys(answers);
  return <View><Text style={styles.kicker}>ROUND {round.round_number}</Text><Text style={styles.title}>{isHost ? 'Review answers' : 'Review in progress'}</Text><Text style={styles.subtitle}>{isHost ? 'Letter-matching answers are pre-approved. Unique answers earn 10 points; duplicates earn 5. Tap × to reject an answer.' : 'Watch the host review each answer. Decisions and scores update live.'}</Text>{answers.length === 0 ? <Waiting text="No answers were submitted this round." /> : answers.map(answer => <View key={answer.id} style={styles.answerCard}><Text style={styles.playerName}>{answer.player_name}</Text>{categories.map(({ key, label }) => {
    const verdict = answer[`${key}_valid` as keyof GameAnswer] as boolean | null;
    return <View key={key} style={styles.reviewRow}><View style={styles.reviewAnswer}><View style={styles.reviewLabelRow}><Text style={styles.reviewCategory}>{label}</Text>{duplicateKeys.has(`${answer.id}:${key}`) && <Text testID={`duplicate-${answer.player_name}-${key}`} style={styles.duplicateBadge}>DUPLICATE · 5 PTS</Text>}</View><Text style={styles.reviewValue}>{answer[key] || '—'}</Text></View>{isHost ? <><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${answer.player_name}'s ${label} answer valid`} testID={`score-${answer.player_name}-${key}-valid`} disabled={busy} onPress={() => onValidate(answer, key, true)} style={[styles.vote, busy && styles.disabled, verdict === true && styles.voteYes]}><Text style={styles.voteText}>✓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${answer.player_name}'s ${label} answer invalid`} testID={`score-${answer.player_name}-${key}-invalid`} disabled={busy} onPress={() => onValidate(answer, key, false)} style={[styles.vote, busy && styles.disabled, verdict === false && styles.voteNo]}><Text style={styles.voteText}>×</Text></Pressable></> : <View accessibilityLabel={`${label} marked ${verdict === true ? 'right' : verdict === false ? 'wrong' : 'pending'}`} testID={`verdict-${answer.player_name}-${key}`} style={[styles.guestVerdict, verdict === true && styles.voteYes, verdict === false && styles.voteNo]}><Text style={styles.guestVerdictText}>{verdict === true ? '✓' : verdict === false ? '×' : '…'}</Text></View>}</View>;
  })}<Text style={styles.points}>{answer.points_earned} points</Text></View>)}{isHost && <Pressable accessibilityRole="button" testID="confirm-round-button" disabled={busy} onPress={onConfirm} style={[styles.primaryButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#071108" /> : <Text style={styles.primaryText}>Confirm round scores</Text>}</Pressable>}</View>;
}

function RoundComplete() {
  return <Waiting text="Round complete. The host will start the next round shortly." />;
}

function Waiting({ text }: { text: string }) { return <View style={styles.waiting}><ActivityIndicator color="#7CFD4D" /><Text style={styles.waitingText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A' }, center: { flex: 1, backgroundColor: '#0A120A', padding: 24, justifyContent: 'center', gap: 16 }, content: { padding: 24, paddingBottom: 48, maxWidth: 540, width: '100%', alignSelf: 'center' }, topBar: { paddingHorizontal: 24, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, roomIdentity: { alignItems: 'center', gap: 2 }, roomCode: { color: '#7CFD4D', fontFamily: Fonts.mono, letterSpacing: 2 }, liveText: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.2 }, reconnectingText: { color: '#F8D77A', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8 }, roundCount: { color: '#9CB7A1', fontFamily: Fonts.mono }, kicker: { color: '#9CB7A1', letterSpacing: 2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 }, title: { color: '#F3FFF6', fontSize: 34, fontWeight: '900', fontFamily: Fonts.rounded, marginBottom: 8 }, subtitle: { color: '#CFE7D4', lineHeight: 22, fontSize: 15, fontFamily: Fonts.sans, marginBottom: 24 }, letters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }, letter: { width: '16.6%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, letterHighlighted: { backgroundColor: 'rgba(124,253,77,0.2)', borderColor: '#7CFD4D', shadowColor: '#7CFD4D', shadowOpacity: 0.34, shadowRadius: 7 }, letterText: { color: '#F3FFF6', fontSize: 20, fontWeight: '800', fontFamily: Fonts.mono }, letterTextHighlighted: { color: '#7CFD4D' }, gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, bigLetter: { fontSize: 76, lineHeight: 80, color: '#7CFD4D', fontFamily: Fonts.rounded, fontWeight: '900' }, timer: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(124,253,77,0.14)', borderWidth: 1, borderColor: 'rgba(124,253,77,0.35)' }, timerDanger: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(248,113,113,0.5)' }, timerText: { color: '#F3FFF6', fontFamily: Fonts.mono, fontSize: 24, fontWeight: '800' }, fields: { gap: 14, marginBottom: 24 }, label: { color: '#9CB7A1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: Fonts.mono, marginBottom: 6 }, input: { height: 52, paddingHorizontal: 14, borderRadius: 12, color: '#F3FFF6', fontSize: 16, fontFamily: Fonts.sans, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: '#7CFD4D', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 10 }, primaryText: { color: '#071108', fontFamily: Fonts.sans, fontSize: 16, fontWeight: '900' }, secondaryButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginTop: 12 }, secondaryText: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '700' }, disabled: { opacity: 0.55 }, notice: { backgroundColor: 'rgba(248, 180, 0, 0.12)', borderWidth: 1, borderColor: 'rgba(248, 180, 0, 0.35)', padding: 12, borderRadius: 10, marginBottom: 18 }, noticeText: { color: '#F8D77A', fontFamily: Fonts.sans, fontSize: 13 }, waiting: { alignItems: 'center', gap: 12, padding: 28, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, waitingText: { color: '#CFE7D4', textAlign: 'center', fontFamily: Fonts.sans, lineHeight: 21 }, answerCard: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, playerName: { color: '#F3FFF6', fontSize: 16, fontWeight: '800', fontFamily: Fonts.sans, flex: 1 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, reviewAnswer: { flex: 1 }, reviewCategory: { color: '#9CB7A1', textTransform: 'uppercase', fontFamily: Fonts.mono, fontSize: 10 }, reviewValue: { color: '#E6F3E8', fontFamily: Fonts.sans, fontSize: 15, marginTop: 2 }, vote: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }, guestVerdict: { width: 40, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }, guestVerdictText: { color: '#fff', fontSize: 20, fontWeight: '900' }, voteYes: { backgroundColor: '#31A661' }, voteNo: { backgroundColor: '#BE3B3B' }, voteText: { color: '#fff', fontSize: 20, fontWeight: '800' }, points: { color: '#7CFD4D', fontFamily: Fonts.mono, marginTop: 14, textAlign: 'right' }, message: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 16 }, link: { color: '#7CFD4D', fontFamily: Fonts.sans, fontWeight: '700' }, leaderboard: { gap: 10, marginVertical: 18 }, leaderRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)' }, position: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800', width: 32 }, score: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800' },
  reviewLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  duplicateBadge: { color: '#F8D77A', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.4 },
  letterGlyph: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  centeredLetterText: { width: '100%', lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
});
