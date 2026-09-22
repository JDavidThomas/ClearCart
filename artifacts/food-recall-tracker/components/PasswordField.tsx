import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  testID?: string;
}

export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  testID,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: colors.input }]}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={!visible}
          style={[styles.input, { color: colors.foreground }]}
          testID={testID}
          value={value}
        />
        <Pressable
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          accessibilityRole="button"
          accessibilityState={{ selected: visible }}
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.55 : 1 }]}
          testID={testID ? `${testID}-toggle` : undefined}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={colors.mutedForeground}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  inputShell: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 54 },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  toggle: { alignItems: 'center', justifyContent: 'center', minHeight: 50, paddingHorizontal: 14 },
});