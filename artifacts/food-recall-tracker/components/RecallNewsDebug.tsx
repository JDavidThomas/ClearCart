import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecallNewsDiagnostics } from '@/types/recall';
import { useColors } from '@/hooks/useColors';

function formatCount(value: number | null) {
  return value === null ? 'Not received' : String(value);
}

export function RecallNewsDebug({
  diagnostics,
}: {
  diagnostics: RecallNewsDiagnostics;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((previous) => !previous)}
        style={({ pressed }) => [
          styles.toggle,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        testID="recall-news-debug-toggle"
      >
        <Feather name="code" size={15} color={colors.primary} />
        <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Debug</Text>
        <Text style={[styles.toggleSummary, { color: colors.mutedForeground }]}>
          HTTP {diagnostics.httpStatus ?? '—'} · {formatCount(diagnostics.filteredArticleCount)} shown
        </Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.details,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          testID="recall-news-debug-details"
        >
          <DebugRow
            label="Exact request URL"
            value={diagnostics.requestUrl ?? 'Not captured — request has not started'}
            testID="debug-news-request-url"
            colors={colors}
            selectable
          />
          <DebugRow
            label="HTTP status"
            value={diagnostics.httpStatus === null ? 'Not received' : String(diagnostics.httpStatus)}
            testID="debug-news-http-status"
            colors={colors}
          />
          <DebugRow
            label="Raw article count"
            value={formatCount(diagnostics.rawArticleCount)}
            testID="debug-news-raw-count"
            colors={colors}
          />
          <DebugRow
            label="After filtering"
            value={formatCount(diagnostics.filteredArticleCount)}
            testID="debug-news-filtered-count"
            colors={colors}
          />
          <DebugRow
            label="Error"
            value={diagnostics.error ?? 'None'}
            testID="debug-news-error"
            colors={colors}
            selectable
          />
        </View>
      ) : null}
    </View>
  );
}

function DebugRow({
  label,
  value,
  testID,
  colors,
  selectable = false,
}: {
  label: string;
  value: string;
  testID: string;
  colors: ReturnType<typeof useColors>;
  selectable?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        selectable={selectable}
        style={[styles.value, { color: colors.foreground }]}
        testID={testID}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 2,
  },
  toggle: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  toggleLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  toggleSummary: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'right',
  },
  details: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  row: {
    gap: 4,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  value: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
});