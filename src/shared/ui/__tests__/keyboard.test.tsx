import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import { Chip, ChipRow, ScreenScroll, Text } from '@/shared/ui';

afterEach(() => {
  jest.restoreAllMocks();
});

type Node = ReactTestRendererJSON;
const nodes = (n: Node | Node[] | string | null): Node[] =>
  !n || typeof n === 'string'
    ? []
    : Array.isArray(n)
      ? n.flatMap(nodes)
      : [n, ...nodes((n.children ?? []) as Node[])];
const tree = () => nodes(screen.toJSON() as Node | Node[] | null);

/** Captures the keyboard listeners KeyboardAvoidingView registers, so a test can open the keyboard. */
function fakeKeyboard() {
  const listeners: Record<string, (e: unknown) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((type: string, fn: (e: unknown) => void) => {
    listeners[type] = fn;
    return { remove: () => {} };
  }) as typeof Keyboard.addListener);
  return listeners;
}

/** A 2400 px tall window: the header takes 88, the keyboard covers everything below 1500. */
async function openKeyboard(listeners: Record<string, (e: unknown) => void>) {
  const avoider = tree().find((n) => typeof n.props.onLayout === 'function')!;
  await act(async () => {
    await avoider.props.onLayout({
      persist: () => {},
      nativeEvent: { layout: { x: 0, y: 0, width: 1080, height: 2312 } },
    });
    listeners.keyboardDidShow?.({ endCoordinates: { screenX: 0, screenY: 1500, width: 1080, height: 900 } });
  });
}

/** The keyboard avoider's own padding (the outermost view that measures itself). */
const paddingBottom = () =>
  StyleSheet.flatten(tree().find((n) => typeof n.props.onLayout === 'function')?.props.style)?.paddingBottom;

describe('ScreenScroll and the keyboard', () => {
  it('on Android, lifts the form by exactly the part the keyboard covers', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners = fakeKeyboard();
    await render(
      <HeaderHeightContext.Provider value={88}>
        <ScreenScroll>
          <Text>Form</Text>
        </ScreenScroll>
      </HeaderHeightContext.Provider>,
    );
    await openKeyboard(listeners);
    expect(paddingBottom()).toBe(900);
  });

  it('leaves iOS to each screen, which uses automaticallyAdjustKeyboardInsets', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const listeners = fakeKeyboard();
    await render(
      <ScreenScroll automaticallyAdjustKeyboardInsets>
        <Text>Form</Text>
      </ScreenScroll>,
    );
    await openKeyboard(listeners);
    expect(paddingBottom() ?? 0).toBe(0);
    expect(tree().some((n) => n.props.automaticallyAdjustKeyboardInsets === true)).toBe(true);
  });

  it('lets a chip take the first tap while the keyboard is open', async () => {
    await render(
      <ChipRow>
        <Chip label="THB" onPress={() => {}} />
      </ChipRow>,
    );
    expect(tree().some((n) => n.props.horizontal && n.props.keyboardShouldPersistTaps === 'handled')).toBe(
      true,
    );
  });
});
