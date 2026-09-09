import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';
import { Fonts } from '@/constants/theme';
import { createRoomSession } from '@/features/rooms/room-service';
import { ROUND_OPTIONS, TIMER_OPTIONS } from '@/features/rooms/room-validation';
import { CATEGORY_PACKS, DEFAULT_CATEGORY_LABELS, type CategoryPackId } from '@/features/game/category-packs';
import { InteractivePressable as Pressable } from '@/components/interactive-pressable';

export default function CreateRoomScreen() {
  const insets = useSafeAreaInsets();
  const [maxRounds, setMaxRounds] = useState<number | null>(null);
  const [timePerRound, setTimePerRound] = useState<number | null>(null);
  const [categoryPack, setCategoryPack] = useState<CategoryPackId>('classic');
  const [customLabels, setCustomLabels] = useState<string[]>([...DEFAULT_CATEGORY_LABELS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    if (!maxRounds || !timePerRound) {
      setError('Please select rounds and timer');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const selectedLabels = categoryPack === 'custom'
        ? customLabels
        : [...(CATEGORY_PACKS.find((pack) => pack.id === categoryPack)?.labels ?? DEFAULT_CATEGORY_LABELS)];
      const room = await createRoomSession({ maxRounds, timePerRound, categoryPack, categoryLabels: selectedLabels });
      router.replace({
        pathname: '/lobby',
        params: { roomId: room.roomId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
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
            <Text style={styles.kicker}>ROOM SETUP</Text>
            <Text style={styles.title}>Create Room</Text>
            <Text style={styles.subtitle}>Configure your game settings below.</Text>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Category Pack</Text>
            <View style={styles.packList}>
              {CATEGORY_PACKS.map((pack) => (
                <Pressable
                  accessibilityRole="button"
                  testID={`category-pack-${pack.id}`}
                  key={pack.id}
                  onPress={() => setCategoryPack(pack.id)}
                  style={[styles.packTile, categoryPack === pack.id && styles.packTileActive]}
                >
                  <Text style={[styles.packName, categoryPack === pack.id && styles.packNameActive]}>{pack.name}</Text>
                  <Text style={styles.packDescription}>{pack.labels.join(' · ')}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                testID="category-pack-custom"
                onPress={() => setCategoryPack('custom')}
                style={[styles.packTile, categoryPack === 'custom' && styles.packTileActive]}
              >
                <Text style={[styles.packName, categoryPack === 'custom' && styles.packNameActive]}>Make your own</Text>
                <Text style={styles.packDescription}>Choose four categories for your group.</Text>
              </Pressable>
            </View>
            {categoryPack === 'custom' && (
              <View style={styles.customGrid}>
                {customLabels.map((label, index) => (
                  <TextInput
                    key={index}
                    testID={`custom-category-${index + 1}`}
                    value={label}
                    maxLength={24}
                    placeholder={`Category ${index + 1}`}
                    placeholderTextColor="#6C806F"
                    onChangeText={(value) => setCustomLabels((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
                    style={styles.customInput}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Number of Rounds</Text>
            <View style={styles.optionRow}>
              {ROUND_OPTIONS.map((r) => (
                <Pressable
                  testID={`round-option-${r}`}
                  key={r}
                  onPress={() => setMaxRounds(r)}
                  style={[styles.optionTile, maxRounds === r && styles.optionTileActive]}
                >
                  <Text style={[styles.optionTileText, maxRounds === r && styles.optionTileTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Time per Round (seconds)</Text>
            <View style={styles.optionRow}>
              {TIMER_OPTIONS.map((t) => (
                <Pressable
                  testID={`timer-option-${t}`}
                  key={t}
                  onPress={() => setTimePerRound(t)}
                  style={[styles.optionTile, timePerRound === t && styles.optionTileActive]}
                >
                  <Text style={[styles.optionTileText, timePerRound === t && styles.optionTileTextActive]}>{t}s</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            testID="create-room-submit"
            style={[styles.createButton, (loading || !maxRounds || !timePerRound) && styles.buttonDisabled]}
            onPress={handleCreateRoom}
            disabled={loading || !maxRounds || !timePerRound}
          >
            {loading ? <ActivityIndicator color="#071108" /> : <Text style={styles.createButtonText}>Create Room</Text>}
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
  section: { marginBottom: 28 },
  sectionLabel: { color: '#E6F3E8', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 12 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionTile: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTileActive: {
    backgroundColor: '#7CFD4D',
    borderColor: '#7CFD4D',
  },
  optionTileText: { color: '#CFE7D4', fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans },
  optionTileTextActive: { color: '#071108' },
  packList: { gap: 10 },
  packTile: { borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', padding: 14 },
  packTileActive: { borderColor: '#7CFD4D', backgroundColor: 'rgba(124,253,77,0.12)' },
  packName: { color: '#E6F3E8', fontSize: 15, fontWeight: '800', fontFamily: Fonts.sans },
  packNameActive: { color: '#7CFD4D' },
  packDescription: { color: '#9CB7A1', fontSize: 12, fontFamily: Fonts.sans, marginTop: 4 },
  customGrid: { gap: 9, marginTop: 12 },
  customInput: { height: 48, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.07)', color: '#F3FFF6', paddingHorizontal: 13, fontFamily: Fonts.sans },
  createButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  createButtonText: { color: '#071108', fontSize: 16, fontWeight: '900', fontFamily: Fonts.sans },
});
