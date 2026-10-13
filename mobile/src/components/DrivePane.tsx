import { useRef, useState , useMemo} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { A11yPressable, useAccessibility, a11yFont} from '../accessibility';
import { useLayout } from '../layout';
import type { DrivePose } from '../mecanum';
import type { RobotInfo } from '../protocol';
import { colors, radii } from '../theme';
import { CameraPreview } from './CameraPreview';
import { Joystick } from './Joystick';

type Props = {
  info: RobotInfo;
  online: boolean;
  remoteDrive?: DrivePose | null;
  onStream: (enabled: boolean) => void;
  onRegisterSink: (udpPort: number, sinkHost?: string | null) => void;
  onDrive: (x: number, y: number, omega?: number) => void;
  onStop: () => void;
};

const ZERO: DrivePose = { vx: 0, vy: 0, omega: 0 };

export function DrivePane({
  info,
  online,
  remoteDrive,
  onStream,
  onRegisterSink,
  onDrive,
  onStop,
}: Props) {
  const styles = useStyles();
  const layout = useLayout();
  const { textScale } = useAccessibility();
  const stick = layout.stick;
  const remote = remoteDrive ?? ZERO;
  const [localMove, setLocalMove] = useState({ x: 0, y: 0 });
  const [localYaw, setLocalYaw] = useState(0);
  const yawHeld = useRef(false);
  const moveHeld = useRef(false);
  const driveRef = useRef(onDrive);
  driveRef.current = onDrive;

  const publish = (move: { x: number; y: number }, yaw: number, send: boolean) => {
    if (!send) return;
    driveRef.current(move.x, move.y, yaw);
  };

  const yawValue = yawHeld.current ? { x: localYaw, y: 0 } : { x: remote.omega, y: 0 };
  const moveValue = moveHeld.current ? localMove : { x: remote.vx, y: remote.vy };

  const stopBtn = (
    <A11yPressable
      exploreId="drive-stop"
      onPress={onStop}
      style={[styles.stop, layout.stopBetween && styles.stopBetween]}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Stop awaryjny"
      accessibilityHint="Natychmiast zatrzymuje silniki robota"
    >
      <Text style={[styles.stopText, layout.stopBetween && styles.stopTextBetween]}>STOP</Text>
    </A11yPressable>
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.camSlot, { flex: layout.camFlex }]}>
        <CameraPreview info={info} onStream={onStream} onRegisterSink={onRegisterSink} />
      </View>

      <View
        style={[
          styles.bottom,
          {
            flex: layout.joyFlex,
            paddingTop: layout.phone ? 2 : 8,
            paddingBottom: layout.phone ? 4 : 10,
            gap: layout.phone ? 2 : 8,
          },
        ]}
      >
        <View style={[styles.joyRow, layout.phone && { paddingHorizontal: 2 }]}>
          <View style={styles.joyCol}>
            <Joystick
              size={stick}
              disabled={!online}
              lockAxis="x"
              value={yawValue}
              onActive={(on) => {
                yawHeld.current = on;
                if (!on) {
                  setLocalYaw(0);
                  publish(moveHeld.current ? localMove : { x: remote.vx, y: remote.vy }, 0, true);
                }
              }}
              onChange={(x) => {
                setLocalYaw(x);
                publish(moveHeld.current ? localMove : { x: remote.vx, y: remote.vy }, x, true);
              }}
            />
            {layout.showJoyLabels ? (
              <Text style={[styles.joyLabel, { fontSize: a11yFont(layout.joyLabelSize, textScale) }]}>
                obrót
              </Text>
            ) : null}
          </View>
          {layout.stopBetween ? stopBtn : null}
          <View style={styles.joyCol}>
            <Joystick
              size={stick}
              disabled={!online}
              value={moveValue}
              onActive={(on) => {
                moveHeld.current = on;
                if (!on) {
                  setLocalMove({ x: 0, y: 0 });
                  publish({ x: 0, y: 0 }, yawHeld.current ? localYaw : remote.omega, true);
                }
              }}
              onChange={(x, y) => {
                setLocalMove({ x, y });
                publish({ x, y }, yawHeld.current ? localYaw : remote.omega, true);
              }}
            />
            {layout.showJoyLabels ? (
              <Text style={[styles.joyLabel, { fontSize: a11yFont(layout.joyLabelSize, textScale) }]}>
                jazda
              </Text>
            ) : null}
          </View>
        </View>
        {layout.stopBetween ? null : stopBtn}
      </View>
    </View>
  );
}

function useStyles() {
  const { colors, textScale } = useAccessibility();
  return useMemo(
    () =>
      StyleSheet.create({

  wrap: {
    flex: 1,
    minHeight: 0,
  },
  camSlot: {
    minHeight: 0,
  },
  bottom: {
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    paddingHorizontal: 6,
  },
  joyCol: {
    alignItems: 'center',
    gap: 2,
  },
  joyLabel: {
    color: colors.muted,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  stop: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 36,
  },
  stopBetween: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 24,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 2,
  },
  stopTextBetween: {
    fontSize: a11yFont(11, textScale),
    letterSpacing: 0.8,
  },

      }),
    [colors, textScale],
  );
}

