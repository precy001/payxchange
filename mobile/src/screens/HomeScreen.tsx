import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api } from '../lib/api';
import TransactionRow, { Txn } from '../components/TransactionRow';
import Skeleton from '../components/Skeleton';
import { font, gradients, radius, shadow, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [me, setMe] = useState<any>(null);
  const [recent, setRecent] = useState<Txn[]>([]);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    if (isFocused) {
      api.listTransactions().then((t) => setRecent(t.slice(0, 3))).catch(() => {});
    }
  }, [isFocused]);

  const fullName: string = me?.fullName || 'there';
  const firstName = fullName.split(' ')[0];
  const initials = fullName
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          {me ? (
            <Text style={styles.hi}>Hi, {firstName} 👋</Text>
          ) : (
            <Skeleton width={160} height={26} radius={8} style={{ marginTop: 4 }} />
          )}
        </View>
        <Pressable style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
          {me?.avatar ? (
            <Image source={{ uri: me.avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials || 'U'}</Text>
          )}
        </Pressable>
      </View>

      {/* Identity card */}
      <View style={styles.cardWrap}>
        {me ? (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.cardGlow1} />
            <View style={styles.cardGlow2} />
            <View style={styles.cardTop}>
              <Text style={styles.cardBrand}>PayXchange</Text>
              <Ionicons name="wifi" size={20} color={colors.onBrandSoft} style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
            <View>
              <Text style={styles.cardName}>{fullName}</Text>
              <Text style={styles.cardPhone}>{me?.phone ?? '—'}</Text>
            </View>
          </LinearGradient>
        ) : (
          <Skeleton width="100%" height={168} radius={radius.xl} />
        )}
      </View>

      {/* Hero actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.action, styles.actionPrimary, shadow.sm, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Scan')}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Ionicons name="scan" size={26} color={colors.white} />
          </View>
          <View>
            <Text style={styles.actionPrimaryText}>Scan to Pay</Text>
            <Text style={styles.actionPrimarySub}>Pay any QR</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.action, styles.actionSecondary, pressed && styles.pressed]}
          onPress={() => navigation.navigate('ReceiveAmount')}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="qr-code" size={24} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.actionSecondaryText}>Receive</Text>
            <Text style={styles.actionSecondarySub}>Show a QR</Text>
          </View>
        </Pressable>
      </View>

      {/* Recent activity */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => navigation.navigate('Activity')} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        )}
      </View>

      {recent.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={26} color={colors.muted} />
          </View>
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySub}>Your payments will show up here.</Text>
        </View>
      ) : (
        <View style={styles.recentCard}>
          {recent.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={styles.sep} />}
              <TransactionRow txn={t} onPress={() => navigation.navigate('TransactionDetail', { txn: t })} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSoft },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  eyebrow: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  hi: { fontFamily: font.extrabold, fontSize: 25, color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontFamily: font.bold, color: colors.primary, fontSize: 15 },
  avatarImg: { width: 46, height: 46, borderRadius: radius.pill },

  cardWrap: { paddingHorizontal: spacing.xl },
  card: { borderRadius: radius.xl, padding: spacing.xl, height: 168, justifyContent: 'space-between', overflow: 'hidden', ...shadow.md },
  cardGlow1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)', top: -70, right: -40 },
  cardGlow2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -50, left: -20 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardBrand: { fontFamily: font.bold, color: colors.white, fontSize: 16, letterSpacing: 0.3 },
  cardName: { fontFamily: font.semibold, color: colors.white, fontSize: 19 },
  cardPhone: { fontFamily: font.regular, color: colors.onBrandSoft, fontSize: 14, marginTop: 3, letterSpacing: 0.5 },

  actions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  action: { flex: 1, height: 140, borderRadius: radius.lg, padding: spacing.lg, justifyContent: 'space-between' },
  actionPrimary: { backgroundColor: colors.primary },
  actionSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  actionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionPrimaryText: { fontFamily: font.bold, fontSize: 17, color: colors.white },
  actionPrimarySub: { fontFamily: font.regular, fontSize: 12, color: colors.onBrandSoft, marginTop: 2 },
  actionSecondaryText: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
  actionSecondarySub: { fontFamily: font.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionTitle: { fontFamily: font.bold, fontSize: 16, color: colors.ink },
  seeAll: { fontFamily: font.semibold, fontSize: 14, color: colors.primary },
  recentCard: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.line },
  sep: { height: 1, backgroundColor: colors.line },
  empty: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft },
  emptySub: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
});