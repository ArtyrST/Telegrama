import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AuthScreen } from '../components/auth/AuthScreen';
import { HomeScreen } from '../components/home/HomeScreen';
import { colors } from '../theme/colors';

export default function IndexScreen() {
  const { isReady, token } = useAuth();
  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }
  return token ? <HomeScreen /> : <AuthScreen />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
