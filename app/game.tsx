import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { applyAnswerScore, remainingRoundSeconds } from '@/features/game/game-state';
import { Leaderboard } from '@/features/game/leaderboard';
import {
  closeSubmissions,
  confirmRound,
  endGame as endGameSession,
  saveGameAnswers,
  scoreAnswer,
  startRound,
} from '@/features/game/game-service';
import { supabase } from '@/lib/supabase/client';
import { AnswerValues, CATEGORIES, EMPTY_ANSWERS, GameAnswer, getPlayer, Player, Room, Round } from '@/lib/game';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [reviewAnswers, setReviewAnswers] = useState<GameAnswer[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const answersReady = useRef(false);
  const endRequested = useRef(false);

  const isHost = Boolean(room && session?.user.id && room.host_id === session.user.id);

  const loadGame = useCallback(async () => {
    if (!roomId || !session?.user.id) {
      setNotice('This game link is incomplete.');
      setLoading(false);
      return;
    }

    try {
      const { data: nextRoom, error: roomError } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (roomError) throw roomError;
      if (!nextRoom) throw new Error('This room is no longer available.');

      const nextPlayer = await getPlayer(roomId, session.user.id);
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
  }, [roomId, session?.user.id]);

  useEffect(() => { loadGame(); }, [loadGame]);

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
    const { data, error } = await supabase.from('answers').select('*').eq('round_id', round.id).order('player_name');
    if (error) {
      setNotice('Submitted answers could not be loaded.');
      return;
    }
    setReviewAnswers((data ?? []) as GameAnswer[]);
  }, [round]);

  useEffect(() => {
    if (round?.status === 'active') loadMyAnswers();
    if (round?.status === 'submitted') loadReviewAnswers();
  }, [round?.id, round?.status, loadMyAnswers, loadReviewAnswers]);

  useEffect(() => {
    if (!roomId) return;
    let active = true;

    const channel = supabase.channel(`mobile-game-${roomId}`)
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
        closeSubmissions(round.id).catch(() => {
          // The database clock is authoritative. Retry if this device reached
          // zero slightly early instead of leaving the round stuck.
          endRequested.current = false;
        });
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [round, room]);

  useEffect(() => {
    if (!round || !player || round.status !== 'active' || !answersReady.current || hasSubmitted) return;
    const timer = setTimeout(() => {
      setSaving(true);
      saveGameAnswers(roomId, round.id, answers).catch(error => setNotice(error.message)).finally(() => setSaving(false));
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
    if (!round || !player) return;
    setSaving(true);
    try {
      await saveGameAnswers(roomId, round.id, answers, true);
      setHasSubmitted(true);
      setNotice('Answers submitted. Waiting for the host to review.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not submit answers'); }
    finally { setSaving(false); }
  };

  const finishSubmissions = async () => {
    if (!round || !isHost) return;
    try {
      await closeSubmissions(round.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not close submissions.');
    }
  };

  const validate = async (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => {
    if (saving) return;
    const previous = answer;
    setSaving(true);
    setReviewAnswers(current => current.map(item => item.id === answer.id
      ? applyAnswerScore(item, category, valid, item.points_earned)
      : item));
    try {
      const points = await scoreAnswer(answer.id, category, valid);
      setReviewAnswers(current => current.map(item => item.id === answer.id
        ? applyAnswerScore(item, category, valid, points)
        : item));
    } catch (error) {
      setReviewAnswers(current => current.map(item => item.id === answer.id ? previous : item));
      setNotice(error instanceof Error ? error.message : 'Could not score this answer.');
    } finally {
      setSaving(false);
    }
  };

  const confirmReview = async () => {
    if (!round || !room || !isHost) return;
    setSaving(true);
    try {
      await confirmRound(round.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not confirm this round'); }
    finally { setSaving(false); }
  };

  const endGame = async () => {
    if (!room || !isHost) return;
    try {
      await endGameSession(room.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not end the game.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#7CFD4D" /></View>;
  if (!room || !player) return <View style={styles.center}><Text style={styles.message}>{notice ?? 'Game unavailable.'}</Text><Pressable onPress={() => router.replace('/game-lobby')}><Text style={styles.link}>Back to home</Text></Pressable></View>;

  if (room.status === 'ended') return <Leaderboard roomId={room.id} onExit={() => router.replace('/game-lobby')} />;
  const roundNumber = round?.round_number ?? (room.current_round_id ? room.current_round + 1 : (room.current_round || 1));

  return (
    <View style={styles.container}>
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice && <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
        {!round && <LetterPicker number={roundNumber} isHost={isHost} onPick={chooseLetter} busy={saving} />}
        {round?.status === 'active' && <AnswerEntry round={round} answers={answers} onChange={setAnswers} secondsLeft={secondsLeft} saving={saving} submitted={hasSubmitted} isHost={isHost} onSubmit={submitAnswers} onEnd={finishSubmissions} />}
        {round?.status === 'submitted' && <Review round={round} answers={reviewAnswers} isHost={isHost} onValidate={validate} onConfirm={confirmReview} busy={saving} />}
        {round?.status === 'ended' && (round.round_number >= room.max_rounds
          ? <RoundComplete isHost={isHost} final onFinish={endGame} />
          : isHost
            ? <LetterPicker number={round.round_number + 1} isHost onPick={chooseLetter} busy={saving} />
            : <RoundComplete isHost={false} final={false} onFinish={endGame} />)}
      </ScrollView>
    </View>
  );
}

function LetterPicker({ number, isHost, onPick, busy }: { number: number; isHost: boolean; onPick: (letter: string) => void; busy: boolean }) {
  if (!isHost) return <Waiting text="The host is choosing the letter for this round…" />;
  return <View><Text style={styles.kicker}>ROUND {number}</Text><Text style={styles.title}>Choose a letter</Text><Text style={styles.subtitle}>Everyone’s answers must start with this letter.</Text><View style={styles.letters}>{LETTERS.map(letter => <Pressable accessibilityRole="button" testID={`letter-option-${letter}`} disabled={busy} key={letter} onPress={() => onPick(letter)} style={styles.letter}><View style={styles.letterGlyph}><Text style={[styles.letterText, styles.centeredLetterText]}>{letter}</Text></View></Pressable>)}</View></View>;
}

function AnswerEntry({ round, answers, onChange, secondsLeft, saving, submitted, isHost, onSubmit, onEnd }: { round: Round; answers: AnswerValues; onChange: (next: AnswerValues) => void; secondsLeft: number; saving: boolean; submitted: boolean; isHost: boolean; onSubmit: () => void; onEnd: () => void }) {
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  return <View><View style={styles.gameHeader}><View><Text style={styles.kicker}>LETTER</Text><Text style={styles.bigLetter}>{round.letter}</Text></View><View style={[styles.timer, secondsLeft <= 10 && styles.timerDanger]}><Text style={styles.timerText}>{clock}</Text></View></View><Text style={styles.subtitle}>{submitted ? 'Answers submitted. Waiting for review.' : 'Enter one answer for each category. Answers save automatically.'}</Text><View style={styles.fields}>{CATEGORIES.map(category => <View key={category}><Text style={styles.label}>{category}</Text><TextInput testID={`answer-${category}`} value={answers[category]} onChangeText={text => onChange({ ...answers, [category]: text })} autoCapitalize="words" autoCorrect={false} editable={secondsLeft > 0 && !submitted} placeholder={`A ${category} starting with ${round.letter}`} placeholderTextColor="#6C806F" style={[styles.input, submitted && styles.disabled]} /></View>)}</View><Pressable accessibilityRole="button" testID="submit-answers-button" disabled={saving || secondsLeft === 0 || submitted} onPress={onSubmit} style={[styles.primaryButton, (saving || secondsLeft === 0 || submitted) && styles.disabled]}>{saving ? <ActivityIndicator color="#071108" /> : <Text style={styles.primaryText}>{submitted ? 'Answers submitted' : 'Submit answers'}</Text>}</Pressable>{isHost && <Pressable accessibilityRole="button" testID="close-submissions-button" onPress={onEnd} style={styles.secondaryButton}><Text style={styles.secondaryText}>End submissions & review</Text></Pressable>}</View>;
}

function Review({ round, answers, isHost, onValidate, onConfirm, busy }: { round: Round; answers: GameAnswer[]; isHost: boolean; onValidate: (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => void; onConfirm: () => void; busy: boolean }) {
  if (!isHost) return <Waiting text="The host is reviewing answers. Scores will update when the round is confirmed." />;
  return <View><Text style={styles.kicker}>ROUND {round.round_number}</Text><Text style={styles.title}>Review answers</Text><Text style={styles.subtitle}>Tap ✓ for valid answers. Untouched answers score zero.</Text>{answers.length === 0 ? <Waiting text="No answers were submitted this round." /> : answers.map(answer => <View key={answer.id} style={styles.answerCard}><Text style={styles.playerName}>{answer.player_name}</Text>{CATEGORIES.map(category => <View key={category} style={styles.reviewRow}><View style={styles.reviewAnswer}><Text style={styles.reviewCategory}>{category}</Text><Text style={styles.reviewValue}>{answer[category] || '—'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${answer.player_name}'s ${category} answer valid`} testID={`score-${answer.player_name}-${category}-valid`} disabled={busy} onPress={() => onValidate(answer, category, true)} style={[styles.vote, busy && styles.disabled, answer[`${category}_valid` as keyof GameAnswer] === true && styles.voteYes]}><Text style={styles.voteText}>✓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${answer.player_name}'s ${category} answer invalid`} testID={`score-${answer.player_name}-${category}-invalid`} disabled={busy} onPress={() => onValidate(answer, category, false)} style={[styles.vote, busy && styles.disabled, answer[`${category}_valid` as keyof GameAnswer] === false && styles.voteNo]}><Text style={styles.voteText}>×</Text></Pressable></View>)}<Text style={styles.points}>{answer.points_earned} points</Text></View>)}<Pressable accessibilityRole="button" testID="confirm-round-button" disabled={busy} onPress={onConfirm} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>Confirm round scores</Text></Pressable></View>;
}

function RoundComplete({ isHost, final, onFinish }: { isHost: boolean; final: boolean; onFinish: () => void }) {
  if (!isHost) return <Waiting text={final ? 'The game is complete. Waiting for final results…' : 'Round complete. The host will start the next round shortly.'} />;
  return <View><Text style={styles.title}>{final ? 'Final round complete' : 'Round complete'}</Text><Text style={styles.subtitle}>{final ? 'Ready to see the winner?' : 'The host is choosing the next letter.'}</Text>{final && <Pressable accessibilityRole="button" testID="show-final-results" onPress={onFinish} style={styles.primaryButton}><Text style={styles.primaryText}>Show final results</Text></Pressable>}</View>;
}

function Waiting({ text }: { text: string }) { return <View style={styles.waiting}><ActivityIndicator color="#7CFD4D" /><Text style={styles.waitingText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A' }, center: { flex: 1, backgroundColor: '#0A120A', padding: 24, justifyContent: 'center', gap: 16 }, content: { padding: 24, paddingBottom: 48, maxWidth: 540, width: '100%', alignSelf: 'center' }, topBar: { paddingHorizontal: 24, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, roomIdentity: { alignItems: 'center', gap: 2 }, roomCode: { color: '#7CFD4D', fontFamily: Fonts.mono, letterSpacing: 2 }, liveText: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.2 }, reconnectingText: { color: '#F8D77A', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8 }, roundCount: { color: '#9CB7A1', fontFamily: Fonts.mono }, kicker: { color: '#9CB7A1', letterSpacing: 2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 }, title: { color: '#F3FFF6', fontSize: 34, fontWeight: '900', fontFamily: Fonts.rounded, marginBottom: 8 }, subtitle: { color: '#CFE7D4', lineHeight: 22, fontSize: 15, fontFamily: Fonts.sans, marginBottom: 24 }, letters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }, letter: { width: '16.6%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, letterText: { color: '#F3FFF6', fontSize: 20, fontWeight: '800', fontFamily: Fonts.mono }, gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, bigLetter: { fontSize: 76, lineHeight: 80, color: '#7CFD4D', fontFamily: Fonts.rounded, fontWeight: '900' }, timer: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(124,253,77,0.14)', borderWidth: 1, borderColor: 'rgba(124,253,77,0.35)' }, timerDanger: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(248,113,113,0.5)' }, timerText: { color: '#F3FFF6', fontFamily: Fonts.mono, fontSize: 24, fontWeight: '800' }, fields: { gap: 14, marginBottom: 24 }, label: { color: '#9CB7A1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: Fonts.mono, marginBottom: 6 }, input: { height: 52, paddingHorizontal: 14, borderRadius: 12, color: '#F3FFF6', fontSize: 16, fontFamily: Fonts.sans, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: '#7CFD4D', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 10 }, primaryText: { color: '#071108', fontFamily: Fonts.sans, fontSize: 16, fontWeight: '900' }, secondaryButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginTop: 12 }, secondaryText: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '700' }, disabled: { opacity: 0.55 }, notice: { backgroundColor: 'rgba(248, 180, 0, 0.12)', borderWidth: 1, borderColor: 'rgba(248, 180, 0, 0.35)', padding: 12, borderRadius: 10, marginBottom: 18 }, noticeText: { color: '#F8D77A', fontFamily: Fonts.sans, fontSize: 13 }, waiting: { alignItems: 'center', gap: 12, padding: 28, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, waitingText: { color: '#CFE7D4', textAlign: 'center', fontFamily: Fonts.sans, lineHeight: 21 }, answerCard: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, playerName: { color: '#F3FFF6', fontSize: 16, fontWeight: '800', fontFamily: Fonts.sans, flex: 1 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, reviewAnswer: { flex: 1 }, reviewCategory: { color: '#9CB7A1', textTransform: 'uppercase', fontFamily: Fonts.mono, fontSize: 10 }, reviewValue: { color: '#E6F3E8', fontFamily: Fonts.sans, fontSize: 15, marginTop: 2 }, vote: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }, voteYes: { backgroundColor: '#31A661' }, voteNo: { backgroundColor: '#BE3B3B' }, voteText: { color: '#fff', fontSize: 20, fontWeight: '800' }, points: { color: '#7CFD4D', fontFamily: Fonts.mono, marginTop: 14, textAlign: 'right' }, message: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 16 }, link: { color: '#7CFD4D', fontFamily: Fonts.sans, fontWeight: '700' }, leaderboard: { gap: 10, marginVertical: 18 }, leaderRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)' }, position: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800', width: 32 }, score: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800' },
  letterGlyph: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  centeredLetterText: { width: '100%', lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
});
