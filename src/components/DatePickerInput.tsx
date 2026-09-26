import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns';
import { formatDisplayDate } from '@/utils/date';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DatePickerInputProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  error?: boolean;
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = 'Select Date',
  label,
  error,
}: DatePickerInputProps) {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);

  // Initialize view date based on current value or today
  const initialDate = value ? parseISO(value) : new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(initialDate);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date>(initialDate);

  const openPicker = () => {
    const d = value ? parseISO(value) : new Date();
    setCurrentMonth(d);
    setTempSelectedDate(d);
    setModalVisible(true);
  };

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const handleSelectDay = (day: Date) => {
    setTempSelectedDate(day);
  };

  const handleConfirm = () => {
    const isoString = format(tempSelectedDate, 'yyyy-MM-dd');
    onChange(isoString);
    setModalVisible(false);
  };

  const handleQuickPreset = (daysToAdd: number) => {
    const target = addDays(new Date(), daysToAdd);
    setTempSelectedDate(target);
    setCurrentMonth(target);
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart); // 0 (Sun) to 6 (Sat)

  const weekDayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <>
      <TouchableOpacity
        style={[styles.inputContainer, error && styles.inputError]}
        onPress={openPicker}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color="#4F46E5" style={styles.inputIcon} />
        <View style={styles.textWrapper}>
          <Text style={[styles.mainDateText, !value && styles.placeholderText]}>
            {value ? formatDisplayDate(value) : placeholder}
          </Text>
          {value ? <Text style={styles.isoSubText}>{value}</Text> : null}
        </View>
        <Ionicons name="chevron-down" size={16} color="#94A3B8" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{label || 'Select Date'}</Text>
                <Text style={styles.modalSelectedPreview}>
                  {formatDisplayDate(format(tempSelectedDate, 'yyyy-MM-dd'))}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigator */}
            <View style={styles.monthNavRow}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={styles.navArrowBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={20} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.monthYearText}>
                {format(currentMonth, 'MMMM yyyy')}
              </Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={styles.navArrowBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-forward" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => handleQuickPreset(0)}
              >
                <Text style={styles.presetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => handleQuickPreset(15)}
              >
                <Text style={styles.presetChipText}>+15 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => handleQuickPreset(30)}
              >
                <Text style={styles.presetChipText}>+30 Days</Text>
              </TouchableOpacity>
            </View>

            {/* Day of Week Headers */}
            <View style={styles.weekDaysRow}>
              {weekDayLabels.map((wd, index) => (
                <Text key={index} style={styles.weekDayText}>
                  {wd}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.calendarGrid}>
              {/* Empty leading padding slots */}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.dayCell} />
              ))}

              {/* Month Days */}
              {daysInMonth.map((day) => {
                const isSelected = isSameDay(day, tempSelectedDate);
                const isTodayDate = isToday(day);

                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                      isTodayDate && !isSelected && styles.dayCellToday,
                    ]}
                    onPress={() => handleSelectDay(day)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.dayTextSelected,
                        isTodayDate && !isSelected && styles.dayTextToday,
                      ]}
                    >
                      {format(day, 'd')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmBtnText}>Confirm Date</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  inputIcon: {
    marginRight: 10,
  },
  textWrapper: {
    flex: 1,
  },
  mainDateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  placeholderText: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  isoSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalSelectedPreview: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: '#4F46E5',
    borderRadius: 19,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#4F46E5',
    borderRadius: 19,
  },
  dayText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1.5,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#4F46E5',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
