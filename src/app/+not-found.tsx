import { Link, Stack } from 'expo-router';
import { EmptyState, Screen, Text } from '@/shared/ui';

export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState
        emoji="🧭"
        title="This page wandered off"
        body="The link may be old or mistyped."
        action={
          <Link href="/">
            <Text variant="bodyStrong" color="primary">
              Back to the map
            </Text>
          </Link>
        }
      />
    </Screen>
  );
}
