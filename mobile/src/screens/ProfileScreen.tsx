import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing } from '../theme';
import { useTheme, Palette } from '../theme/ThemeContext';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { logout, biometricAvailable, biometricEnabled, setBiometricEnabled, setLockSuspended } = useAuth();
  const [me, setMe] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  const fullName: string = me?.fullName || 'Your name';
  const initials = fullName
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const verified = me?.kyc === 'verified';

  const Row = ({
    icon,
    label,
    onPress,
    right,
    danger,
  }: {
    icon: string;
    label: string;
    onPress?: () => void;
    right?: React.ReactNode;
    danger?: boolean;
  }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.bgSoft }]}
      onPress={onPress}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name={icon as any} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <View style={styles.rowRight}>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
      </View>
    </Pressable>
  );

  const pickAvatar = async () => {
    setLockSuspended(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to set a picture.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (res.canceled) return;
      setUploading(true);
      const manip = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUrl = `data:image/jpeg;base64,${manip.base64}`;
      await api.updateAvatar(dataUrl);
      setMe((m: any) => ({ ...(m || {}), avatar: dataUrl }));
    } catch (e) {
      Alert.alert('Upload failed', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
      setTimeout(() => setLockSuspended(false), 500);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.identity}>
        <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
          {me?.avatar ? (
            <Image source={{ uri: me.avatar }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials || 'U'}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="camera" size={15} color={colors.white} />
            )}
          </View>
        </Pressable>
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.phone}>{me?.phone ?? '—'}</Text>
        <View style={[styles.chip, verified ? styles.chipVerified : styles.chipUnverified]}>
          <Ionicons
            name={verified ? 'shield-checkmark' : 'alert-circle-outline'}
            size={13}
            color={verified ? colors.success : colors.warning}
          />
          <Text style={[styles.chipText, { color: verified ? colors.success : colors.warning }]}>
            {verified ? 'Verified' : 'Unverified'}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Security</Text>
      <View style={styles.card}>
        <Row icon="keypad-outline" label="Change PIN" onPress={() => navigation.navigate('ChangePin')} />
        <View style={styles.divider} />
        <Row
          icon="finger-print-outline"
          label="Unlock with biometrics"
          right={
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              disabled={!biometricAvailable}
              trackColor={{ true: colors.primary, false: colors.line }}
              thumbColor={colors.white}
            />
          }
        />
      </View>

      <Text style={styles.section}>Appearance</Text>
      <View style={styles.card}>
        <Row
          icon="moon-outline"
          label="Dark mode"
          right={
            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ true: colors.primary, false: colors.line }}
              thumbColor={colors.white}
            />
          }
        />
      </View>

      <Text style={styles.section}>General</Text>
      <View style={styles.card}>
        <Row icon="help-circle-outline" label="Help & support" onPress={() => Alert.alert('Help & support', 'support@payxchange.app')} />
        <View style={styles.divider} />
        <Row icon="information-circle-outline" label="About PayXchange" onPress={() => Alert.alert('PayXchange', 'Scan-to-pay, made simple. v1.0')} />
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Row icon="trash-outline" label="Delete account" danger onPress={() => navigation.navigate('DeleteAccount')} />
      </View>

      <Pressable style={styles.logout} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.inkSoft} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bgSoft },
    title: { fontFamily: font.extrabold, fontSize: 28, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },

    identity: { alignItems: 'center', marginBottom: spacing.xl },
    avatarWrap: { width: 96, height: 96, marginBottom: spacing.md },
    avatarImg: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft },
    avatarFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { fontFamily: font.bold, fontSize: 30, color: colors.primary },
    camBadge: {
      position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 3, borderColor: colors.bgSoft,
    },
    name: { fontFamily: font.extrabold, fontSize: 20, color: colors.ink },
    phone: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: 2 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, marginTop: spacing.md },
    chipVerified: { backgroundColor: colors.successSoft },
    chipUnverified: { backgroundColor: colors.warningSoft },
    chipText: { fontFamily: font.semibold, fontSize: 12 },

    section: { fontFamily: font.semibold, fontSize: 13, color: colors.muted, paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.sm },
    card: { backgroundColor: colors.card, marginHorizontal: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md },
    rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.ink },
    rowRight: { marginLeft: 'auto' },
    divider: { height: 1, backgroundColor: colors.line, marginLeft: 56 },

    logout: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      height: 54, marginHorizontal: spacing.xl, marginTop: spacing.xl,
      borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line,
    },
    logoutText: { fontFamily: font.semibold, fontSize: 15, color: colors.inkSoft },
  });