import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { getAvatar } from '@/src/lib/avatars';

type Props = {
  id?: string | null;
  size?: number;
  radius?: number;
};

export default function Avatar({ id, size = 56, radius }: Props) {
  const a = getAvatar(id);
  const r = radius ?? size / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: r }]}>
      <Image source={a.image} style={{ width: size, height: size }} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
