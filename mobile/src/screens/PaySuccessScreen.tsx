import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatNaira } from '../lib/money';
import Button from '../components/Button';
import { colors, font, radius, spacing } from '../theme';

export default function PaySuccessScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { amountKobo, payeeName } = route.params ?? {};

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.center}>
        <View style={styles.halo}>
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={56} color={colors.white} />
          </View>
        </View>
        <Text style={styles.title}>Payment sent</Text>
        <Text style={styles.amount}>{formatNaira(amountKobo ?? 0)}</Text>
        <Text style={styles.to}>to {payeeName ?? 'payee'}</Text>
      </View>

      <Button title="Done" onPress={goHome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: {
    width: 150,
    height: 150,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  badge: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.semibold, fontSize: 17, color: colors.muted },
  amount: { fontFamily: font.extrabold, fontSize: 44, color: colors.ink, letterSpacing: -1, marginTop: spacing.sm },
  to: { fontFamily: font.regular, fontSize: 16, color: colors.inkSoft, marginTop: spacing.xs },
});