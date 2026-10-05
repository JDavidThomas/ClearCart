import { supabase } from '@/lib/supabase';
import { searchOpenFoodFactsProduct } from './openFoodFacts';
import { searchFoodRecalls } from './recallApi';
import {
  buildShoppingListCheckResult,
  type ShoppingListCheckResult,
  type ShoppingListItem,
  type ShoppingListProfile,
} from './shoppingListLogic';

export * from './shoppingListLogic';

export async function runShoppingListChecks(
  term: string,
  profile: ShoppingListProfile,
): Promise<ShoppingListCheckResult> {
  const [recallOutcome, productOutcome] = await Promise.allSettled([
    searchFoodRecalls(term),
    searchOpenFoodFactsProduct(term),
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

export async function fetchShoppingListItems(userId: string) {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(SHOPPING_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ShoppingListItem[];
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
