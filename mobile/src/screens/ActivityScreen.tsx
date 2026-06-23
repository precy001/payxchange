import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { formatNaira } from '../lib/money';
import TransactionRow, { Txn } from '../components/TransactionRow';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type Filter = 'all' | 'in' | 'out';
type Series = { label: string; inKobo: number; outKobo: number };
type Summary = {
  month: string;
  inflowKobo: number;
  outflowKobo: number;
  series: Series[];
  transactions: Txn[];
};

const CHART_H = 110;

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();

  const [monthDate, setMonthDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = useMemo(() => {
    const n = new Date();
    return monthDate.getFullYear() === n.getFullYear() && monthDate.getMonth() === n.getMonth();
  }, [monthDate]);

  const load = useCallback(async () => {
    try {
      const res = await api.monthlySummary(monthStr);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      load();
    }
  }, [isFocused, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const prevMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => {
    if (isCurrentMonth) return;
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const txns = data?.transactions ?? [];
  const q = query.trim().toLowerCase();
  const filtered = txns.filter((t) => {
    const dirOk = filter === 'all' ? true : filter === 'in' ? t.direction === 'received' : t.direction === 'sent';
    if (!dirOk) return false;
    if (!q) return true;
    const hay = `${t.counterparty} ${t.description} ${formatNaira(t.amountKobo)} ${t.amountKobo / 100}`.toLowerCase();
    return hay.includes(q);
  });
  const series = data?.series ?? [];
  const maxVal = Math.max(1, ...series.flatMap((s) => [s.inKobo, s.outKobo]));

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Month switcher */}
      <View style={styles.monthRow}>
        <Pressable onPress={prevMonth} hitSlop={10} style={styles.monthBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS[monthDate.getMonth()]} {monthDate.getFullYear()}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={10} style={[styles.monthBtn, isCurrentMonth && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          {/* Summary cards */}
          <View style={styles.cards}>
            <View style={styles.summaryCard}>
              <View style={styles.sumRow}>
                <View style={[styles.sumDot, { backgroundColor: colors.success }]}>
                  <Ionicons name="arrow-down" size={14} color={colors.white} />
                </View>
                <Text style={styles.sumLabel}>Money in</Text>
              </View>
              <Text style={[styles.sumAmount, { color: colors.success }]}>{formatNaira(data?.inflowKobo ?? 0)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.sumRow}>
                <View style={[styles.sumDot, { backgroundColor: colors.primary }]}>
                  <Ionicons name="arrow-up" size={14} color={colors.white} />
                </View>
                <Text style={styles.sumLabel}>Money out</Text>
              </View>
              <Text style={[styles.sumAmount, { color: colors.ink }]}>{formatNaira(data?.outflowKobo ?? 0)}</Text>
            </View>
          </View>

          {/* Weekly flow chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>This month's flow</Text>
            <View style={styles.chart}>
              {series.map((s) => (
                <View key={s.label} style={styles.chartCol}>
                  <View style={styles.bars}>
                    <View style={[styles.bar, { height: Math.max(3, (s.inKobo / maxVal) * CHART_H), backgroundColor: colors.success }]} />
                    <View style={[styles.bar, { height: Math.max(3, (s.outKobo / maxVal) * CHART_H), backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={styles.chartLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={styles.legendText}>In</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Out</Text>
              </View>
            </View>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, note or amount"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Filter tabs */}
          <View style={styles.tabs}>
            {(['all', 'in', 'out'] as Filter[]).map((f) => (
              <Pressable key={f} style={[styles.tab, filter === f && styles.tabActive]} onPress={() => setFilter(f)}>
                <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                  {f === 'all' ? 'All' : f === 'in' ? 'In' : 'Out'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* List */}
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name={q ? 'search-outline' : 'receipt-outline'} size={28} color={colors.muted} />
              <Text style={styles.emptyText}>{q ? 'No matching transactions' : 'Nothing here this month'}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map((t, i) => (
                <View key={t.id}>
                  {i > 0 && <View style={styles.sep} />}
                  <TransactionRow txn={t} onPress={() => navigation.navigate('TransactionDetail', { txn: t })} />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bgSoft },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  monthBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  monthLabel: { fontFamily: font.extrabold, fontSize: 20, color: colors.ink },
  loading: { paddingTop: spacing.xxxl, alignItems: 'center' },

  cards: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl },
  summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sumDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sumLabel: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  sumAmount: { fontFamily: font.extrabold, fontSize: 20, letterSpacing: -0.3 },

  chartCard: { backgroundColor: colors.card, borderRadius: radius.lg, marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  chartTitle: { fontFamily: font.semibold, fontSize: 14, color: colors.inkSoft, marginBottom: spacing.lg },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: CHART_H + 24 },
  chartCol: { alignItems: 'center', gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: CHART_H },
  bar: { width: 10, borderRadius: 5 },
  chartLabel: { fontFamily: font.medium, fontSize: 11, color: colors.muted },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: font.medium, fontSize: 12, color: colors.muted },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, marginHorizontal: spacing.xl, marginTop: spacing.xl, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.ink, paddingVertical: 0 },

  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, marginHorizontal: spacing.xl, marginTop: spacing.md, padding: 4, borderWidth: 1, borderColor: colors.line },
  tab: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontFamily: font.semibold, fontSize: 14, color: colors.inkSoft },
  tabTextActive: { color: colors.white },

  list: { backgroundColor: colors.card, marginHorizontal: spacing.xl, marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  sep: { height: 1, backgroundColor: colors.line },
  empty: { alignItems: 'center', paddingTop: spacing.xxxl },
  emptyText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft, marginTop: spacing.sm },
});