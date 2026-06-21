import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

// Pull the token out of a scanned "payxchange://pay?ref=TOKEN" code.
function extractToken(data: string): string | null {
  const m = data.match(/ref=([^&\s]+)/);
  return m ? m[1] : null;
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const onScan = ({ data }: { data: string }) => {
    if (scanned) return;
    const token = extractToken(data);
    if (!token) return; // ignore non-PayXchange codes
    setScanned(true);
    navigation.navigate('PayConfirm', { token });
  };

  // Reset the one-shot guard whenever we return to this screen.
  React.useEffect(() => {
    if (isFocused) setScanned(false);
  }, [isFocused]);

  if (!permission) {
    return <View style={styles.black} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + spacing.md }]}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.permCenter}>
          <View style={styles.badge}>
            <Ionicons name="camera-outline" size={36} color={colors.primary} />
          </View>
          <Text style={styles.permTitle}>Camera access</Text>
          <Text style={styles.permSub}>
            PayXchange needs your camera to scan payment codes.
          </Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow camera</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : onScan}
        />
      )}

      {/* Overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.md }]}>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        <View style={styles.reticleWrap}>
          <View style={styles.reticle} />
          <Text style={styles.scanHint}>Point at a PayXchange QR code</Text>
        </View>

        <View />
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl },
  closeBtn: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleWrap: { alignItems: 'center' },
  reticle: {
    width: 250,
    height: 250,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: 'transparent',
  },
  scanHint: { color: colors.white, fontFamily: font.semibold, fontSize: 15, marginTop: spacing.xl },

  permission: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center' },
  permCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 84, height: 84, borderRadius: radius.pill, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  permTitle: { fontFamily: font.extrabold, fontSize: 24, color: colors.ink, marginBottom: spacing.sm },
  permSub: { fontFamily: font.regular, fontSize: 15, color: colors.muted, textAlign: 'center', maxWidth: 280, lineHeight: 22, marginBottom: spacing.xl },
  permBtn: { height: 54, paddingHorizontal: spacing.xxl, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  permBtnText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
});