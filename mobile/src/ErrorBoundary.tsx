import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null; info: string | null };

/**
 * Łapie błędy JS w APK (biały ekran → czytelny komunikat + restart).
 * Natywny crash (np. New Arch + react-native-udp) wymaga przebudowy z newArchEnabled=false.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? null });
    console.error('RPilot ErrorBoundary', error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.title}>RPilot — błąd aplikacji</Text>
        <Text style={styles.body}>
          Aplikacja napotkała błąd i zatrzymała ten ekran. Możesz spróbować ponownie. Jeśli problem
          wraca zaraz po instalacji APK, przebuduj z wyłączoną New Architecture (już w app.json).
        </Text>
        <ScrollView style={styles.box} bounces={false}>
          <Text style={styles.mono} selectable>
            {error.message}
          </Text>
          {info ? (
            <Text style={styles.stack} selectable>
              {info}
            </Text>
          ) : null}
        </ScrollView>
        <Pressable
          style={styles.btn}
          onPress={() => this.setState({ error: null, info: null })}
          accessibilityRole="button"
          accessibilityLabel="Spróbuj ponownie"
        >
          <Text style={styles.btnText}>Spróbuj ponownie</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#111',
    padding: 24,
    paddingTop: 56,
    gap: 12,
  },
  title: {
    color: '#ffcc00',
    fontSize: 20,
    fontWeight: '800',
  },
  body: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
  },
  box: {
    flexGrow: 0,
    maxHeight: 280,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  mono: {
    color: '#f88',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  stack: {
    color: '#888',
    fontSize: 10,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  btn: {
    backgroundColor: '#ffcc00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
});
