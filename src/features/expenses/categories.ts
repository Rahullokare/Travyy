import type { Category, ExpenseCategory } from '@/domain/models';

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; emoji: string; color: string }> =
  {
    food: { label: 'Food', emoji: '🍜', color: '#F0643C' },
    transport: { label: 'Transport', emoji: '🚕', color: '#2F7DF6' },
    stay: { label: 'Stay', emoji: '🛏️', color: '#E0A100' },
    activity: { label: 'Activity', emoji: '🎟️', color: '#0EA5A5' },
    shopping: { label: 'Shopping', emoji: '🛍️', color: '#E2508C' },
    other: { label: 'Other', emoji: '💸', color: '#6B7280' },
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
