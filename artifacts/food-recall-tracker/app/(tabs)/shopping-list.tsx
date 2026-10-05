import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingListItemCard } from '@/components/ShoppingListItemCard';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import {
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingListItems,
  insertShoppingListItem,
  isShoppingListCheckStale,
  runShoppingListChecks,
  saveShoppingListCheck,
  setShoppingListItemChecked,
  sortShoppingListItems,
  summarizeShoppingList,
  type ShoppingListItem,
} from '@/services/shoppingList';

function describeError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  if (code === '42P01' || code === 'PGRST205') {
    return 'Shopping List storage is not set up yet. Run supabase/shopping-list.sql in your Supabase SQL Editor.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function GuestShoppingList({
  onSignUp,
  onLogIn,
  colors,
}: {
  onSignUp: () => void;
  onLogIn: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.guestCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.guestIcon, { backgroundColor: colors.blueSoft }]}>
        <Feather name="shopping-cart" size={24} color={colors.primary} />
      </View>
      <Text style={[styles.guestTitle, { color: colors.foreground }]}>
        Save your shopping checks
      </Text>
      <Text style={[styles.guestDescription, { color: colors.mutedForeground }]}>
        Create an account to keep a private list of products and check their recalls, allergens,
        health notes, and related news.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onSignUp}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
        ]}
        testID="shopping-list-sign-up"
      >
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
          Create account
        </Text>
        <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onLogIn}
        style={({ pressed }) => [
          styles.loginButton,
          { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
        ]}
        testID="shopping-list-log-in"
      >
        <Text style={[styles.loginButtonText, { color: colors.foreground }]}>
          Log in
        </Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  count,
  color,
  backgroundColor,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  count: number;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.summaryRow, { backgroundColor }]}>
      <Feather name={icon} size={17} color={color} />
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
    </View>
  );
}

