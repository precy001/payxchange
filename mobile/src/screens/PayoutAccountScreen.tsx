import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Bank = { name: string; code: string };
type Dest = { id: string; bankCode: string; accountNumber: string; accountName: string; isDefault: boolean };

export default function PayoutAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [dests, setDests] = useState<Dest[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  const [bank, setBank] = useState<Bank | null>(null);
  const [acct, setAcct] = useState('');
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([api.myPayoutDestinations(), api.listBanks()]);
      setDests(d);
      setBanks(b);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const resolveCache = React.useRef<Record<string, string>>({});

  // Preview the account name once bank + 10 digits are entered — debounced, and
  // cached per account so edits/retries don't spam the (rate-limited) endpoint.
  useEffect(() => {
    setResolvedName(null);
    if (!bank || acct.length !== 10) return;
    const key = `${bank.code}:${acct}`;
    if (resolveCache.current[key] !== undefined) {
      setResolvedName(resolveCache.current[key] || null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    const t = setTimeout(() => {
      api
        .resolvePayoutAccount(acct, bank.code)
        .then((r) => {
          if (cancelled) return;
          resolveCache.current[key] = r.accountName || '';
          setResolvedName(r.accountName || null);
        })
        .catch(() => {})
        .finally(() => !cancelled && setResolving(false));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bank, acct]);

  const save = async () => {
    if (!bank || acct.length !== 10) return;
    setSaving(true);
    try {
      await api.addPayoutDestination(bank.code, acct, resolvedName ?? undefined);
      setBank(null);
      setAcct('');
      setResolvedName(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save', (e as ApiError).message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (d: Dest) => {
    Alert.alert('Remove account?', `Remove ${d.accountName} (${d.accountNumber})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removePayoutDestination(d.id);
            await load();
          } catch (e) {
            Alert.alert('Could not remove', (e as ApiError).message || 'Try again.');
          }
        },
      },
    ]);
  };

  const makeDefault = async (d: Dest) => {
    try {
      await api.setDefaultPayout(d.id);
      await load();
    } catch (e) {
      Alert.alert('Could not update', (e as ApiError).message || 'Try again.');
    }
  };

  const filteredBanks = banks.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Payout account</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>Money you receive is paid into your bank account. Add the account below.</Text>

          {/* Existing accounts */}
          {dests.map((d) => (
            <View key={d.id} style={styles.destCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.destName}>{d.accountName}</Text>
                <Text style={styles.destMeta}>•••• {d.accountNumber.slice(-4)}</Text>
              </View>
              {d.isDefault ? (
                <View style={styles.defaultPill}>
                  <Text style={styles.defaultText}>Default</Text>
                </View>
              ) : (
                <Pressable onPress={() => makeDefault(d)} hitSlop={8}>
                  <Text style={styles.makeDefault}>Set default</Text>
                </Pressable>
              )}
              <Pressable onPress={() => remove(d)} hitSlop={8} style={{ marginLeft: spacing.md }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}

          {/* Add form */}
          <Text style={styles.section}>Add an account</Text>
          <Pressable style={styles.field} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.fieldText, !bank && { color: colors.muted }]}>{bank ? bank.name : 'Select bank'}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="10-digit account number"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={10}
            value={acct}
            onChangeText={(t) => setAcct(t.replace(/\D/g, ''))}
          />

          {resolving ? (
            <View style={styles.nameRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.resolvingText}>Checking account…</Text>
            </View>
          ) : resolvedName ? (
            <View style={styles.nameRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.resolvedName}>{resolvedName}</Text>
            </View>
          ) : bank && acct.length === 10 ? (
            <Text style={styles.unverified}>We couldn't verify the name automatically — double-check the number is correct.</Text>
          ) : null}

          <Pressable
            style={[styles.saveBtn, { backgroundColor: bank && acct.length === 10 ? colors.primary : colors.line }]}
            onPress={save}
            disabled={!bank || acct.length !== 10 || saving}
          >
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save account</Text>}
          </Pressable>
        </ScrollView>
      )}

      {/* Bank picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.fill, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12} style={{ width: 26 }}>
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
            <Text style={styles.headerTitle}>Select bank</Text>
            <View style={{ width: 26 }} />
          </View>
          <TextInput
            style={[styles.input, { margin: spacing.lg }]}
            placeholder="Search banks"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={filteredBanks}
            keyExtractor={(b) => b.code + b.name}
            renderItem={({ item }) => (
              <Pressable
                style={styles.bankRow}
                onPress={() => {
                  setBank(item);
                  setPickerOpen(false);
                  setSearch('');
                }}
              >
                <Text style={styles.bankName}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bgSoft },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    intro: { fontFamily: font.regular, fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: spacing.lg },

    destCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.md },
    destName: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    destMeta: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
    defaultPill: { backgroundColor: colors.successSoft, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
    defaultText: { fontFamily: font.semibold, fontSize: 12, color: colors.success },
    makeDefault: { fontFamily: font.semibold, fontSize: 13, color: colors.primary },

    section: { fontFamily: font.semibold, fontSize: 13, color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm },
    field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.lg, height: 54, marginBottom: spacing.md },
    fieldText: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
    input: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.lg, height: 54, fontFamily: font.medium, fontSize: 15, color: colors.ink },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    resolvingText: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
    resolvedName: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    unverified: { fontFamily: font.regular, fontSize: 13, color: colors.warning, marginTop: spacing.md, lineHeight: 19 },

    saveBtn: { height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    saveText: { fontFamily: font.bold, fontSize: 16, color: colors.white },

    bankRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
    bankName: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  });