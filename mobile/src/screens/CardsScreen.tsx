import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Card = { id: string; brand: string | null; last4: string | null };

export default function CardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCards(await api.myCards());
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

  const remove = (card: Card) => {
    Alert.alert('Remove card?', `Remove the card ending ${card.last4 ?? ''}? You'll re-enter it next time you pay.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(card.id);
          try {
            await api.removeCard(card.id);
            await load();
          } catch (e) {
            Alert.alert('Could not remove', (e as ApiError).message || 'Try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment methods</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {cards.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="card-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>No saved cards yet</Text>
              <Text style={styles.emptyHint}>
                The first time you pay, your card is saved securely so future payments are one tap — no re-typing.
              </Text>
            </View>
          ) : (
            cards.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="card" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brand}>{c.brand ?? 'Card'}</Text>
                  <Text style={styles.last4}>•••• •••• •••• {c.last4 ?? '••••'}</Text>
                </View>
                {busyId === c.id ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Pressable hitSlop={8} onPress={() => remove(c)}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            ))
          )}

          <Text style={styles.footnote}>
            Cards are saved automatically when you pay. We store a secure token from our payment partner — never your full card details.
          </Text>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
    emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.ink, marginTop: spacing.sm },
    emptyHint: { fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg },

    card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.md },
    icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    brand: { fontFamily: font.semibold, fontSize: 15, color: colors.ink, textTransform: 'capitalize' },
    last4: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: 2, letterSpacing: 1 },
    footnote: { fontFamily: font.regular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: spacing.lg, textAlign: 'center' },
  });