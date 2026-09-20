import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function RecallRelevanceNotice({ message }: { message?: string }) {
  const colors = useColors();
  if (!message) return null;

  return (
    <View style={[styles.notice, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
      <Feather name="alert-circle" size={17} color={colors.warning} />
      <Text style={[styles.text, { color: colors.foreground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 13,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
});