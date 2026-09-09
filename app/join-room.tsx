import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';
import { Fonts } from '@/constants/theme';
import { joinRoomSession } from '@/features/rooms/room-service';
import { roomCodeSchema } from '@/features/rooms/room-validation';

export default function JoinRoomScreen() {
  const insets = useSafeAreaInsets();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoinRoom = async () => {
    const parsedCode = roomCodeSchema.safeParse(roomCode);
    if (!parsedCode.success) {
      setError(parsedCode.error.issues[0]?.message ?? 'Enter a valid room code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const room = await joinRoomSession(parsedCode.data);
      router.replace({
        pathname: '/lobby',
        params: { roomId: room.roomId, roomCode: room.roomCode, isHost: String(room.isHost) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}>
        <AntDesign name="arrow-left" size={20} color="#9CB7A1" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>JOIN GAME</Text>
            <Text style={styles.title}>Join Room</Text>
            <Text style={styles.subtitle}>Enter the 6-character room code shared by the host.</Text>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Room Code</Text>
            <TextInput
              testID="room-code-input"
              style={styles.input}
              placeholder="e.g. ABC123"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              value={roomCode}
              onChangeText={(v) => setRoomCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
          </View>

          <Pressable
            testID="join-room-submit"
            style={[styles.joinButton, (loading || !roomCode) && styles.buttonDisabled]}
            onPress={handleJoinRoom}
            disabled={loading || !roomCode}
          >
            {loading ? <ActivityIndicator color="#071108" /> : <Text style={styles.joinButtonText}>Join Room</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A' },
  scroll: { width: '100%' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', maxWidth: 400, paddingHorizontal: 24, paddingVertical: 32 },
  backButton: { position: 'absolute', left: 24, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#9CB7A1', fontSize: 14, fontFamily: Fonts.sans },
  header: { marginBottom: 28 },
  kicker: { color: '#9CB7A1', letterSpacing: 2.2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 },
  title: { color: '#F3FFF6', fontSize: 34, fontWeight: '900', fontFamily: Fonts.rounded, marginBottom: 6 },
  subtitle: { color: '#CFE7D4', fontSize: 15, fontFamily: Fonts.sans },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.5)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: { color: '#FCA5A5', fontSize: 14, fontFamily: Fonts.sans, fontWeight: '600' },
  fieldGroup: { marginBottom: 28 },
  label: { color: '#E6F3E8', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 10 },
  input: {
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    color: '#F3FFF6',
    fontSize: 22,
    fontFamily: Fonts.mono,
    letterSpacing: 6,
  },
  joinButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  joinButtonText: { color: '#071108', fontSize: 16, fontWeight: '900', fontFamily: Fonts.sans },
});
