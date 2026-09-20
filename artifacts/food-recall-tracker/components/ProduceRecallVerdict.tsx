import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { FdaFreshnessNotice } from '@/components/FdaFreshnessNotice';
import { useColors } from '@/hooks/useColors';

interface ProduceRecallVerdictProps {
  item: string;
  hasDirectRecall: boolean;
}

export function ProduceRecallVerdict({ item, hasDirectRecall }: ProduceRecallVerdictProps) {
  const colors = useColors();
  const displayItem = pluralizeProduceItem(item);
  const title = hasDirectRecall
    ? 'Active Recall Found'
    : `No active recalls found for fresh ${displayItem}`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: hasDirectRecall ? colors.dangerSoft : colors.successSoft,
          borderColor: hasDirectRecall ? colors.destructive : colors.success,
        },
      ]}
      testID="produce-recall-verdict"
    >
      <View style={[styles.icon, { backgroundColor: hasDirectRecall ? colors.destructive : colors.success }]}>
        <Feather
          name={hasDirectRecall ? 'alert-triangle' : 'check'}
          size={25}
          color={colors.primaryForeground}
        />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.productName, { color: colors.foreground }]}>Fresh {displayItem}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {hasDirectRecall
          ? 'This fresh produce item matches an active FDA recall. Review the details below and follow the official notice.'
          : `We didn’t find an active FDA recall for fresh ${displayItem}. Related product mentions are available below for review.`}
      </Text>
      {!hasDirectRecall ? <FdaFreshnessNotice colors={colors} /> : null}
    </View>
  );
}

function pluralizeProduceItem(item: string) {
  const words = item.split(' ');
  const lastWord = words.at(-1) ?? item;
  let pluralLastWord = `${lastWord}s`;

  if (lastWord.endsWith('y') && !/[aeiou]y$/i.test(lastWord)) {
    pluralLastWord = `${lastWord.slice(0, -1)}ies`;
  } else if (/(?:s|x|z|ch|sh)$/i.test(lastWord)) {
    pluralLastWord = `${lastWord}es`;
  } else if (lastWord.endsWith('o')) {
    pluralLastWord = `${lastWord}es`;
  }

  return [...words.slice(0, -1), pluralLastWord].join(' ');
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 9,
    padding: 22,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    marginTop: 3,
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
});