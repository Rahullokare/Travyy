import { router } from 'expo-router';

/** Leave a modal form. After a web refresh there's no history to go back through. */
export function closeForm(tripId: string) {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: '/trip/[id]', params: { id: tripId } });
}
