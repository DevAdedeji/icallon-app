import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { answerPoints, AnswerValues, CATEGORIES, createId, EMPTY_ANSWERS, GameAnswer, getPlayer, Player, Room, Round, saveAnswers } from '@/lib/game';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function GameScreen() {
  const { roomId, roomCode } = useLocalSearchParams<{ roomId: string; roomCode: string }>();
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [reviewAnswers, setReviewAnswers] = useState<GameAnswer[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const answersReady = useRef(false);
  const endRequested = useRef(false);

  const isHost = !!room && !!player && room.host_id === player.user_id;

  const loadGame = useCallback(async () => {
    if (!roomId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: nextRoom, error: roomError } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (roomError || !nextRoom) { setNotice('This room is no longer available.'); setLoading(false); return; }
    const nextPlayer = await getPlayer(roomId, user.id);
    if (!nextPlayer) { setNotice('You are not a player in this room.'); setLoading(false); return; }
    setRoom(nextRoom as Room);
    setPlayer(nextPlayer);
    if (nextRoom.current_round_id) {
      const { data: nextRound } = await supabase.from('rounds').select('*').eq('id', nextRoom.current_round_id).maybeSingle();
      setRound((nextRound as Round | null) ?? null);
    } else setRound(null);
    setLoading(false);
  }, [roomId]);

  useEffect(() => { loadGame(); }, [loadGame]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`mobile-game-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => loadGame())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, () => loadGame())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${roomId}` }, () => {
        if (round?.status === 'submitted') loadReviewAnswers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // loadReviewAnswers is defined below and intentionally invoked only by realtime events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, loadGame, round?.status]);

  const loadMyAnswers = useCallback(async () => {
    if (!round || !player) return;
    answersReady.current = false;
    const { data } = await supabase.from('answers').select('name, animal, place, thing').eq('round_id', round.id).eq('player_id', player.id).maybeSingle();
    setAnswers({ name: data?.name ?? '', animal: data?.animal ?? '', place: data?.place ?? '', thing: data?.thing ?? '' });
    answersReady.current = true;
  }, [round, player]);

  const loadReviewAnswers = useCallback(async () => {
    if (!round) return;
    const { data, error } = await supabase.from('answers').select('*').eq('round_id', round.id).order('player_name');
    if (!error) setReviewAnswers((data ?? []) as GameAnswer[]);
  }, [round]);

  useEffect(() => {
    if (round?.status === 'active') loadMyAnswers();
    if (round?.status === 'submitted') loadReviewAnswers();
  }, [round?.id, round?.status, loadMyAnswers, loadReviewAnswers]);

  useEffect(() => {
    if (!round || round.status !== 'active' || !room) return;
    endRequested.current = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(round.started_at).getTime() + room.time_per_round * 1000 - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && isHost && !endRequested.current) {
        endRequested.current = true;
        supabase.from('rounds').update({ status: 'submitted', ended_at: new Date().toISOString() }).eq('id', round.id).then(({ error }) => {
          if (error) setNotice(error.message);
        });
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [round, room, isHost]);

  useEffect(() => {
    if (!round || !player || round.status !== 'active' || !answersReady.current) return;
    const timer = setTimeout(() => {
      setSaving(true);
      saveAnswers({ roomId, roundId: round.id, player, values: answers }).catch(error => setNotice(error.message)).finally(() => setSaving(false));
    }, 700);
    return () => clearTimeout(timer);
  }, [answers, player, roomId, round]);

  const chooseLetter = async (letter: string) => {
    if (!room || !isHost || saving) return;
    setSaving(true);
    const nextRoundNumber = room.current_round_id ? room.current_round + 1 : (room.current_round || 1);
    try {
      const { data: nextRound, error } = await supabase.from('rounds').insert({
        id: createId(), room_id: room.id, round_number: nextRoundNumber, letter, status: 'active', started_at: new Date().toISOString(),
      }).select().single();
      if (error || !nextRound) throw error ?? new Error('Could not start the round');
      const { error: roomError } = await supabase.from('rooms').update({ current_round: nextRoundNumber, current_round_id: nextRound.id }).eq('id', room.id);
      if (roomError) throw roomError;
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start the round'); }
    finally { setSaving(false); }
  };

  const submitAnswers = async () => {
    if (!round || !player) return;
    setSaving(true);
    try {
      await saveAnswers({ roomId, roundId: round.id, player, values: answers, submitted: true });
      setNotice('Answers submitted. You can still wait for the host to review.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not submit answers'); }
    finally { setSaving(false); }
  };

  const finishSubmissions = async () => {
    if (!round || !isHost) return;
    const { error } = await supabase.from('rounds').update({ status: 'submitted', ended_at: new Date().toISOString() }).eq('id', round.id);
    if (error) setNotice(error.message);
  };

  const validate = async (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => {
    const changed = { ...answer, [`${category}_valid`]: valid } as GameAnswer;
    const points = answerPoints(changed);
    setReviewAnswers(current => current.map(item => item.id === answer.id ? { ...changed, points_earned: points } : item));
    const { error } = await supabase.from('answers').update({ [`${category}_valid`]: valid, points_earned: points, updated_at: new Date().toISOString() }).eq('id', answer.id);
    if (error) { setNotice(error.message); loadReviewAnswers(); }
  };

  const confirmReview = async () => {
    if (!round || !room || !isHost) return;
    setSaving(true);
    try {
      const { data: allAnswers, error: answersError } = await supabase.from('answers').select('player_id, points_earned').eq('room_id', room.id);
      if (answersError) throw answersError;
      const totals = new Map<string, number>();
      for (const answer of allAnswers ?? []) totals.set(answer.player_id, (totals.get(answer.player_id) ?? 0) + (answer.points_earned ?? 0));
      for (const [playerId, score] of totals) {
        const { error } = await supabase.from('players').update({ total_score: score }).eq('id', playerId);
        if (error) throw error;
      }
      const { error } = await supabase.from('rounds').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', round.id);
      if (error) throw error;
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not confirm this round'); }
    finally { setSaving(false); }
  };

  const endGame = async () => {
    if (!room || !isHost) return;
    const { error } = await supabase.from('rooms').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', room.id);
    if (error) setNotice(error.message);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#7CFD4D" /></View>;
  if (!room || !player) return <View style={styles.center}><Text style={styles.message}>{notice ?? 'Game unavailable.'}</Text><Pressable onPress={() => router.replace('/game-lobby')}><Text style={styles.link}>Back to home</Text></Pressable></View>;

  if (room.status === 'ended') return <Leaderboard roomId={room.id} onExit={() => router.replace('/game-lobby')} />;
  const roundNumber = round?.round_number ?? (room.current_round_id ? room.current_round + 1 : (room.current_round || 1));

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.replace('/game-lobby')}><AntDesign name="close" color="#9CB7A1" size={22} /></Pressable>
        <Text style={styles.roomCode}>{roomCode}</Text>
        <Text style={styles.roundCount}>R{Math.min(roundNumber, room.max_rounds)}/{room.max_rounds}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice && <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
        {!round && <LetterPicker number={roundNumber} isHost={isHost} onPick={chooseLetter} busy={saving} />}
        {round?.status === 'active' && <AnswerEntry round={round} answers={answers} onChange={setAnswers} secondsLeft={secondsLeft} saving={saving} isHost={isHost} onSubmit={submitAnswers} onEnd={finishSubmissions} />}
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
  return <View><Text style={styles.kicker}>ROUND {number}</Text><Text style={styles.title}>Choose a letter</Text><Text style={styles.subtitle}>Everyone’s answers must start with this letter.</Text><View style={styles.letters}>{LETTERS.map(letter => <Pressable disabled={busy} key={letter} onPress={() => onPick(letter)} style={styles.letter}><Text style={styles.letterText}>{letter}</Text></Pressable>)}</View></View>;
}

function AnswerEntry({ round, answers, onChange, secondsLeft, saving, isHost, onSubmit, onEnd }: { round: Round; answers: AnswerValues; onChange: (next: AnswerValues) => void; secondsLeft: number; saving: boolean; isHost: boolean; onSubmit: () => void; onEnd: () => void }) {
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  return <View><View style={styles.gameHeader}><View><Text style={styles.kicker}>LETTER</Text><Text style={styles.bigLetter}>{round.letter}</Text></View><View style={[styles.timer, secondsLeft <= 10 && styles.timerDanger]}><Text style={styles.timerText}>{clock}</Text></View></View><Text style={styles.subtitle}>Enter one answer for each category. Answers save automatically.</Text><View style={styles.fields}>{CATEGORIES.map(category => <View key={category}><Text style={styles.label}>{category}</Text><TextInput value={answers[category]} onChangeText={text => onChange({ ...answers, [category]: text })} autoCapitalize="words" autoCorrect={false} editable={secondsLeft > 0} placeholder={`A ${category} starting with ${round.letter}`} placeholderTextColor="#6C806F" style={styles.input} /></View>)}</View><Pressable disabled={saving || secondsLeft === 0} onPress={onSubmit} style={[styles.primaryButton, (saving || secondsLeft === 0) && styles.disabled]}>{saving ? <ActivityIndicator color="#071108" /> : <Text style={styles.primaryText}>Submit answers</Text>}</Pressable>{isHost && <Pressable onPress={onEnd} style={styles.secondaryButton}><Text style={styles.secondaryText}>End submissions & review</Text></Pressable>}</View>;
}

function Review({ round, answers, isHost, onValidate, onConfirm, busy }: { round: Round; answers: GameAnswer[]; isHost: boolean; onValidate: (answer: GameAnswer, category: keyof AnswerValues, valid: boolean) => void; onConfirm: () => void; busy: boolean }) {
  if (!isHost) return <Waiting text="The host is reviewing answers. Scores will update when the round is confirmed." />;
  return <View><Text style={styles.kicker}>ROUND {round.round_number}</Text><Text style={styles.title}>Review answers</Text><Text style={styles.subtitle}>Tap ✓ for valid answers. Untouched answers score zero.</Text>{answers.length === 0 ? <Waiting text="No answers were submitted this round." /> : answers.map(answer => <View key={answer.id} style={styles.answerCard}><Text style={styles.playerName}>{answer.player_name}</Text>{CATEGORIES.map(category => <View key={category} style={styles.reviewRow}><View style={styles.reviewAnswer}><Text style={styles.reviewCategory}>{category}</Text><Text style={styles.reviewValue}>{answer[category] || '—'}</Text></View><Pressable onPress={() => onValidate(answer, category, true)} style={[styles.vote, answer[`${category}_valid` as keyof GameAnswer] === true && styles.voteYes]}><Text style={styles.voteText}>✓</Text></Pressable><Pressable onPress={() => onValidate(answer, category, false)} style={[styles.vote, answer[`${category}_valid` as keyof GameAnswer] === false && styles.voteNo]}><Text style={styles.voteText}>×</Text></Pressable></View>)}<Text style={styles.points}>{answer.points_earned} points</Text></View>)}<Pressable disabled={busy} onPress={onConfirm} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>Confirm round scores</Text></Pressable></View>;
}

function RoundComplete({ isHost, final, onFinish }: { isHost: boolean; final: boolean; onFinish: () => void }) {
  if (!isHost) return <Waiting text={final ? 'The game is complete. Waiting for final results…' : 'Round complete. The host will start the next round shortly.'} />;
  return <View><Text style={styles.title}>{final ? 'Final round complete' : 'Round complete'}</Text><Text style={styles.subtitle}>{final ? 'Ready to see the winner?' : 'The host is choosing the next letter.'}</Text>{final && <Pressable onPress={onFinish} style={styles.primaryButton}><Text style={styles.primaryText}>Show final results</Text></Pressable>}</View>;
}

function Waiting({ text }: { text: string }) { return <View style={styles.waiting}><ActivityIndicator color="#7CFD4D" /><Text style={styles.waitingText}>{text}</Text></View>; }

function Leaderboard({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => { supabase.from('players').select('*').eq('room_id', roomId).order('total_score', { ascending: false }).then(({ data }) => setPlayers((data ?? []) as Player[])); }, [roomId]);
  return <View style={styles.center}><Text style={styles.kicker}>GAME COMPLETE</Text><Text style={styles.title}>Leaderboard</Text><View style={styles.leaderboard}>{players.map((p, index) => <View style={styles.leaderRow} key={p.id}><Text style={styles.position}>{index + 1}</Text><Text style={styles.playerName}>{p.display_name}</Text><Text style={styles.score}>{p.total_score}</Text></View>)}</View><Pressable style={styles.primaryButton} onPress={onExit}><Text style={styles.primaryText}>Back to home</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A' }, center: { flex: 1, backgroundColor: '#0A120A', padding: 24, justifyContent: 'center', gap: 16 }, content: { padding: 24, paddingBottom: 48, maxWidth: 540, width: '100%', alignSelf: 'center' }, topBar: { paddingHorizontal: 24, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, roomCode: { color: '#7CFD4D', fontFamily: Fonts.mono, letterSpacing: 2 }, roundCount: { color: '#9CB7A1', fontFamily: Fonts.mono }, kicker: { color: '#9CB7A1', letterSpacing: 2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 }, title: { color: '#F3FFF6', fontSize: 34, fontWeight: '900', fontFamily: Fonts.rounded, marginBottom: 8 }, subtitle: { color: '#CFE7D4', lineHeight: 22, fontSize: 15, fontFamily: Fonts.sans, marginBottom: 24 }, letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, letter: { width: '16.6%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, letterText: { color: '#F3FFF6', fontSize: 20, fontWeight: '800', fontFamily: Fonts.mono }, gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, bigLetter: { fontSize: 76, lineHeight: 80, color: '#7CFD4D', fontFamily: Fonts.rounded, fontWeight: '900' }, timer: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(124,253,77,0.14)', borderWidth: 1, borderColor: 'rgba(124,253,77,0.35)' }, timerDanger: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(248,113,113,0.5)' }, timerText: { color: '#F3FFF6', fontFamily: Fonts.mono, fontSize: 24, fontWeight: '800' }, fields: { gap: 14, marginBottom: 24 }, label: { color: '#9CB7A1', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: Fonts.mono, marginBottom: 6 }, input: { height: 52, paddingHorizontal: 14, borderRadius: 12, color: '#F3FFF6', fontSize: 16, fontFamily: Fonts.sans, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }, primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: '#7CFD4D', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 10 }, primaryText: { color: '#071108', fontFamily: Fonts.sans, fontSize: 16, fontWeight: '900' }, secondaryButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginTop: 12 }, secondaryText: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '700' }, disabled: { opacity: 0.55 }, notice: { backgroundColor: 'rgba(248, 180, 0, 0.12)', borderWidth: 1, borderColor: 'rgba(248, 180, 0, 0.35)', padding: 12, borderRadius: 10, marginBottom: 18 }, noticeText: { color: '#F8D77A', fontFamily: Fonts.sans, fontSize: 13 }, waiting: { alignItems: 'center', gap: 12, padding: 28, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, waitingText: { color: '#CFE7D4', textAlign: 'center', fontFamily: Fonts.sans, lineHeight: 21 }, answerCard: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, playerName: { color: '#F3FFF6', fontSize: 16, fontWeight: '800', fontFamily: Fonts.sans, flex: 1 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, reviewAnswer: { flex: 1 }, reviewCategory: { color: '#9CB7A1', textTransform: 'uppercase', fontFamily: Fonts.mono, fontSize: 10 }, reviewValue: { color: '#E6F3E8', fontFamily: Fonts.sans, fontSize: 15, marginTop: 2 }, vote: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }, voteYes: { backgroundColor: '#31A661' }, voteNo: { backgroundColor: '#BE3B3B' }, voteText: { color: '#fff', fontSize: 20, fontWeight: '800' }, points: { color: '#7CFD4D', fontFamily: Fonts.mono, marginTop: 14, textAlign: 'right' }, message: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 16 }, link: { color: '#7CFD4D', fontFamily: Fonts.sans, fontWeight: '700' }, leaderboard: { gap: 10, marginVertical: 18 }, leaderRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)' }, position: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800', width: 32 }, score: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800' },
});
