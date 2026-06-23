import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatNaira } from '../lib/money';
import { formatWhen } from '../lib/format';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export type Txn = {
  id: string;
  direction: 'sent' | 'received';
  counterparty: string;
  description: string;
  amountKobo: number;
  state: string;
  createdAt: string;
};

function statusMeta(state: string, colors: Palette): { label: string; color: string } {
  if (['completed', 'payout_sent'].includes(state)) {
    return { label: 'Completed', color: colors.success };
  }
  if (state === 'reversed') {
    return { label: 'Refunded', color: colors.inkSoft };
  }
  if (['payout_failed', 'reversing'].includes(state)) {
    return { label: 'Refunding', color: colors.warning };
  }
  if (state === 'failed') {
    return { label: 'Failed', color: colors.danger };
  }
  if (['payer_charged', 'payout_pending', 'authorized', 'pending'].includes(state)) {
    return { label: 'Processing', color: colors.warning };
  }
  return { label: 'Pending', color: colors.muted };
}

export default function TransactionRow({ txn, onPress }: { txn: Txn; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const received = txn.direction === 'received';
  const status = statusMeta(txn.state, colors);

  const inner = (
    <>
      <View style={[styles.icon, { backgroundColor: received ? colors.successSoft : colors.primarySoft }]}>
        <Ionicons
          name={received ? 'arrow-down' : 'arrow-up'}
          size={20}
          color={received ? colors.success : colors.primary}
        />
      </View>

      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {received ? 'From ' : 'To '}
          {txn.counterparty}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {txn.description || formatWhen(txn.createdAt)}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, { color: received ? colors.success : colors.ink }]}>
          {received ? '+' : '-'}
          {formatNaira(txn.amountKobo)}
        </Text>
        <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
      </View>
    </>
  );

  if (!onPress) return <View style={styles.row}>{inner}</View>;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={onPress}>
      {inner}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
    icon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
    middle: { flex: 1, marginRight: spacing.sm },
    name: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    sub: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
    right: { alignItems: 'flex-end' },
    amount: { fontFamily: font.bold, fontSize: 15 },
    status: { fontFamily: font.medium, fontSize: 12, marginTop: 2 },
  });