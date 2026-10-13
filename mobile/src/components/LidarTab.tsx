import { useEffect, useState , useMemo} from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccessibility, a11yFont } from '../accessibility';
import { demoLidarPoints, type LidarPoint } from '../lidar';
import { colors, radii } from '../theme';
import { LidarRadar } from './LidarRadar';

type Props = {
  points: LidarPoint[];
  online: boolean;
  preview?: boolean;
  onPoll: () => void;
};

export function LidarTab({ points, online, preview, onPoll }: Props) {
  const styles = useStyles();
  const [size, setSize] = useState(280);
  const [demo, setDemo] = useState<LidarPoint[]>([]);
  const live = points.length > 0;
  const shown = live ? points : demo;

  useEffect(() => {
    if (!online && !preview) return;
    if (live) return;
    setDemo(demoLidarPoints());
    const id = setInterval(() => setDemo(demoLidarPoints()), 400);
    return () => clearInterval(id);
  }, [online, preview, live]);

  useEffect(() => {
    if (!online) return;
    onPoll();
    const id = setInterval(onPoll, 250);
    return () => clearInterval(id);
  }, [online, onPoll]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(Math.max(180, Math.floor(Math.min(width - 16, height - 72))));
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      <View style={styles.head}>
        <Text style={styles.title}>LiDAR</Text>
        <Text style={styles.meta}>
          {live ? `${points.length} pkt` : preview || !online ? 'demo' : 'czekam na punkty…'}
        </Text>
      </View>
      <View style={styles.radarWrap}>
        <LidarRadar points={shown} size={size} rangeM={8} />
      </View>
      <Pressable onPress={onPoll} style={styles.refresh} disabled={!online}>
        <Text style={styles.refreshText}>Odśwież</Text>
      </Pressable>
    </View>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  root: {
    flex: 1,
    minHeight: 0,
    padding: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: a11yFont(18, textScale),
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: a11yFont(12, textScale),
    fontWeight: '600',
  },
  radarWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#0d1117',
  },
  refresh: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: colors.tabBar,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: a11yFont(13, textScale),
  },

      }),
    [colors, textScale],
  );
}

