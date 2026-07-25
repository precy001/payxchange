import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatNaira } from '../lib/money';
import { api } from '../lib/api';
import Button from '../components/Button';
import { font, gradients, radius, shadow, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

// A branded, printable "payment card" — PX header, the QR, and who it pays —
// so a merchant can save it, print it, and stick it on the counter.
function cardHtml(opts: { qr: string; name: string; isStatic: boolean; amount: string; note?: string }) {
  const amountLine = opts.isStatic
    ? 'Scan to pay any amount'
    : `Scan to pay ${opts.amount}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:-apple-system,Helvetica,Arial,sans-serif}
    .card{width:520px;margin:40px auto;border-radius:28px;overflow:hidden;border:1px solid #e6e8f0;box-shadow:0 20px 50px rgba(11,16,32,.12)}
    .top{background:linear-gradient(135deg,#6D5EF6,#B84DF0);padding:34px 40px;color:#fff}
    .brand{font-size:26px;font-weight:800;letter-spacing:-.5px}
    .brand span{opacity:.85}
    .tag{font-size:13px;opacity:.9;margin-top:4px;letter-spacing:.3px}
    .body{background:#fff;padding:40px;text-align:center}
    .qrbox{width:300px;height:300px;margin:0 auto;border:1px solid #eef0f6;border-radius:20px;padding:16px;display:flex;align-items:center;justify-content:center}
    .qrbox img{width:100%;height:100%;object-fit:contain}
    .name{font-size:24px;font-weight:800;color:#0B1020;margin-top:26px}
    .scan{font-size:16px;color:#5b6076;margin-top:8px}
    .note{font-size:14px;color:#8a90a6;margin-top:6px}
    .foot{background:#0B1020;color:#aeb4d4;text-align:center;padding:16px;font-size:12px;letter-spacing:.4px}
  </style></head><body>
  <div class="card">
    <div class="top"><div class="brand">Pay<span>X</span>change</div><div class="tag">Scan · Pay · Done</div></div>
    <div class="body">
      <div class="qrbox"><img src="${opts.qr}"/></div>
      <div class="name">${opts.name}</div>
      <div class="scan">${amountLine}</div>
      ${opts.note ? `<div class="note">${opts.note}</div>` : ''}
    </div>
    <div class="foot">Pay in seconds with the PayXchange app</div>
  </div></body></html>`;
}

export default function ReceiveQRScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { qrImage, amountKobo, description, isStatic } = route.params ?? {};

  const [name, setName] = useState('PayXchange user');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    api.me().then((m: any) => m?.fullName && setName(m.fullName)).catch(() => {});
  }, []);

  const shareCard = async () => {
    if (!qrImage || sharing) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({
        html: cardHtml({
          qr: qrImage,
          name,
          isStatic: !!isStatic,
          amount: formatNaira(amountKobo ?? 0),
          note: description || undefined,
        }),
        base64: false,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share your payment card' });
      } else {
        Alert.alert('Saved', 'Your payment card was created.');
      }
    } catch {
      Alert.alert('Could not create card', 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.amount}>
          {isStatic ? 'Any amount' : formatNaira(amountKobo ?? 0)}
        </Text>
        <Text style={styles.desc}>{description}</Text>

        <View style={styles.qrCard}>
          <View style={styles.brandRow}>
            <Text style={styles.brandMark}>
              Pay<Text style={styles.brandX}>Xchange</Text>
            </Text>
          </View>
          {qrImage ? (
            <View style={styles.qrWrap}>
              <Image source={{ uri: qrImage }} style={styles.qr} resizeMode="contain" />
              <View style={styles.logoBadge}>
                <LinearGradient
                  colors={gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoInner}
                >
                  <Text style={styles.logoText}>PX</Text>
                </LinearGradient>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>No code</Text>
          )}
        </View>

        <View style={styles.hintRow}>
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={styles.hint}>
            {isStatic
              ? 'Reusable · never expires · payer enters the amount'
              : 'Expires in 10 minutes · single use'}
          </Text>
        </View>
        <Text style={styles.scanMe}>Ask the payer to scan this with PayXchange</Text>
      </View>

      <Pressable style={styles.shareBtn} onPress={shareCard} disabled={sharing}>
        {sharing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="download-outline" size={19} color={colors.primary} />
            <Text style={styles.shareText}>{isStatic ? 'Save / print payment card' : 'Save payment card'}</Text>
          </>
        )}
      </Pressable>

      <Button title="Done" onPress={() => navigation.popToTop()} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent', marginBottom: spacing.md },
  shareText: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amount: { fontFamily: font.extrabold, fontSize: 40, color: colors.ink, letterSpacing: -0.5 },
  desc: { fontFamily: font.regular, fontSize: 15, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xxl },
  qrCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  brandRow: { marginBottom: spacing.lg },
  // The card is always true white (for scannability), so these use fixed dark
  // brand colors rather than theme colors.
  brandMark: { fontFamily: font.extrabold, fontSize: 18, color: '#0B1020', letterSpacing: -0.3 },
  brandX: { color: '#4F46E5' },
  qrWrap: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  qr: { position: 'absolute', width: 240, height: 240 },
  logoBadge: {
    padding: 5,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  logoInner: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: font.extrabold, fontSize: 17, color: '#FFFFFF', letterSpacing: -0.5 },
  muted: { fontFamily: font.regular, color: colors.muted, width: 240, height: 240, textAlign: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  hint: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  scanMe: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
});