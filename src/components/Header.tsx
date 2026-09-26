import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { syncEngine } from '@/services/offline/syncEngine';

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
}

export function Header({ title, subtitle, rightAction }: HeaderProps) {
  const { isOnline, lastSyncedAt, pendingSyncCount, isSyncing } = useAppStore();

  const handleManualSync = () => {
    if (!isSyncing && isOnline) {
      syncEngine.sync();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleArea}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.syncRow}>
          <View style={[styles.dot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.syncText}>
            {isOnline ? 'Online' : 'Offline'} • Synced {lastSyncedAt}
          </Text>

          {pendingSyncCount > 0 && (
            <TouchableOpacity
              style={styles.pendingBadge}
              onPress={handleManualSync}
              disabled={isSyncing || !isOnline}
              activeOpacity={0.7}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#D97706" style={{ transform: [{ scale: 0.6 }] }} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={12} color="#D97706" />
              )}
              <Text style={styles.pendingText}>
                {isSyncing ? 'Syncing...' : `${pendingSyncCount} pending`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.actionsRow}>
        {isOnline && pendingSyncCount > 0 && !isSyncing && (
          <TouchableOpacity
            style={styles.syncIconButton}
            onPress={handleManualSync}
            activeOpacity={0.7}
          >
            <Ionicons name="sync-outline" size={18} color="#D97706" />
          </TouchableOpacity>
        )}

        {rightAction && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={rightAction.onPress}
            activeOpacity={0.7}
          >
            <Ionicons name={rightAction.icon} size={22} color="#4F46E5" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
    flexWrap: 'wrap',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
