import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/format';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

type Session = {
  id: string;
  label: string | null;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.listSessions();
      setSessions(rows);
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

  const revoke = (s: Session) => {
    Alert.alert('Sign out device?', `${s.label ?? 'This device'} will be signed out.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusyId(s.id);
          try {
            await api.revokeSession(s.id);
            await load();
          } catch (e) {
            Alert.alert('Could not sign out', (e as ApiError).message || 'Try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const logoutOthers = () => {
    Alert.alert('Sign out all other devices?', 'Only this device will stay signed in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out others',
        style: 'destructive',
        onPress: async () => {
          setBusyId('others');
          try {
            await api.logoutOtherSessions();
            await load();
          } catch (e) {
            Alert.alert('Could not sign out', (e as ApiError).message || 'Try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const others = sessions.filter((s) => !s.current).length;

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Devices & sessions</Text>
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
          <Text style={styles.intro}>
            These are the devices currently signed in to your account. Sign out any you don't recognise.
          </Text>

          <View style={styles.card}>
            {sessions.map((s, i) => (
              <View key={s.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label} numberOfLines={1}>
                      {s.label ?? 'Unknown device'}
                      {s.current ? <Text style={styles.currentTag}>  • This device</Text> : null}
                    </Text>
                    <Text style={styles.meta}>Last active {formatWhen(s.lastSeenAt)}</Text>
                  </View>
                  {!s.current &&
                    (busyId === s.id ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : (
                      <Pressable hitSlop={8} onPress={() => revoke(s)}>
                        <Text style={styles.signOut}>Sign out</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            ))}
          </View>

          {others > 0 && (
            <Pressable style={styles.dangerBtn} onPress={logoutOthers} disabled={busyId === 'others'}>
              {busyId === 'others' ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.dangerText}>Sign out all other devices</Text>
              )}
            </Pressable>
          )}
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
    intro: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: spacing.lg },

    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.lg },
    divider: { height: 1, backgroundColor: colors.line },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
    icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    currentTag: { fontFamily: font.semibold, fontSize: 13, color: colors.success },
    meta: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
    signOut: { fontFamily: font.bold, fontSize: 14, color: colors.danger },

    dangerBtn: { height: 54, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
    dangerText: { fontFamily: font.bold, fontSize: 15, color: colors.danger },
  });