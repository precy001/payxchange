import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { AuthProvider } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { attachNotificationTapHandler } from './src/lib/push';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import SplashIntro from './src/components/SplashIntro';
import { colors } from './src/theme';

function ThemedApp() {
  const { colors: c, isDark } = useTheme();

  React.useEffect(() => {
    attachNotificationTapHandler();
  }, []);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: c.bgSoft,
      card: c.card,
      text: c.ink,
      border: c.line,
      primary: c.primary,
    },
  };

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [introDone, setIntroDone] = useState(false);
  // The animated intro is a first-run welcome — show it once, ever. On every
  // launch after that we skip straight to the app (Home if logged in, Login if
  // not). 'undefined' = still checking, so we don't flash the intro then hide it.
  const [showIntro, setShowIntro] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    SecureStore.getItemAsync('px_intro_seen')
      .then((seen) => setShowIntro(!seen))
      .catch(() => setShowIntro(false)); // if storage fails, don't block the app
  }, []);

  const finishIntro = () => {
    setIntroDone(true);
    SecureStore.setItemAsync('px_intro_seen', '1').catch(() => undefined);
  };

  if (!fontsLoaded || showIntro === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <View style={{ flex: 1 }}>
        <ThemedApp />
        {showIntro && !introDone && <SplashIntro onFinish={finishIntro} />}
      </View>
    </ThemeProvider>
  );
}