import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Fonts } from '@/constants/theme';

export default function CreateAccountScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Account creation screen scaffold is ready for the auth step.</Text>
      <Pressable style={styles.button} onPress={() => router.push('/welcome')}>
        <Text style={styles.buttonText}>Back to Welcome</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A120A',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    color: '#F3FFF6',
    fontSize: 38,
    fontWeight: '900',
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: '#CFE7D4',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.sans,
  },
  button: {
    marginTop: 10,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buttonText: {
    color: '#E6F3E8',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
