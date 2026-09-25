import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { EmptyState } from '@/components/EmptyState';
import { AuditLog } from '@/types/database';
import { formatCurrency } from '@/utils/financial';
import { formatDisplayDate } from '@/utils/date';

export default function AuditLogsScreen() {
  const { currentOrgId } = useAppStore();
  const [expandedRawIds, setExpandedRawIds] = useState<Record<string, boolean>>({});

  const {
    data: logs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['audit_logs', currentOrgId],
    queryFn: () => lendflowApi.getAuditLogs(currentOrgId),
  });

  const toggleRaw = (id: string) => {
    setExpandedRawIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'INTEREST_MARKED_PAID':
        return {
          title: 'Interest Marked Paid',
          color: '#10B981',
          icon: 'checkmark-circle' as const,
        };
      case 'INTEREST_PAYMENT_REVERSED':
        return {
          title: 'Payment Reversed',
          color: '#EF4444',
          icon: 'arrow-undo' as const,
        };
      case 'INTEREST_DUE_GENERATED':
        return {
          title: 'Interest Due Generated',
          color: '#4F46E5',
          icon: 'calendar-outline' as const,
        };
      case 'LOAN_CLOSED':
        return {
          title: 'Loan Fully Settled',
          color: '#0F172A',
          icon: 'checkmark-done-circle' as const,
        };
      case 'LOAN_REOPENED':
        return {
          title: 'Loan Reopened',
          color: '#3B82F6',
          icon: 'refresh-circle' as const,
        };
      default:
        return {
          title: action.replace(/_/g, ' '),
          color: '#64748B',
          icon: 'shield-outline' as const,
        };
    }
  };

  const formatEntityType = (type: string) => {
    switch (type) {
      case 'interest_due':
        return 'Interest Due Record';
      case 'loan':
        return 'Loan Account';
      case 'borrower':
        return 'Borrower Profile';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const datePart = formatDisplayDate(dateStr);
      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${datePart}, ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  const renderCleanChangeDetails = (data: Record<string, any>) => {
    const items: { label: string; value: string; isHighlight?: boolean; isNote?: boolean }[] = [];

    // Amount fields
    if (data.paid_amount !== undefined && data.paid_amount !== null) {
      items.push({ label: 'Paid Amount', value: formatCurrency(data.paid_amount), isHighlight: true });
    }
    if (data.interest_amount !== undefined && data.interest_amount !== null) {
      items.push({ label: 'Interest Amount', value: formatCurrency(data.interest_amount), isHighlight: true });
    }

    // Status fields
    if (data.status !== undefined && data.status !== null) {
      items.push({ label: 'Status', value: String(data.status) });
    }
    if (data.loan_status !== undefined && data.loan_status !== null) {
      items.push({ label: 'Loan Status', value: String(data.loan_status) });
    }
    if (data.principal_status !== undefined && data.principal_status !== null) {
      items.push({ label: 'Principal Status', value: String(data.principal_status).replace(/_/g, ' ') });
    }

    // Due period / dates
    if (data.due_number !== undefined && data.due_number !== null) {
      items.push({ label: 'Due Period', value: `Period #${data.due_number}` });
    }
    if (data.due_date) {
      items.push({ label: 'Due Date', value: formatDisplayDate(data.due_date) });
    }
    if (data.paid_at) {
      items.push({ label: 'Paid At', value: formatDisplayDate(data.paid_at) });
    }

    // Notes & reasons
    if (data.payment_note) {
      items.push({ label: 'Payment Note', value: String(data.payment_note), isNote: true });
    }
    if (data.closure_note) {
      items.push({ label: 'Closure Note', value: String(data.closure_note), isNote: true });
    }
    if (data.reopen_note) {
      items.push({ label: 'Reopen Note', value: String(data.reopen_note), isNote: true });
    }
    if (data.reversal_reason) {
      items.push({ label: 'Reversal Reason', value: String(data.reversal_reason), isNote: true });
    }

    // Other keys not handled above
    const handledKeys = new Set([
      'paid_amount',
      'interest_amount',
      'status',
      'loan_status',
      'principal_status',
      'due_number',
      'due_date',
      'paid_at',
      'payment_note',
      'closure_note',
      'reopen_note',
      'reversal_reason',
    ]);

    Object.keys(data).forEach((key) => {
      if (!handledKeys.has(key) && data[key] !== null && data[key] !== undefined) {
        const val = typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key]);
        items.push({ label: key.replace(/_/g, ' '), value: val });
      }
    });

    if (items.length === 0) return null;

    return (
      <View style={styles.changeDetailsList}>
        <View style={styles.changeGrid}>
          {items
            .filter((i) => !i.isNote)
            .map((item, idx) => (
              <View key={idx} style={styles.changeItem}>
                <Text style={styles.changeLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.changeValue,
                    item.isHighlight && styles.changeValueHighlight,
                  ]}
                >
                  {item.value}
                </Text>
              </View>
            ))}
        </View>

        {items
          .filter((i) => i.isNote)
          .map((note, idx) => (
            <View key={idx} style={styles.noteBox}>
              <Text style={styles.noteLabel}>{note.label}:</Text>
              <Text style={styles.noteValue}>{`"${note.value}"`}</Text>
            </View>
          ))}
      </View>
    );
  };

  const renderLogItem = ({ item }: { item: AuditLog }) => {
    const config = getActionConfig(item.action);
    const isRawExpanded = !!expandedRawIds[item.id];

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <View style={[styles.badge, { backgroundColor: `${config.color}15` }]}>
            <Ionicons name={config.icon} size={14} color={config.color} style={{ marginRight: 6 }} />
            <Text style={[styles.badgeText, { color: config.color }]}>{config.title}</Text>
          </View>
          <Text style={styles.timeText}>{formatTimestamp(item.created_at)}</Text>
        </View>

        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Target:</Text>
          <Text style={styles.targetEntity}>{formatEntityType(item.entity_type)}</Text>
          <Text style={styles.targetId}>#{item.entity_id.slice(0, 8)}</Text>
        </View>

        {item.new_data ? (
          <View style={styles.changeDetailsWrapper}>
            <Text style={styles.sectionHeading}>Updated Details</Text>
            {renderCleanChangeDetails(item.new_data)}

            <TouchableOpacity
              style={styles.rawToggleRow}
              onPress={() => toggleRaw(item.id)}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.rawToggleText}>
                {isRawExpanded ? 'Hide Raw JSON' : 'View Raw JSON'}
              </Text>
              <Ionicons
                name={isRawExpanded ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="#64748B"
              />
            </TouchableOpacity>

            {isRawExpanded && (
              <View style={styles.rawBox}>
                <Text style={styles.rawJsonText}>
                  {JSON.stringify(item.new_data, null, 2)}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="shield-checkmark-outline"
              title="Audit Log Clean"
              description="Actions performed like loan creations, closures, payments, and reversals will appear here."
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  targetEntity: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  targetId: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  changeDetailsWrapper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  changeDetailsList: {
    gap: 8,
  },
  changeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  changeItem: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  changeLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  changeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  changeValueHighlight: {
    color: '#4F46E5',
    fontSize: 14,
  },
  noteBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noteLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  noteValue: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 2,
  },
  rawToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  rawToggleText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  rawBox: {
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  rawJsonText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#E2E8F0',
    lineHeight: 14,
  },
});
