import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  Platform,
  Pressable as NativePressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
} from 'react-native';

type Feedback = 'light' | 'selection' | 'none';

export type InteractivePressableProps = PressableProps & {
  feedback?: Feedback;
};

/**
 * Consistent interaction feedback for touch, mouse, and keyboard users.
 * It preserves each button's own pressed styles while adding a subtle scale,
 * hover response, focus ring, and native haptic feedback.
 */
export function InteractivePressable({
  children,
  disabled,
  feedback = 'light',
  onBlur,
  onFocus,
  onHoverIn,
  onHoverOut,
  onPressIn,
  style,
  ...props
}: InteractivePressableProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const resolvedStyle = (state: PressableStateCallbackType) => [
    typeof style === 'function' ? style(state) : style,
    hovered && !disabled && styles.hovered,
    focused && !disabled && styles.focused,
    state.pressed && !disabled && styles.pressed,
  ];

  return (
    <NativePressable
      {...props}
      disabled={disabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      onPressIn={(event) => {
        if (!disabled && feedback !== 'none' && Platform.OS !== 'web') {
          const task = feedback === 'selection'
            ? Haptics.selectionAsync()
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void task.catch(() => undefined);
        }
        onPressIn?.(event);
      }}
      style={resolvedStyle}>
      {children}
    </NativePressable>
  );
}

const styles = StyleSheet.create({
  hovered: {
    opacity: 0.94,
  },
  focused: {
    borderColor: '#7CFD4D',
    shadowColor: '#7CFD4D',
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.975 }],
  },
});
