import { useLocalSearchParams } from 'expo-router';
import { CaptureScreen } from '@/features/capture/screens/CaptureScreen';

/** Also the deep-link / share-extension entry point: travyy://add?url=…&text=… */
export default function AddRoute() {
  const { url, text } = useLocalSearchParams<{ url?: string; text?: string }>();
  return <CaptureScreen initialUrl={url} initialText={text} />;
}
