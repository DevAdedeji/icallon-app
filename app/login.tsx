import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { ensurePlayerProfile } from '@/features/auth/profile';
import { loginSchema, type LoginFormInputs } from '@/schemas/auth';
import { supabase } from '@/lib/supabase/client';
import { signInWithGoogle } from '@/lib/supabase/oauth';

export default function LoginScreen() {
  const { notice, returnTo } = useLocalSearchParams<{ notice?: string; returnTo?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const destination = returnTo === '/create-room' || returnTo === '/join-room'
    ? returnTo
    : '/game-lobby';

  const onSubmit = async (data: LoginFormInputs) => {
    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Login succeeded without a user session. Please try again.');

      await ensurePlayerProfile(authData.user);
      router.replace(destination);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Google sign-in succeeded without a user session.');
      await ensurePlayerProfile(user);
      router.replace(destination);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>ICallOn</Text>
            <Text style={styles.title}>Login</Text>
            <Text style={styles.subtitle}>Sign in to your account to play</Text>
          </View>

      <View style={styles.formContainer}>
        {notice && <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>}

        {error && <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="login-email-input"
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                value={value}
                onChangeText={onChange}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
            </View>
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  testID="login-password-input"
                  style={[
                    styles.input,
                    errors.password && styles.inputError,
                    { paddingRight: 40 },
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  value={value}
                  onChangeText={onChange}
                  editable={!loading}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  textContentType="password"
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', height: '100%' }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                >
                  <AntDesign name={showPassword ? 'eye' : 'eye-invisible'} size={20} color="#fff" />
                </Pressable>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
            </View>
          )}
        />

        <Pressable
          testID="login-submit-button"
          style={[styles.loginButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#071108" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </Pressable>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          testID="login-google-button"
          style={[styles.googleButton, (loading || googleLoading) && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading || googleLoading}
          accessibilityRole="button"
        >
          {googleLoading ? (
            <ActivityIndicator color="#F3FFF6" />
          ) : (
            <View style={styles.googleButtonInner}>
              <AntDesign name="google" size={18} color="#F3FFF6" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account? </Text>
        <Pressable testID="login-signup-link" onPress={() => router.push('/signup')} disabled={loading}>
          <Text style={[styles.footerLink, loading && styles.disabledLink]}>Sign up</Text>
        </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A120A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    marginBottom: 32,
  },
  kicker: {
    color: '#9CB7A1',
    letterSpacing: 2.2,
    fontSize: 12,
    fontFamily: Fonts.mono,
    marginBottom: 8,
  },
  title: {
    color: '#F3FFF6',
    fontSize: 38,
    fontWeight: '900',
    fontFamily: Fonts.rounded,
    marginBottom: 8,
  },
  subtitle: {
    color: '#CFE7D4',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.sans,
  },
  formContainer: {
    gap: 20,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.5)',
    borderRadius: 12,
    padding: 12,
  },
  noticeBox: {
    backgroundColor: 'rgba(124, 253, 77, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(124, 253, 77, 0.35)',
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: '#CFE7D4',
    fontSize: 14,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#E6F3E8',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    color: '#F3FFF6',
    fontSize: 16,
    fontFamily: Fonts.sans,
  },
  inputError: {
    borderColor: 'rgba(220, 38, 38, 0.5)',
  },
  fieldError: {
    color: '#FCA5A5',
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  loginButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  googleButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleButtonText: {
    color: '#F3FFF6',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  loginButtonText: {
    color: '#071108',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: Fonts.sans,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    color: '#CFE7D4',
    fontSize: 15,
    fontFamily: Fonts.sans,
  },
  footerLink: {
    color: '#7CFD4D',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  disabledLink: {
    opacity: 0.6,
  },
});