export default function ShoppingListScreen() {
  const colors = useColors();
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkingIds, setCheckingIds] = useState<string[]>([]);
  const [checkProgress, setCheckProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const topPadding = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const userId =
    auth.status === 'authenticated' && auth.profile ? auth.profile.id : null;
  const summary = useMemo(() => summarizeShoppingList(items), [items]);
  const staleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          isShoppingListCheckStale(item.last_checked_at) &&
          !checkingIds.includes(item.id),
      ),
    [items, checkingIds],
  );
  const checkedCount = useMemo(() => items.filter((item) => item.is_checked).length, [items]);
  const activeItems = useMemo(() => items.filter((item) => !item.is_checked), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.is_checked), [items]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setItems([]);
        setIsLoading(false);
        return undefined;
      }

      let isActive = true;
      setIsLoading(true);
      setErrorMessage(null);
      void fetchShoppingListItems(userId)
        .then((rows) => {
          if (isActive) setItems(sortShoppingListItems(rows));
        })
        .catch((error: unknown) => {
          if (isActive) setErrorMessage(describeError(error));
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [userId]),
  );

  const handleRecheck = async (item: ShoppingListItem) => {
    if (!auth.profile || !userId) return;
    setErrorMessage(null);
    setCheckingIds((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    try {
      const result = await runShoppingListChecks(item.term, auth.profile);
      const updated = await saveShoppingListCheck(
        userId,
        item.id,
        result,
        new Date().toISOString(),
      );
      setItems((current) =>
        sortShoppingListItems([
          ...current.filter((currentItem) => currentItem.id !== updated.id),
          updated,
        ]),
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setCheckingIds((current) => current.filter((id) => id !== item.id));
    }
  };

  const runChecks = async (rows: ShoppingListItem[], displaySummary: boolean) => {
    if (rows.length === 0 || isCheckingAll) return;
    setIsCheckingAll(true);
    setErrorMessage(null);
    try {
      for (let index = 0; index < rows.length; index += 1) {
        setCheckProgress({ current: index + 1, total: rows.length });
        await handleRecheck(rows[index]);
      }
    } finally {
      setIsCheckingAll(false);
      setCheckProgress(null);
      if (displaySummary) setShowSummary(true);
    }
  };

  const handleAddItem = async () => {
    if (!userId || !auth.profile) return;
    const term = newTerm.trim();
    if (!term || isAdding) return;

    const duplicate = items.find(
      (item) => item.term.trim().toLocaleLowerCase() === term.toLocaleLowerCase(),
    );
    setNewTerm('');
    if (duplicate) {
      setErrorMessage(null);
      await handleRecheck(duplicate);
      return;
    }

    setIsAdding(true);
    setErrorMessage(null);
    try {
      const inserted = await insertShoppingListItem(userId, term);
      setItems((current) => sortShoppingListItems([...current, inserted]));
      setShowSummary(false);
      void handleRecheck(inserted);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = (item: ShoppingListItem) => {
    Alert.alert('Remove from Shopping List?', item.term, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (!userId) return;
          void deleteShoppingListItem(userId, item.id)
            .then(() => {
              setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
            })
            .catch((error: unknown) => setErrorMessage(describeError(error)));
        },
      },
    ]);
  };

  const handleToggleChecked = async (item: ShoppingListItem) => {
    if (!userId) return;
    setErrorMessage(null);
    try {
      const updated = await setShoppingListItemChecked(userId, item.id, !item.is_checked);
      setItems((current) =>
        sortShoppingListItems([
          ...current.filter((currentItem) => currentItem.id !== updated.id),
          updated,
        ]),
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  };

  const handleClearChecked = () => {
    setOverflowOpen(false);
    if (!userId || checkedCount === 0) return;
    Alert.alert(
      'Clear checked items?',
      `This will remove ${checkedCount} completed ${checkedCount === 1 ? 'item' : 'items'} from your list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear items',
          style: 'destructive',
          onPress: () => {
            void deleteCheckedShoppingListItems(userId)
              .then(() => {
                setItems((current) => current.filter((item) => !item.is_checked));
              })
              .catch((error: unknown) => setErrorMessage(describeError(error)));
          },
        },
      ],
    );
  };

  const handleRefresh = async () => {
    if (!userId || isRefreshing || isCheckingAll) return;
    setIsRefreshing(true);
    try {
      const rows = await fetchShoppingListItems(userId);
      setItems(sortShoppingListItems(rows));
      await runChecks(rows, true);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDetails = (term: string) => {
    router.push({
      pathname: '/',
      params: { searchPrefill: term, autoSearch: 'true' },
    });
  };

  if (auth.status === 'loading') {
    return (
      <View style={[styles.centeredScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Loading your account…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardControllerAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={styles.keyboardFrame}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: topPadding + 18,
              paddingBottom: Math.max(insets.bottom, 24) + 96,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            userId ? (
              <RefreshControl
                colors={[colors.primary]}
                onRefresh={() => void handleRefresh()}
                refreshing={isRefreshing || isCheckingAll}
                tintColor={colors.primary}
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
          testID="shopping-list-scroll-view"
        >
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <View style={styles.eyebrowRow}>
                <Feather name="shopping-cart" size={15} color={colors.primary} />
                <Text style={[styles.eyebrow, { color: colors.primary }]}>CLEARCART</Text>
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>Shopping List</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Check recalls, allergens, health notes, and recent news before you shop.
              </Text>
            </View>
            {userId ? (
              <Pressable
                accessibilityLabel="More shopping list actions"
                accessibilityRole="button"
                accessibilityState={{ expanded: overflowOpen }}
                hitSlop={8}
                onPress={() => setOverflowOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.overflowButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.65 : 1,
                  },
                ]}
                testID="shopping-list-overflow"
              >
                <Feather name="more-horizontal" size={21} color={colors.foreground} />
              </Pressable>
            ) : null}
          </View>

          {userId && overflowOpen ? (
            <View
              style={[
                styles.overflowMenu,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                disabled={checkedCount === 0}
                onPress={handleClearChecked}
                style={({ pressed }) => [
                  styles.overflowMenuAction,
                  { opacity: checkedCount === 0 || pressed ? 0.5 : 1 },
                ]}
                testID="shopping-list-clear-checked"
              >
                <Feather name="trash-2" size={16} color={colors.destructive} />
                <Text style={[styles.overflowMenuText, { color: colors.destructive }]}>
                  Clear checked items ({checkedCount})
                </Text>
              </Pressable>
            </View>
          ) : null}

          {userId ? (
            <>
              <View style={styles.addSection}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                  Add a product or ingredient
                </Text>
                <View
                  style={[
                    styles.addRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: newTerm.trim() ? colors.primary : colors.input,
                    },
                  ]}
                >
                  <Feather name="search" size={18} color={colors.mutedForeground} />
                  <TextInput
                    accessibilityLabel="Product or ingredient to add"
                    autoCapitalize="words"
                    autoCorrect={false}
                    onChangeText={setNewTerm}
                    onSubmitEditing={() => void handleAddItem()}
                    placeholder="e.g. bananas or peanut butter"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                    style={[styles.input, { color: colors.foreground }]}
                    testID="shopping-list-input"
                    value={newTerm}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !newTerm.trim() || isAdding }}
                    disabled={!newTerm.trim() || isAdding}
                    onPress={() => void handleAddItem()}
                    style={({ pressed }) => [
                      styles.addButton,
                      {
                        backgroundColor: colors.primary,
                        opacity: !newTerm.trim() || isAdding || pressed ? 0.6 : 1,
                      },
                    ]}
                    testID="shopping-list-add"
                  >
                    {isAdding ? (
                      <ActivityIndicator color={colors.primaryForeground} size="small" />
                    ) : (
                      <>
                        <Feather name="plus" size={17} color={colors.primaryForeground} />
                        <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>
                          Add
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    items.length === 0 ||
                    isCheckingAll ||
                    checkingIds.length > 0 ||
                    isLoading,
                }}
                disabled={
                  items.length === 0 ||
                  isCheckingAll ||
                  checkingIds.length > 0 ||
                  isLoading
                }
                onPress={() => void runChecks(items, true)}
                style={({ pressed }) => [
                  styles.checkAllButton,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      items.length === 0 ||
                      isCheckingAll ||
                      checkingIds.length > 0 ||
                      isLoading ||
                      pressed
                        ? 0.65
                        : 1,
                  },
                ]}
                testID="shopping-list-check-all"
              >
                {isCheckingAll ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Feather name="refresh-cw" size={17} color={colors.primaryForeground} />
                )}
                <Text style={[styles.checkAllText, { color: colors.primaryForeground }]}>
                  Check All Items
                </Text>
                {!isCheckingAll ? (
                  <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
                ) : null}
              </Pressable>

              {checkProgress && isCheckingAll ? (
                <View style={[styles.progressCard, { backgroundColor: colors.blueSoft }]}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.progressText, { color: colors.foreground }]}>
                    Checking item {checkProgress.current} of {checkProgress.total}…
                  </Text>
                </View>
              ) : null}

              {staleItems.length > 0 ? (
                <View
                  style={[
                    styles.staleBanner,
                    { backgroundColor: colors.warningSoft, borderColor: colors.border },
                  ]}
                  testID="shopping-list-stale-prompt"
                >
                  <View style={[styles.staleIcon, { backgroundColor: colors.card }]}>
                    <Feather name="clock" size={15} color={colors.warning} />
                  </View>
                  <Text style={[styles.staleText, { color: colors.foreground }]}>
                    {staleItems.length === 1
                      ? 'One check is over an hour old.'
                      : `${staleItems.length} checks are over an hour old.`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isCheckingAll || checkingIds.length > 0}
                    onPress={() => void runChecks(staleItems, showSummary)}
                    style={({ pressed }) => [
                      styles.staleAction,
                      { opacity: isCheckingAll || pressed ? 0.55 : 1 },
                    ]}
                    testID="shopping-list-recheck-stale"
                  >
                    <Text style={[styles.staleActionText, { color: colors.warning }]}>
                      Recheck
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {showSummary ? (
                <View
                  style={[
                    styles.summaryCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  testID="shopping-list-summary"
                >
                  <View style={styles.sectionHeading}>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                        List summary
                      </Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                        Based on the latest checks
                      </Text>
                    </View>
                    <Feather name="shield" size={19} color={colors.primary} />
                  </View>
                  <View style={styles.summaryGrid}>
                    <SummaryRow
                      icon="alert-circle"
                      label="items have active recalls"
                      count={summary.activeRecallItems}
                      color={summary.activeRecallItems ? colors.destructive : colors.success}
                      backgroundColor={
                        summary.activeRecallItems ? colors.dangerSoft : colors.successSoft
                      }
                    />
                    <SummaryRow
                      icon="alert-triangle"
                      label="contain your allergens"
                      count={summary.allergenMatchItems}
                      color={summary.allergenMatchItems ? colors.destructive : colors.success}
                      backgroundColor={
                        summary.allergenMatchItems ? colors.dangerSoft : colors.successSoft
                      }
                    />
                    <SummaryRow
                      icon="heart"
                      label="have health conflicts"
                      count={summary.healthConflictItems}
                      color={summary.healthConflictItems ? colors.warning : colors.success}
                      backgroundColor={
                        summary.healthConflictItems ? colors.warningSoft : colors.successSoft
                      }
                    />
                    <SummaryRow
                      icon="file-text"
                      label="have related news"
                      count={summary.newsItems}
                      color={summary.newsItems ? colors.primary : colors.success}
                      backgroundColor={summary.newsItems ? colors.blueSoft : colors.successSoft}
                    />
                  </View>
                </View>
              ) : null}

              {errorMessage ? (
                <View
                  style={[
                    styles.errorCard,
                    { backgroundColor: colors.dangerSoft, borderColor: colors.border },
                  ]}
                  testID="shopping-list-error"
                >
                  <Feather name="alert-circle" size={17} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.foreground }]}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {isLoading ? (
                <View style={[styles.loadingCard, { borderColor: colors.border }]}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                    Loading your list…
                  </Text>
                </View>
              ) : null}

              {!isLoading && items.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={[styles.emptyIcon, { backgroundColor: colors.blueSoft }]}>
                    <Feather name="shopping-bag" size={21} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                    Your list is ready
                  </Text>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Add foods you plan to buy. ClearCart will check the same recall, allergen,
                    health, and news sources used in product search.
                  </Text>
                </View>
              ) : null}

              {activeItems.length > 0 ? (
                <View style={styles.itemSection}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      To check
                    </Text>
                    <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
                      {activeItems.length}
                    </Text>
                  </View>
                  {activeItems.map((item) => (
                    <ShoppingListItemCard
                      key={item.id}
                      item={item}
                      checking={checkingIds.includes(item.id)}
                      onToggleChecked={() => void handleToggleChecked(item)}
                      onRecheck={() => void handleRecheck(item)}
                      onRemove={() => handleRemove(item)}
                      onViewDetails={() => handleViewDetails(item.term)}
                    />
                  ))}
                </View>
              ) : null}

              {completedItems.length > 0 ? (
                <View style={styles.itemSection} testID="shopping-list-completed">
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      Completed
                    </Text>
                    <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
                      {completedItems.length}
                    </Text>
                  </View>
                  {completedItems.map((item) => (
                    <ShoppingListItemCard
                      key={item.id}
                      item={item}
                      checking={checkingIds.includes(item.id)}
                      onToggleChecked={() => void handleToggleChecked(item)}
                      onRecheck={() => void handleRecheck(item)}
                      onRemove={() => handleRemove(item)}
                      onViewDetails={() => handleViewDetails(item.term)}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <GuestShoppingList
              onSignUp={() => router.push('/sign-up')}
              onLogIn={() => router.push('/login')}
              colors={colors}
            />
          )}
        </ScrollView>
      </KeyboardControllerAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardFrame: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingHorizontal: 20,
  },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headingCopy: {
    flex: 1,
    gap: 7,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 37,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  overflowButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    marginTop: 6,
    width: 42,
  },
  overflowMenu: {
    alignSelf: 'flex-end',
    borderRadius: 13,
    borderWidth: 1,
    marginTop: -8,
    paddingHorizontal: 13,
  },
  overflowMenuAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
  },
  overflowMenuText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  addSection: {
    gap: 9,
    marginTop: 3,
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  addRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 58,
    paddingLeft: 14,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 54,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 10,
  },
  addButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  checkAllButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  checkAllText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  progressCard: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    minHeight: 43,
    paddingHorizontal: 12,
  },
  progressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  staleBanner: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  staleIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  staleText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  staleAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 5,
  },
  staleActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  summaryCard: {
    borderRadius: 17,
    borderWidth: 1,
    gap: 13,
    padding: 15,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  summaryGrid: {
    gap: 8,
  },
  summaryRow: {
    alignItems: 'center',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  summaryCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    minWidth: 13,
  },
  summaryLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  errorCard: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  loadingCard: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 46,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    padding: 19,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 43,
    justifyContent: 'center',
    width: 43,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 310,
    textAlign: 'center',
  },
  itemSection: {
    gap: 10,
  },
  itemCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  guestCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    gap: 13,
    marginTop: 12,
    padding: 22,
  },
  guestIcon: {
    alignItems: 'center',
    borderRadius: 15,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  guestTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    textAlign: 'center',
  },
  guestDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 310,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 3,
    minHeight: 50,
    paddingHorizontal: 18,
    width: '100%',
  },
  primaryButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  loginButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  loginButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  centeredScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
});
