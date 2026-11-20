import type { Category, ExpenseCategory } from '@/domain/models';
import type { IconName } from '@/shared/ui';

export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; icon: IconName; color: string }
> = {
  food: { label: 'Food', icon: 'fast-food', color: '#E0532A' },
  transport: { label: 'Transport', icon: 'car', color: '#2F6FE0' },
  stay: { label: 'Stay', icon: 'bed', color: '#C98A0C' },
  activity: { label: 'Activity', icon: 'ticket', color: '#11948A' },
  shopping: { label: 'Shopping', icon: 'bag-handle', color: '#D2457E' },
  other: { label: 'Other', icon: 'wallet', color: '#6B7280' },
};

/** A cost logged at a saved place starts in the matching expense category. */
export function expenseCategoryFor(place: Category): ExpenseCategory {
  switch (place) {
    case 'food':
    case 'cafe':
    case 'nightlife':
      return 'food';
    case 'stay':
      return 'stay';
    case 'shopping':
      return 'shopping';
    case 'sight':
    case 'nature':
    case 'activity':
      return 'activity';
    default:
      return 'other';
  }
}
