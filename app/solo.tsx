import AntDesign from '@expo/vector-icons/AntDesign';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { CATEGORY_PACKS, categoryEntries, type CategoryPackId } from '@/features/game/category-packs';
import { computerAnswers, scoreSoloRound, soloLetters, type SoloDifficulty, type SoloRoundScore } from '@/features/solo/solo-engine';
import { recordSoloResult } from '@/features/solo/solo-service';
import { EMPTY_ANSWERS, type AnswerValues } from '@/lib/game';

type SoloPack = Exclude<CategoryPackId, 'custom'>;
type Phase = 'setup' | 'answering' | 'review' | 'result';

const DIFFICULTIES: { id: SoloDifficulty; name: string; detail: string }[] = [
  { id: 'easy', name: 'Easy', detail: 'Computer fills 2 categories' },
  { id: 'medium', name: 'Medium', detail: 'Computer fills 3 categories' },
  { id: 'hard', name: 'Hard', detail: 'Computer fills all categories' },
];

function resultId(): string {
  return `solo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function SoloScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; pack?: string; date?: string; seed?: string }>();
  const isDaily = params.mode === 'daily';
  const dailyPack = CATEGORY_PACKS.some((item) => item.id === params.pack) ? params.pack as SoloPack : 'classic';
  const [seed] = useState(() => isDaily && params.seed ? params.seed : resultId());
  const [persistenceId] = useState(resultId);
  const [phase, setPhase] = useState<Phase>(isDaily ? 'answering' : 'setup');
  const [pack, setPack] = useState<SoloPack>(isDaily ? dailyPack : 'classic');
  const [difficulty, setDifficulty] = useState<SoloDifficulty>(isDaily ? 'hard' : 'medium');
  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [opponent, setOpponent] = useState<AnswerValues>(EMPTY_ANSWERS);
  const [roundScore, setRoundScore] = useState<SoloRoundScore | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const letters = useMemo(() => soloLetters(pack, seed), [pack, seed]);
  const categories = categoryEntries(pack, null);
  const letter = letters[roundIndex];

  const begin = () => {
    setRoundIndex(0);
    setAnswers(EMPTY_ANSWERS);
    setPlayerScore(0);
    setOpponentScore(0);
    setRoundScore(null);
    setPhase('answering');
  };

  const submit = () => {
    const nextOpponent = computerAnswers(pack, letter, difficulty, seed);
    const score = scoreSoloRound(answers, nextOpponent, letter);
    setOpponent(nextOpponent);
    setRoundScore(score);
    setPlayerScore((current) => current + score.playerPoints);
    setOpponentScore((current) => current + score.opponentPoints);
    setPhase('review');
  };

  const saveResult = async (finalPlayerScore: number, finalOpponentScore: number) => {
    setSaving(true);
    setSaveError(null);
    try {
      await recordSoloResult({
        resultId: persistenceId,
        difficulty,
        categoryPack: pack,
        playerScore: finalPlayerScore,
        opponentScore: finalOpponentScore,
        mode: isDaily ? 'daily' : 'solo',
        challengeDate: isDaily ? params.date : null,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Your result could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const continueGame = () => {
    if (roundIndex === letters.length - 1) {
      setPhase('result');
      void saveResult(playerScore, opponentScore);
      return;
    }
    setRoundIndex((current) => current + 1);
    setAnswers(EMPTY_ANSWERS);
    setRoundScore(null);
    setPhase('answering');
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrow-left" size={20} color="#CFE7D4" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        {phase !== 'setup' && phase !== 'result' && <Text style={styles.roundIndicator}>ROUND {roundIndex + 1}/{letters.length}</Text>}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {phase === 'setup' && !isDaily && (
          <>
            <Text style={styles.kicker}>SOLO MODE</Text>
            <Text style={styles.title}>Beat the computer</Text>
            <Text style={styles.subtitle}>Three fast rounds. Unique valid answers score 10; matching the computer scores 5.</Text>
            <Text style={styles.sectionLabel}>Choose a pack</Text>
            <View style={styles.options}>
              {CATEGORY_PACKS.map((item) => <Pressable testID={`solo-pack-${item.id}`} key={item.id} onPress={() => setPack(item.id)} style={[styles.option, pack === item.id && styles.optionActive]}><Text style={[styles.optionTitle, pack === item.id && styles.optionTitleActive]}>{item.name}</Text><Text style={styles.optionDetail}>{item.labels.join(' · ')}</Text></Pressable>)}
            </View>
            <Text style={styles.sectionLabel}>Difficulty</Text>
            <View style={styles.options}>
              {DIFFICULTIES.map((item) => <Pressable testID={`solo-difficulty-${item.id}`} key={item.id} onPress={() => setDifficulty(item.id)} style={[styles.option, difficulty === item.id && styles.optionActive]}><Text style={[styles.optionTitle, difficulty === item.id && styles.optionTitleActive]}>{item.name}</Text><Text style={styles.optionDetail}>{item.detail}</Text></Pressable>)}
            </View>
            <Pressable testID="solo-start" accessibilityRole="button" onPress={begin} style={styles.primaryButton}><Text style={styles.primaryText}>Start solo game</Text></Pressable>
          </>
        )}

        {phase === 'answering' && (
          <>
            <Text style={styles.kicker}>{isDaily ? 'DAILY CHALLENGE' : 'YOUR LETTER'}</Text>
            <Text testID="solo-letter" style={styles.letter}>{letter}</Text>
            <Text style={styles.subtitle}>Enter one answer for each category. Blank or wrong-letter answers score zero.</Text>
            <View style={styles.fields}>
              {categories.map(({ key, label }) => <View key={key}><Text style={styles.fieldLabel}>{label}</Text><TextInput testID={`solo-answer-${key}`} value={answers[key]} onChangeText={(value) => setAnswers((current) => ({ ...current, [key]: value }))} autoCapitalize="words" autoCorrect={false} placeholder={`${label} starting with ${letter}`} placeholderTextColor="#6C806F" style={styles.input} /></View>)}
            </View>
            <Pressable testID="solo-submit" accessibilityRole="button" onPress={submit} style={styles.primaryButton}><Text style={styles.primaryText}>Lock in answers</Text></Pressable>
          </>
        )}

        {phase === 'review' && roundScore && (
          <>
            <Text style={styles.kicker}>ROUND {roundIndex + 1} RESULT</Text>
            <Text style={styles.title}>{roundScore.playerPoints >= roundScore.opponentPoints ? 'Strong round!' : 'The computer takes it'}</Text>
            <View style={styles.scoreRow}><ScoreCard name="You" score={roundScore.playerPoints} accent /><ScoreCard name="Computer" score={roundScore.opponentPoints} /></View>
            <View style={styles.reviewList}>
              {categories.map(({ key, label }) => <View key={key} style={styles.reviewCard}><Text style={styles.reviewLabel}>{label}</Text><View style={styles.answerLine}><Text style={styles.answerOwner}>YOU</Text><Text style={styles.answerValue}>{answers[key] || '—'}</Text><Text style={styles.answerPoints}>+{roundScore.playerCategoryPoints[key]}</Text></View><View style={styles.answerLine}><Text style={styles.answerOwner}>CPU</Text><Text style={styles.answerValue}>{opponent[key] || '—'}</Text><Text style={styles.answerPoints}>+{roundScore.opponentCategoryPoints[key]}</Text></View></View>)}
            </View>
            <Pressable testID="solo-next" accessibilityRole="button" onPress={continueGame} style={styles.primaryButton}><Text style={styles.primaryText}>{roundIndex === letters.length - 1 ? 'See final result' : 'Next round'}</Text></Pressable>
          </>
        )}

        {phase === 'result' && (
          <View style={styles.resultWrap}>
            <Text style={styles.resultEmoji}>{playerScore >= opponentScore ? '🏆' : '⚡'}</Text>
            <Text style={styles.kicker}>{isDaily ? 'DAILY COMPLETE' : 'GAME COMPLETE'}</Text>
            <Text testID="solo-result-title" style={styles.title}>{playerScore > opponentScore ? 'You win!' : playerScore === opponentScore ? 'It’s a draw!' : 'Computer wins'}</Text>
            <View style={styles.scoreRow}><ScoreCard name="You" score={playerScore} accent /><ScoreCard name="Computer" score={opponentScore} /></View>
            {saving && <View style={styles.savingRow}><ActivityIndicator color="#7CFD4D" /><Text style={styles.savingText}>Saving result…</Text></View>}
            {saveError && <View style={styles.errorBox}><Text style={styles.errorText}>{saveError}</Text><Pressable onPress={() => void saveResult(playerScore, opponentScore)}><Text style={styles.retryText}>Try again</Text></Pressable></View>}
            {!isDaily && <Pressable accessibilityRole="button" onPress={() => router.replace('/solo')} style={styles.primaryButton}><Text style={styles.primaryText}>Play again</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => router.replace('/game-lobby')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Back to home</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ScoreCard({ name, score, accent = false }: { name: string; score: number; accent?: boolean }) {
  return <View style={[styles.scoreCard, accent && styles.scoreCardAccent]}><Text style={styles.scoreName}>{name}</Text><Text style={[styles.scoreValue, accent && styles.scoreValueAccent]}>{score}</Text><Text style={styles.scoreUnit}>PTS</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A120A' },
  topBar: { minHeight: 66, paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end' },
  backButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  roundIndicator: { marginLeft: 'auto', color: '#9CB7A1', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.4, paddingBottom: 14 },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  kicker: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.1, marginBottom: 8 },
  title: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 34, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, marginBottom: 26 },
  sectionLabel: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 15, fontWeight: '800', marginBottom: 10, marginTop: 4 },
  options: { gap: 9, marginBottom: 24 },
  option: { borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', padding: 13 },
  optionActive: { borderColor: '#7CFD4D', backgroundColor: 'rgba(124,253,77,0.12)' },
  optionTitle: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '800', fontSize: 15 },
  optionTitleActive: { color: '#7CFD4D' },
  optionDetail: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 11, marginTop: 4 },
  letter: { color: '#7CFD4D', fontFamily: Fonts.rounded, fontWeight: '900', fontSize: 86, lineHeight: 96 },
  fields: { gap: 13, marginBottom: 22 },
  fieldLabel: { color: '#9CB7A1', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 },
  input: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.07)', color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 16, paddingHorizontal: 14 },
  primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900', fontSize: 16 },
  secondaryButton: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '800' },
  scoreRow: { flexDirection: 'row', gap: 10, marginVertical: 20 },
  scoreCard: { flex: 1, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.06)', padding: 16 },
  scoreCardAccent: { borderColor: 'rgba(124,253,77,0.5)', backgroundColor: 'rgba(124,253,77,0.11)' },
  scoreName: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  scoreValue: { color: '#F3FFF6', fontFamily: Fonts.mono, fontSize: 30, fontWeight: '900', marginTop: 5 },
  scoreValueAccent: { color: '#7CFD4D' },
  scoreUnit: { color: '#78917D', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.2 },
  reviewList: { gap: 10, marginBottom: 10 },
  reviewCard: { borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 13 },
  reviewLabel: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  answerLine: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  answerOwner: { width: 30, color: '#78917D', fontFamily: Fonts.mono, fontSize: 9 },
  answerValue: { flex: 1, color: '#E6F3E8', fontFamily: Fonts.sans },
  answerPoints: { color: '#7CFD4D', fontFamily: Fonts.mono, fontWeight: '800' },
  resultWrap: { paddingTop: 28 },
  resultEmoji: { fontSize: 58, marginBottom: 18 },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 8 },
  savingText: { color: '#9CB7A1', fontFamily: Fonts.sans },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', padding: 13, marginBottom: 8 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans },
  retryText: { color: '#7CFD4D', fontFamily: Fonts.sans, fontWeight: '800', marginTop: 8 },
});
