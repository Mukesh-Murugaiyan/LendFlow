import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { createLoanSchema, CreateLoanFormData } from '@/validations/loan';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { calculateInterestAmount, formatCurrency } from '@/utils/financial';
import { toISODateString, calculateNextDueDate } from '@/utils/date';
import { DatePickerInput } from '@/components/DatePickerInput';

export default function CreateLoanScreen() {
  const { currentOrgId } = useAppStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const todayStr = toISODateString();
  const defaultFirstDue = calculateNextDueDate(todayStr, 30);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateLoanFormData>({
    resolver: zodResolver(createLoanSchema),
    defaultValues: {
      full_name: '',
      mobile_number: '',
      alternate_mobile_number: '',
      address: '',
      city: '',
      state: 'Tamil Nadu',
      pincode: '',
      government_id: '',
      occupation: '',
      reference_name: '',
      reference_mobile: '',
      borrower_notes: '',

      principal_amount: 10000,
      interest_rate: 5,
      interest_type: 'SIMPLE',
      interest_interval_days: 30,
      loan_start_date: todayStr,
      first_interest_due_date: defaultFirstDue,
      loan_notes: '',
    },
  });

  const principal = watch('principal_amount');
  const rate = watch('interest_rate');
  const interval = watch('interest_interval_days');
  const startDate = watch('loan_start_date');
  const firstDueDate = watch('first_interest_due_date');

  // Real-time financial preview
  const previewInterest = calculateInterestAmount(Number(principal) || 0, Number(rate) || 0);

  const handleIntervalSelect = (days: number) => {
    setValue('interest_interval_days', days);
    if (startDate) {
      setValue('first_interest_due_date', calculateNextDueDate(startDate, days));
    }
  };

  const createLoanMutation = useMutation({
    mutationFn: (data: CreateLoanFormData) =>
      lendflowApi.createLoan(data, currentOrgId, user?.id),
    onSuccess: (newLoan) => {
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });
      Alert.alert(
        'Loan Created Successfully',
        `Loan created with ₹${formatCurrency(newLoan.principal_amount)}. First due date set to ${newLoan.first_interest_due_date}. Scheduled database function will generate interest records automatically.`,
        [
          {
            text: 'View Loan',
            onPress: () => router.replace(`/loan/${newLoan.id}`),
          },
        ]
      );
    },
    onError: (err: any) => {
      Alert.alert('Loan Creation Error', err.message || 'Failed to create loan record');
    },
  });

  const onSubmit = (formData: CreateLoanFormData) => {
    createLoanMutation.mutate(formData);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Section 1: Borrower Information */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <Text style={styles.sectionTitle}>Borrower Information</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Full Name *</Text>
          <Controller
            control={control}
            name="full_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.full_name && styles.inputError]}
                placeholder="e.g. Arun Kumar"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.full_name && (
            <Text style={styles.errorText}>{errors.full_name.message}</Text>
          )}

          <Text style={styles.fieldLabel}>Mobile Number (10 Digits) *</Text>
          <Controller
            control={control}
            name="mobile_number"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.mobile_number && styles.inputError]}
                placeholder="e.g. 9840123456"
                keyboardType="phone-pad"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.mobile_number && (
            <Text style={styles.errorText}>{errors.mobile_number.message}</Text>
          )}

          <Text style={styles.fieldLabel}>Alternate Mobile Number</Text>
          <Controller
            control={control}
            name="alternate_mobile_number"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Optional secondary phone"
                keyboardType="phone-pad"
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>City</Text>
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Chennai"
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Pincode</Text>
              <Controller
                control={control}
                name="pincode"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="600017"
                    keyboardType="numeric"
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Full Address</Text>
          <Controller
            control={control}
            name="address"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Street name, landmark..."
                multiline
                numberOfLines={2}
                value={value}
                onChangeText={onChange}
              />
            )}
          />
        </View>

        {/* Section 2: Identity & Reference */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>2</Text>
          </View>
          <Text style={styles.sectionTitle}>Identity & References</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Aadhaar / Government ID Reference</Text>
          <Controller
            control={control}
            name="government_id"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="e.g. 1234 5678 4321 (Masked automatically)"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          <Text style={styles.helpText}>
            Full Aadhaar is not stored in plaintext. Only masked (XXXX-XXXX-4321) and last 4 digits are retained.
          </Text>

          <Text style={styles.fieldLabel}>Occupation / Business</Text>
          <Controller
            control={control}
            name="occupation"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="e.g. Grocery Store Owner"
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Reference Name</Text>
              <Controller
                control={control}
                name="reference_name"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="Reference person"
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Reference Mobile</Text>
              <Controller
                control={control}
                name="reference_mobile"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="Mobile number"
                    keyboardType="phone-pad"
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
            </View>
          </View>
        </View>

        {/* Section 3 & 4: Loan Terms & Interest Configuration */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>3</Text>
          </View>
          <Text style={styles.sectionTitle}>Loan & Interest Configuration</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Principal Amount (₹) *</Text>
          <Controller
            control={control}
            name="principal_amount"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.inputHighlight, errors.principal_amount && styles.inputError]}
                placeholder="10000"
                keyboardType="numeric"
                value={value ? String(value) : ''}
                onChangeText={(text) => onChange(Number(text) || 0)}
              />
            )}
          />
          {errors.principal_amount && (
            <Text style={styles.errorText}>{errors.principal_amount.message}</Text>
          )}

          <Text style={styles.fieldLabel}>Interest Rate (% per period) *</Text>
          <Controller
            control={control}
            name="interest_rate"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.inputHighlight, errors.interest_rate && styles.inputError]}
                placeholder="5"
                keyboardType="numeric"
                value={value !== undefined ? String(value) : ''}
                onChangeText={(text) => onChange(Number(text) || 0)}
              />
            )}
          />
          {errors.interest_rate && (
            <Text style={styles.errorText}>{errors.interest_rate.message}</Text>
          )}

          <Text style={styles.fieldLabel}>Interest Frequency / Interval</Text>
          <View style={styles.intervalRow}>
            {[15, 30, 45, 50].map((days) => {
              const isSelected = interval === days;
              return (
                <TouchableOpacity
                  key={days}
                  style={[styles.intervalBtn, isSelected && styles.intervalBtnActive]}
                  onPress={() => handleIntervalSelect(days)}
                >
                  <Text style={[styles.intervalBtnText, isSelected && styles.intervalBtnTextActive]}>
                    {days} Days
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Custom Days</Text>
              <Controller
                control={control}
                name="interest_interval_days"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="30"
                    keyboardType="numeric"
                    value={value ? String(value) : ''}
                    onChangeText={(val) => {
                      onChange(val);
                      if (startDate && Number(val) > 0) {
                        setValue('first_interest_due_date', calculateNextDueDate(startDate, Number(val)));
                      }
                    }}
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Loan Start Date</Text>
              <Controller
                control={control}
                name="loan_start_date"
                render={({ field: { onChange, value } }) => (
                  <DatePickerInput
                    label="Loan Start Date"
                    value={value}
                    onChange={(val) => {
                      onChange(val);
                      if (val && Number(interval) > 0) {
                        setValue('first_interest_due_date', calculateNextDueDate(val, Number(interval)));
                      }
                    }}
                    error={!!errors.loan_start_date}
                  />
                )}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>First Interest Due Date *</Text>
          <Controller
            control={control}
            name="first_interest_due_date"
            render={({ field: { onChange, value } }) => (
              <DatePickerInput
                label="First Interest Due Date"
                value={value}
                onChange={onChange}
                error={!!errors.first_interest_due_date}
              />
            )}
          />
        </View>

        {/* Section 5: Real-Time Review Box */}
        <View style={styles.previewBox}>
          <View style={styles.previewHeader}>
            <Ionicons name="calculator-outline" size={20} color="#4F46E5" />
            <Text style={styles.previewTitle}>Live Financial Preview</Text>
          </View>

          <View style={styles.previewGrid}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Principal:</Text>
              <Text style={styles.previewValue}>{formatCurrency(Number(principal) || 0)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Configured Rate:</Text>
              <Text style={styles.previewValue}>{rate || 0}% per {interval || 30} days</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Calculated Period Interest:</Text>
              <Text style={[styles.previewValue, { color: '#10B981', fontWeight: '800' }]}>
                {formatCurrency(previewInterest)}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>First Due Date:</Text>
              <Text style={styles.previewValue}>{firstDueDate || '-'}</Text>
            </View>
          </View>

          <Text style={styles.previewDisclaimer}>
            Note: Database automation will generate due records automatically on due dates. The frontend will not create future due records prematurely.
          </Text>
        </View>

        {/* Section 6: Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit(onSubmit)}
          activeOpacity={0.8}
          disabled={createLoanMutation.isPending}
        >
          <Text style={styles.submitButtonText}>
            {createLoanMutation.isPending ? 'Creating Loan...' : 'Create Loan'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  inputHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    height: 60,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  intervalBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  intervalBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  intervalBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  intervalBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  helpText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 15,
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 3,
  },
  previewBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  previewGrid: {
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    color: '#475569',
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewDisclaimer: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 8,
    lineHeight: 15,
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
