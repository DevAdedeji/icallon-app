import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import type { Player } from '@/lib/game';
import { supabase } from '@/lib/supabase/client';

const CONFETTI_COLORS = ['#7CFD4D', '#FFD166', '#FF6B6B', '#5CC8FF', '#C77DFF'];
const MEDALS = ['🥇', '🥈', '🥉'];
const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  delay: (index % 7) * 70,
  drift: ((index * 37) % 90) - 45,
  duration: 1550 + (index % 5) * 180,
  left: (index * 43) % 100,
  rotation: 360 + (index % 4) * 180,
  shape: index % 3,
}));

type LeaderboardProps = {
  isHost: boolean;
  isRematching: boolean;
  onRematch: () => void;
  roomId: string;
  onExit: () => void;
};

export function Leaderboard({ isHost, isRematching, onRematch, roomId, onExit }: LeaderboardProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('total_score', { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setPlayers((data ?? []) as Player[]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  const winner = players[0];

  return (
    <View testID="leaderboard" style={styles.screen}>
      {!loading && winner && <ConfettiBurst />}
      <View style={styles.content}>
        <Text style={styles.kicker}>GAME COMPLETE</Text>
        <Text style={styles.title}>Leaderboard</Text>

        {loading ? (
          <ActivityIndicator color="#7CFD4D" size="large" style={styles.loader} />
        ) : (
          <>
            {winner && (
              <View accessibilityLabel={`${winner.display_name} wins with ${winner.total_score} points`} style={styles.championCard}>
                <Text style={styles.trophy}>🏆</Text>
                <View style={styles.championCopy}>
                  <Text style={styles.championLabel}>CHAMPION</Text>
                  <Text numberOfLines={1} style={styles.championName}>{winner.display_name}</Text>
                </View>
                <View style={styles.championScoreWrap}>
                  <Text style={styles.championScore}>{winner.total_score}</Text>
                  <Text style={styles.pointsLabel}>PTS</Text>
                </View>
              </View>
            )}

            <View style={styles.list}>
              {players.slice(1).map((player, index) => {
                const position = index + 2;
                return (
                  <View
                    accessibilityLabel={`${player.display_name}, position ${position}, ${player.total_score} points`}
                    key={player.id}
                    style={styles.row}
                  >
                    <Text style={styles.position}>{MEDALS[position - 1] ?? position}</Text>
                    <Text numberOfLines={1} style={styles.playerName}>{player.display_name}</Text>
                    <View style={styles.scoreWrap}>
                      <Text style={styles.score}>{player.total_score}</Text>
                      <Text style={styles.rowPointsLabel}>PTS</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {isHost ? (
          <Pressable
            accessibilityRole="button"
            testID="leaderboard-rematch"
            disabled={isRematching}
            style={[styles.rematchButton, isRematching && styles.disabled]}
            onPress={onRematch}
          >
            {isRematching
              ? <ActivityIndicator color="#071108" />
              : <Text style={styles.rematchButtonText}>Play again with this group</Text>}
          </Pressable>
        ) : (
          <Text style={styles.rematchWaiting}>The host can start a rematch with this group.</Text>
        )}
        <Pressable accessibilityRole="button" testID="leaderboard-exit" style={styles.homeButton} onPress={onExit}>
          <Text style={styles.homeButtonText}>Back to home</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ConfettiBurst() {
  const { height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={styles.confettiLayer} testID="leaderboard-confetti">
      {CONFETTI.map((piece, index) => (
        <ConfettiPiece key={index} travel={Math.max(height * 0.72, 520)} {...piece} />
      ))}
    </View>
  );
}

function ConfettiPiece({ color, delay, drift, duration, left, rotation, shape, travel }: (typeof CONFETTI)[number] & { travel: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      delay,
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          backgroundColor: color,
          borderRadius: shape === 2 ? 5 : 1,
          height: shape === 1 ? 14 : 9,
          left: `${left}%`,
          opacity: progress.interpolate({
            inputRange: [0, 0.08, 0.82, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, travel] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${rotation}deg`] }) },
          ],
          width: shape === 0 ? 6 : 10,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A120A',
    overflow: 'hidden',
  },
  confettiLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  confetti: {
    position: 'absolute',
    top: -16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    padding: 24,
    zIndex: 2,
  },
  kicker: {
    color: '#9CB7A1',
    letterSpacing: 2.5,
    fontSize: 12,
    fontFamily: Fonts.mono,
    marginBottom: 8,
  },
  title: {
    color: '#F3FFF6',
    fontSize: 42,
    fontWeight: '900',
    fontFamily: Fonts.rounded,
    marginBottom: 22,
  },
  loader: {
    marginVertical: 64,
  },
  championCard: {
    minHeight: 106,
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(124,253,77,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(124,253,77,0.5)',
    shadowColor: '#7CFD4D',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  trophy: {
    fontSize: 39,
  },
  championCopy: {
    flex: 1,
    minWidth: 0,
  },
  championLabel: {
    color: '#7CFD4D',
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 5,
  },
  championName: {
    color: '#F3FFF6',
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '900',
  },
  championScoreWrap: {
    alignItems: 'flex-end',
  },
  championScore: {
    color: '#7CFD4D',
    fontFamily: Fonts.mono,
    fontSize: 27,
    fontWeight: '900',
  },
  pointsLabel: {
    color: '#9CB7A1',
    fontFamily: Fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  list: {
    gap: 9,
    marginVertical: 18,
  },
  row: {
    minHeight: 62,
    paddingHorizontal: 15,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  position: {
    width: 42,
    color: '#CFE7D4',
    fontFamily: Fonts.mono,
    fontSize: 20,
    fontWeight: '800',
  },
  playerName: {
    flex: 1,
    color: '#F3FFF6',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
  },
  scoreWrap: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  score: {
    color: '#7CFD4D',
    fontFamily: Fonts.mono,
    fontSize: 17,
    fontWeight: '900',
  },
  rowPointsLabel: {
    color: '#6C806F',
    fontFamily: Fonts.mono,
    fontSize: 7,
    letterSpacing: 1,
  },
  homeButton: {
    minHeight: 54,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(243,255,246,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  rematchButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    paddingHorizontal: 16,
  },
  rematchButtonText: {
    color: '#071108',
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '900',
  },
  rematchWaiting: {
    color: '#9CB7A1',
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 22,
    textAlign: 'center',
  },
  disabled: { opacity: 0.55 },
  homeButtonText: {
    color: '#F3FFF6',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
  },
});
