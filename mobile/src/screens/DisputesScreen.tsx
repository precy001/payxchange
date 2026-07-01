import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api } from '../lib/api';
import { formatWhen } from '../lib/format';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export type Dispute = {
  id: string;
  transactionId: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

export const REASON_LABEL: Record<string, string> = {
  unauthorized: "Didn't make this payment",
  wrong_amount: 'Wrong amount charged',
  not_received: 'Payment not received',
  duplicate: 'Charged more than once',
  other: 'Other issue',
};

export function disputeStatusMeta(status: string, colors: Palette): { label: string; color: string } {
  switch (status) {
    case 'resolved':
      return { label: 'Resolved', color: colors.success };
    case 'under_review':
      return { label: 'Under review', color: colors.primary };
    case 'rejected':
      return { label: 'Rejected', color: colors.danger };
    default:
      return { label: 'Pending review', color: colors.warning };
  }
}

export default function DisputesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [items, setItems] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api.listDisputes();
      setItems(rows);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>My reports</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.muted} />
          <Text style={styles.empty}>No reports yet.</Text>
          <Text style={styles.emptyHint}>If something looks wrong with a transaction, open it and tap “Report a problem.”</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {items.map((d) => {
            const meta = disputeStatusMeta(d.status, colors);
            return (
              <View key={d.id} style={styles.card}>
                <View style={styles.rowTop}>
                  <Text style={styles.reason}>{REASON_LABEL[d.reason] ?? 'Issue'}</Text>
                  <View style={[styles.pill, { backgroundColor: meta.color + '22' }]}>
                    <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                {d.details ? <Text style={styles.details} numberOfLines={2}>{d.details}</Text> : null}
                {d.resolution ? <Text style={styles.resolution}>Resolution: {d.resolution}</Text> : null}
                <Text style={styles.date}>Reported {formatWhen(d.createdAt)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bgSoft },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
    empty: { fontFamily: font.semibold, fontSize: 16, color: colors.ink, marginTop: spacing.md },
    emptyHint: { fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },

    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.md },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    reason: { fontFamily: font.semibold, fontSize: 15, color: colors.ink, flex: 1 },
    pill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
    pillText: { fontFamily: font.semibold, fontSize: 12 },
    details: { fontFamily: font.regular, fontSize: 14, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 20 },
    resolution: { fontFamily: font.medium, fontSize: 13, color: colors.success, marginTop: spacing.sm },
    date: { fontFamily: font.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  });