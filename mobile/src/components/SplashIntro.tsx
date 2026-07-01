import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { font, gradients } from '../theme';

const SIZE = 60;

// One-shot intro: "PX" pops in, then "ay" unfurls from the P and "change"
// unfurls from the X to spell PayXchange, then the partner line fades up.
export default function SplashIntro({ onFinish }: { onFinish: () => void }) {
  // Native-driver values (transform / opacity)
  const root = useRef(new Animated.Value(1)).current;
  const pxScale = useRef(new Animated.Value(0.7)).current;
  const pxOpacity = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  // JS-driver values (animating width to clip the unfurling letters)
  const ayW = useRef(new Animated.Value(0)).current;
  const changeW = useRef(new Animated.Value(0)).current;

  // Measured natural widths of the two unfurling segments.
  const [ayWidth, setAyWidth] = useState(0);
  const [changeWidth, setChangeWidth] = useState(0);
  const ready = ayWidth > 0 && changeWidth > 0;

  useEffect(() => {
    if (!ready) return;
    Animated.sequence([
      // 1) PX logo pops in
      Animated.parallel([
        Animated.spring(pxScale, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
        Animated.timing(pxOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      Animated.delay(120),
      // 2) "ay" and "change" unfurl out of the P and X
      Animated.parallel([
        Animated.timing(ayW, {
          toValue: ayWidth,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(changeW, {
          toValue: changeWidth,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      // 3) partner line fades up
      Animated.timing(tagline, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(750),
      // 4) fade the whole intro away
      Animated.timing(root, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => onFinish());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ayWidth, changeWidth]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: root }]}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Hidden measuring copies to get natural widths */}
      <Text style={[styles.letter, styles.measure]} onLayout={(e) => setAyWidth(e.nativeEvent.layout.width)}>
        ay
      </Text>
      <Text style={[styles.letter, styles.measure]} onLayout={(e) => setChangeWidth(e.nativeEvent.layout.width)}>
        change
      </Text>

      <View style={styles.center}>
        <View style={styles.row}>
          <Animated.Text style={[styles.letter, { opacity: pxOpacity, transform: [{ scale: pxScale }] }]}>
            P
          </Animated.Text>
          <Animated.View style={[styles.clip, { width: ayW }]}>
            <Text style={[styles.letter, { width: ayWidth }]} numberOfLines={1}>
              ay
            </Text>
          </Animated.View>
          <Animated.Text style={[styles.letter, { opacity: pxOpacity, transform: [{ scale: pxScale }] }]}>
            X
          </Animated.Text>
          <Animated.View style={[styles.clip, { width: changeW }]}>
            <Text style={[styles.letter, { width: changeWidth }]} numberOfLines={1}>
              change
            </Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.tagWrap,
            {
              opacity: tagline,
              transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Ionicons name="shield-checkmark" size={15} color="rgba(255,255,255,0.92)" />
          <Text style={styles.tagline}>Official Nomba Partner</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, elevation: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  letter: {
    fontFamily: font.extrabold,
    fontSize: SIZE,
    lineHeight: SIZE * 1.22,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  clip: { overflow: 'hidden' },
  measure: { position: 'absolute', opacity: 0, top: -9999, left: -9999 },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tagline: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.2,
  },
});