import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import LockScreen from '../screens/LockScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OtpScreen from '../screens/OtpScreen';
import SetPinScreen from '../screens/SetPinScreen';
import TabsNavigator from './TabsNavigator';
import ReceiveAmountScreen from '../screens/ReceiveAmountScreen';
import ReceiveQRScreen from '../screens/ReceiveQRScreen';
import ScanScreen from '../screens/ScanScreen';
import PayConfirmScreen from '../screens/PayConfirmScreen';
import PayPinScreen from '../screens/PayPinScreen';
import PaySuccessScreen from '../screens/PaySuccessScreen';
import ChangePinScreen from '../screens/ChangePinScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import { Txn } from '../components/TransactionRow';
import { useTheme } from '../theme/ThemeContext';

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Otp: { phone: string };
  SetPin: { setupToken: string };
  Tabs: undefined;
  Home: undefined;
  Activity: undefined;
  Profile: undefined;
  ReceiveAmount: undefined;
  ReceiveQR: { qrImage: string; amountKobo: number; description: string; expiresAt: string };
  Scan: undefined;
  PayConfirm: { token: string };
  PayPin: { transactionId: string; amountKobo: number; payeeName: string };
  PaySuccess: { amountKobo: number; payeeName: string };
  ChangePin: undefined;
  DeleteAccount: undefined;
  TransactionDetail: { txn: Txn };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isReady, isAuthed, locked } = useAuth();
  const { colors } = useTheme();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isAuthed && locked) {
    return <LockScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthed ? (
        <>
          <Stack.Screen name="Tabs" component={TabsNavigator} />
          <Stack.Screen name="ReceiveAmount" component={ReceiveAmountScreen} />
          <Stack.Screen name="ReceiveQR" component={ReceiveQRScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} />
          <Stack.Screen name="PayConfirm" component={PayConfirmScreen} />
          <Stack.Screen name="PayPin" component={PayPinScreen} />
          <Stack.Screen name="PaySuccess" component={PaySuccessScreen} />
          <Stack.Screen name="ChangePin" component={ChangePinScreen} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Otp" component={OtpScreen} />
          <Stack.Screen name="SetPin" component={SetPinScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}