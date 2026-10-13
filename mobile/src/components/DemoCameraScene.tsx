import { StyleSheet, Text, View } from 'react-native';

/** Atrapa klatki z mockupu — do pracy nad UI bez Pi. */
export function DemoCameraScene({ height }: { height: number }) {
  return (
    <View style={[styles.scene, { height }]}>
      <View style={styles.sky} />
      <View style={styles.sun} />
      <View style={styles.cloud} />
      <View style={[styles.hill, styles.hillBack]} />
      <View style={[styles.hill, styles.hillFront]} />
      <Text style={styles.caption}>Podgląd UI · bez kamery</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#7ec8e8',
  },
  sky: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7ec8e8',
  },
  sun: {
    position: 'absolute',
    top: 18,
    right: 28,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffe566',
  },
  cloud: {
    position: 'absolute',
    top: 28,
    left: 36,
    width: 70,
    height: 28,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  hill: {
    position: 'absolute',
    bottom: -40,
    width: '70%',
    height: '70%',
    borderRadius: 120,
  },
  hillBack: {
    left: -40,
    backgroundColor: '#5aa85a',
  },
  hillFront: {
    right: -50,
    bottom: -50,
    backgroundColor: '#3e8f45',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
