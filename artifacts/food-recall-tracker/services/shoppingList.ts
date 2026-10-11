import { supabase } from '@/lib/supabase';
import { searchOpenFoodFactsProduct } from './openFoodFacts';
import { searchFoodRecalls } from './recallApi';
import { shouldLookupShoppingListProductByName } from './singleIngredientFoods.ts';
import {
  buildShoppingListCheckResult,
  type FrequentItem,
  type ShoppingListCheckResult,
  type ShoppingListItem,
  type ShoppingListProfile,
} from './shoppingListLogic';

export * from './shoppingListLogic';

export async function runShoppingListChecks(
  term: string,
  profile: ShoppingListProfile,
): Promise<ShoppingListCheckResult> {
  const productLookup = shouldLookupShoppingListProductByName(term)
    ? searchOpenFoodFactsProduct(term)
    : Promise.resolve(null);
  const [recallOutcome, productOutcome] = await Promise.allSettled([
    searchFoodRecalls(term),
    productLookup,
  ]);
  const recallResult = recallOutcome.status === 'fulfilled' ? recallOutcome.value : undefined;
  const product = productOutcome.status === 'fulfilled' ? productOutcome.value : null;

  return buildShoppingListCheckResult(term, profile, {
    recallResult,
    product,
    recallLookupFailed: recallOutcome.status === 'rejected',
    productLookupFailed: productOutcome.status === 'rejected',
  });
}

const SHOPPING_LIST_COLUMNS =
  'id,user_id,term,added_at,last_checked_at,last_check_result,is_checked';
const FREQUENT_ITEM_COLUMNS =
  'id,user_id,term,added_at,last_checked_at,last_check_result,is_checked,last_used_at';

export async function fetchShoppingListItems(userId: string) {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(SHOPPING_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ShoppingListItem[];
}

export async function fetchFrequentItems(userId: string) {
  const { data, error } = await supabase
    .from('frequent_items')
    .select(FREQUENT_ITEM_COLUMNS)
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FrequentItem[];
}

export async function upsertFrequentItem(
  userId: string,
  term: string,
  result: ShoppingListCheckResult,
  checkedAt: string,
) {
  const { data, error } = await supabase
    .from('frequent_items')
    .upsert(
      {
        user_id: userId,
        term,
        last_check_result: result,
        last_checked_at: checkedAt,
        last_used_at: checkedAt,
        is_checked: false,
      },
      { onConflict: 'user_id,term' },
    )
    .select(FREQUENT_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as FrequentItem;
}

export async function saveFrequentItemCheck(
  userId: string,
  itemId: string,
  result: ShoppingListCheckResult,
  checkedAt: string,
) {
  const { data, error } = await supabase
    .from('frequent_items')
    .update({ last_check_result: result, last_checked_at: checkedAt })
    .eq('user_id', userId)
    .eq('id', itemId)
    .select(FREQUENT_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as FrequentItem;
}

export async function touchFrequentItem(userId: string, itemId: string, usedAt: string) {
  const { data, error } = await supabase
    .from('frequent_items')
    .update({ last_used_at: usedAt })
    .eq('user_id', userId)
    .eq('id', itemId)
    .select(FREQUENT_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as FrequentItem;
}

export async function deleteFrequentItem(userId: string, itemId: string) {
  const { error } = await supabase
    .from('frequent_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', itemId);
  if (error) throw error;
}

export async function insertShoppingListItem(userId: string, term: string) {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({ user_id: userId, term })
    .select(SHOPPING_LIST_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ShoppingListItem;
}

export async function saveShoppingListCheck(
  userId: string,
  itemId: string,
  result: ShoppingListCheckResult,
  checkedAt: string,
) {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .update({ last_check_result: result, last_checked_at: checkedAt })
    .eq('user_id', userId)
    .eq('id', itemId)
    .select(SHOPPING_LIST_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ShoppingListItem;
}

export async function setShoppingListItemChecked(
  userId: string,
  itemId: string,
  isChecked: boolean,
) {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .update({ is_checked: isChecked })
    .eq('user_id', userId)
    .eq('id', itemId)
    .select(SHOPPING_LIST_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as ShoppingListItem;
}

export async function deleteShoppingListItem(userId: string, itemId: string) {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', itemId);
  if (error) throw error;
}

export async function deleteCheckedShoppingListItems(userId: string) {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('user_id', userId)
    .eq('is_checked', true);
  if (error) throw error;
}
