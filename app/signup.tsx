import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { signUpSchema, type SignUpFormInputs } from '@/schemas/auth';
import { supabase } from '@/lib/supabase/client';
import { signInWithGoogle } from '@/lib/supabase/oauth';

export default function SignupScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<SignUpFormInputs>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormInputs) => {
    setError(null);
    setLoading(true);

    try {
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            username: data.username,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (signUpData.user) {
        const { error: profileError } = await supabase.from('users').upsert({
          id: signUpData.user.id,
          email: data.email,
          username: data.username,
        }, { onConflict: 'id' });
        if (profileError) {
          setError('Account created, but your player profile could not be saved. Run supabase_mobile_setup.sql, then sign in again.');
          setLoading(false);
          return;
        }
      }

      // Navigate to login to confirm email
      router.replace('/login');
    } catch {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/game-lobby');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Google sign-up failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>I CALL ON</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join the game and compete</Text>
          </View>

      <View style={styles.formContainer}>
        {error && <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                value={value}
                onChangeText={onChange}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
            </View>
          )}
        />

        <Controller
          control={control}
          name="username"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={[styles.input, errors.username && styles.inputError]}
                placeholder="Your username"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                value={value}
                onChangeText={onChange}
                editable={!loading}
                autoCapitalize="none"
              />
              {errors.username && <Text style={styles.fieldError}>{errors.username.message}</Text>}
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
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', height: '100%' }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <AntDesign name={showPassword ? 'eye' : 'eye-invisible'} size={20} color="#fff" />
                </Pressable>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
            </View>
          )}
        />

        <Pressable
          style={[styles.signupButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#071108" />
          ) : (
            <Text style={styles.signupButtonText}>Create Account</Text>
          )}
        </Pressable>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.googleButton, (loading || googleLoading) && styles.buttonDisabled]}
          onPress={handleGoogleSignUp}
          disabled={loading || googleLoading}
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
        <Text style={styles.footerText}>Already have an account? </Text>
        <Pressable onPress={() => router.push('/login')} disabled={loading}>
          <Text style={[styles.footerLink, loading && styles.disabledLink]}>Login</Text>
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
  signupButton: {
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
  signupButtonText: {
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
