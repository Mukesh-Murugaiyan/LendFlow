import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { DatePickerInput } from '@/components/DatePickerInput';
import { lendflowApi } from '@/services/api/lendflowApi';
import { offlineApi } from '@/services/offline/offlineApi';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { calculateNextDueDate, toISODateString } from '@/utils/date';
import { getFriendlyErrorMessage } from '@/utils/error';
import { calculateInterestAmount, formatCurrency } from '@/utils/financial';
import { CreateLoanFormData, createLoanSchema } from '@/validations/loan';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CreateLoanScreen() {
  const insets = useSafeAreaInsets();
  const { currentOrgId } = useAppStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    borrowerId?: string;
    borrowerName?: string;
    borrowerMobile?: string;
  }>();

  const [selectedBorrower, setSelectedBorrower] = useState<{
    id: string;
    full_name: string;
    mobile_number: string;
  } | null>(
    params.borrowerId
      ? {
        id: params.borrowerId,
        full_name: params.borrowerName || '',
        mobile_number: params.borrowerMobile || '',
      }
      : null
  );

  const [borrowerMode, setBorrowerMode] = useState<'EXISTING' | 'NEW'>(
    params.borrowerId ? 'EXISTING' : 'NEW'
  );

  const [borrowerSearch, setBorrowerSearch] = useState('');
  const [ignoredMatchMobile, setIgnoredMatchMobile] = useState<string | null>(null);

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
      existing_borrower_id: params.borrowerId || undefined,
      full_name: params.borrowerName || '',
      mobile_number: params.borrowerMobile || '',
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

  // Fetch existing borrowers for lookup & auto-suggestion
  const { data: existingBorrowers = [] } = useQuery({
    queryKey: ['borrowers_list', currentOrgId],
    queryFn: () => lendflowApi.getBorrowers(currentOrgId),
    enabled: !!currentOrgId,
  });

  // Sync route params if passed
  useEffect(() => {
    if (params.borrowerId) {
      const b = {
        id: params.borrowerId,
        full_name: params.borrowerName || '',
        mobile_number: params.borrowerMobile || '',
      };
      setSelectedBorrower(b);
      setBorrowerMode('EXISTING');
      setValue('existing_borrower_id', b.id);
      setValue('full_name', b.full_name);
      setValue('mobile_number', b.mobile_number);
    }
  }, [params.borrowerId, params.borrowerName, params.borrowerMobile, setValue]);

  const principal = watch('principal_amount');
  const rate = watch('interest_rate');
  const interval = watch('interest_interval_days');
  const startDate = watch('loan_start_date');
  const firstDueDate = watch('first_interest_due_date');
  const currentMobile = watch('mobile_number');

  // Real-time financial preview
  const previewInterest = calculateInterestAmount(Number(principal) || 0, Number(rate) || 0);

  const handleIntervalSelect = (days: number) => {
    setValue('interest_interval_days', days);
    if (startDate) {
      setValue('first_interest_due_date', calculateNextDueDate(startDate, days));
    }
  };

  const handleSelectBorrower = (b: { id: string; full_name: string; mobile_number: string }) => {
    setSelectedBorrower(b);
    setValue('existing_borrower_id', b.id);
    setValue('full_name', b.full_name);
    setValue('mobile_number', b.mobile_number);
    setIgnoredMatchMobile(null);
  };

  const handleClearBorrower = () => {
    setSelectedBorrower(null);
    setValue('existing_borrower_id', undefined);
    setValue('full_name', '');
    setValue('mobile_number', '');
  };

  // Smart Phone Number Matching check
  const cleanMobile = (currentMobile || '').replace(/\D/g, '');
  const matchedBorrower =
    !selectedBorrower &&
      cleanMobile.length === 10 &&
      cleanMobile !== ignoredMatchMobile
      ? existingBorrowers.find(
        (b) => (b.mobile_number || '').replace(/\D/g, '') === cleanMobile
      )
      : null;

  // Filter existing borrowers for picker
  const filteredBorrowers = existingBorrowers.filter((b) => {
    if (!borrowerSearch.trim()) return true;
    const query = borrowerSearch.toLowerCase();
    return (
      (b.full_name || '').toLowerCase().includes(query) ||
      (b.mobile_number || '').includes(query)
    );
  });

  const createLoanMutation = useMutation({
    networkMode: 'always',
    mutationFn: (data: CreateLoanFormData) =>
      offlineApi.createLoan(data, currentOrgId, user?.id),
    onSuccess: ({ loan: newLoan, isOffline }) => {
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });
      if (newLoan.borrower_id) {
        queryClient.invalidateQueries({ queryKey: ['borrower_details', newLoan.borrower_id] });
      }

      const title = isOffline ? 'Loan Saved Offline ⏳' : 'Loan Created Successfully';
      const msg = isOffline
        ? `Loan of ${formatCurrency(newLoan.principal_amount)} saved locally. It will automatically sync to the server once online.`
        : `Loan created with ${formatCurrency(newLoan.principal_amount)}. First due date set to ${newLoan.first_interest_due_date}. Scheduled database function will generate interest records automatically.`;

      Alert.alert(
        title,
        msg,
        [
          {
            text: isOffline ? 'OK' : 'View Loan',
            onPress: () => (isOffline ? router.back() : router.replace(`/loan/${newLoan.id}`)),
          },
        ]
      );
    },
    onError: (err: any) => {
      Alert.alert('Loan Creation Error', getFriendlyErrorMessage(err, 'Failed to create loan record.'));
    },
  });

  const onSubmit = (formData: CreateLoanFormData) => {
    // If a borrower is selected, ensure existing_borrower_id is attached
    if (selectedBorrower) {
      formData.existing_borrower_id = selectedBorrower.id;
      formData.full_name = selectedBorrower.full_name;
      formData.mobile_number = selectedBorrower.mobile_number;
    }
    createLoanMutation.mutate(formData);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
      >
        {/* Section 1: Borrower Information */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <Text style={styles.sectionTitle}>Borrower Profile</Text>
        </View>

        {/* Linked Borrower Card when Selected */}
        {selectedBorrower ? (
          <View style={styles.linkedBorrowerCard}>
            <View style={styles.linkedBorrowerTop}>
              <View style={styles.linkedBorrowerAvatar}>
                <Ionicons name="person" size={22} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.linkedNameRow}>
                  <Text style={styles.linkedBorrowerName}>{selectedBorrower.full_name}</Text>
                  <View style={styles.linkedBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#059669" />
                    <Text style={styles.linkedBadgeText}>Existing Borrower</Text>
                  </View>
                </View>
                <Text style={styles.linkedBorrowerMobile}>📱 {selectedBorrower.mobile_number}</Text>
              </View>
              {!params.borrowerId && (
                <TouchableOpacity
                  onPress={handleClearBorrower}
                  style={styles.changeBorrowerBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.changeBorrowerBtnText}>Change</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.linkedBorrowerNotice}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#047857" />
              <Text style={styles.linkedBorrowerNoticeText}>
                Loan will attach to this profile. KYC is already saved. No duplicate borrower created.
              </Text>
            </View>
          </View>
        ) : (
          <View>
            {/* Mode Toggle: Existing vs New */}
            <View style={styles.modeToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.modeToggleBtn,
                  borrowerMode === 'EXISTING' && styles.modeToggleBtnActive,
                ]}
                onPress={() => {
                  setBorrowerMode('EXISTING');
                  setIgnoredMatchMobile(null);
                }}
              >
                <Ionicons
                  name="people"
                  size={16}
                  color={borrowerMode === 'EXISTING' ? '#4F46E5' : '#64748B'}
                />
                <Text
                  style={[
                    styles.modeToggleText,
                    borrowerMode === 'EXISTING' && styles.modeToggleTextActive,
                  ]}
                >
                  Existing Borrower ({existingBorrowers.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeToggleBtn,
                  borrowerMode === 'NEW' && styles.modeToggleBtnActive,
                ]}
                onPress={() => {
                  setBorrowerMode('NEW');
                  setIgnoredMatchMobile(null);
                }}
              >
                <Ionicons
                  name="person-add"
                  size={16}
                  color={borrowerMode === 'NEW' ? '#4F46E5' : '#64748B'}
                />
                <Text
                  style={[
                    styles.modeToggleText,
                    borrowerMode === 'NEW' && styles.modeToggleTextActive,
                  ]}
                >
                  + New Borrower
                </Text>
              </TouchableOpacity>
            </View>

            {borrowerMode === 'EXISTING' ? (
              /* Existing Borrower Search & Picker */
              <View style={styles.card}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or mobile number..."
                    value={borrowerSearch}
                    onChangeText={setBorrowerSearch}
                    placeholderTextColor="#94A3B8"
                  />
                  {borrowerSearch ? (
                    <TouchableOpacity onPress={() => setBorrowerSearch('')}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {filteredBorrowers.length === 0 ? (
                  <View style={styles.emptyBorrowersBox}>
                    <Text style={styles.emptyBorrowersText}>
                      {borrowerSearch ? 'No matching borrower found.' : 'No existing borrowers found.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.switchToNewBtn}
                      onPress={() => setBorrowerMode('NEW')}
                    >
                      <Text style={styles.switchToNewBtnText}>+ Create New Borrower</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.borrowersPickerList}>
                    {filteredBorrowers.slice(0, 5).map((b) => (
                      <TouchableOpacity
                        key={b.id}
                        style={styles.borrowerPickerItem}
                        onPress={() => handleSelectBorrower(b)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.borrowerItemAvatar}>
                          <Text style={styles.borrowerItemAvatarText}>
                            {(b.full_name || 'B').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.borrowerItemName}>{b.full_name}</Text>
                          <Text style={styles.borrowerItemPhone}>📱 {b.mobile_number}</Text>
                        </View>
                        <View style={styles.selectBadgeBtn}>
                          <Text style={styles.selectBadgeBtnText}>Select</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {filteredBorrowers.length > 5 && (
                      <Text style={styles.moreBorrowersHint}>
                        Showing 5 of {filteredBorrowers.length} borrowers. Use search box above to filter.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ) : (
              /* New Borrower Manual Form */
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
                      maxLength={10}
                      value={value}
                      onChangeText={(val) => {
                        onChange(val);
                        // Reset ignored mobile if number changes
                        if (ignoredMatchMobile && val.replace(/\D/g, '') !== ignoredMatchMobile) {
                          setIgnoredMatchMobile(null);
                        }
                      }}
                    />
                  )}
                />
                {errors.mobile_number && (
                  <Text style={styles.errorText}>{errors.mobile_number.message}</Text>
                )}

                {/* Smart Match Detection Banner */}
                {matchedBorrower && (
                  <View style={styles.matchAlertCard}>
                    <View style={styles.matchAlertHeader}>
                      <Ionicons name="alert-circle" size={20} color="#D97706" />
                      <Text style={styles.matchAlertTitle}>Existing Borrower Detected!</Text>
                    </View>
                    <Text style={styles.matchAlertDesc}>
                      A borrower named <Text style={{ fontWeight: '700' }}>&quot;{matchedBorrower.full_name}&quot;</Text> is already registered with mobile <Text style={{ fontWeight: '700' }}>{matchedBorrower.mobile_number}</Text>.
                    </Text>
                    <View style={styles.matchAlertActions}>
                      <TouchableOpacity
                        style={styles.matchUseBtn}
                        onPress={() => handleSelectBorrower(matchedBorrower)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                        <Text style={styles.matchUseBtnText}>Use {matchedBorrower.full_name} (Link Loan)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.matchIgnoreBtn}
                        onPress={() => setIgnoredMatchMobile(cleanMobile)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.matchIgnoreBtnText}>Keep as New Person</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
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
            )}
          </View>
        )}

        {/* Section 2: Identity & Reference (Only shown if creating a brand new borrower) */}
        {!selectedBorrower && borrowerMode === 'NEW' && (
          <>
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
          </>
        )}

        {/* Section 3: Loan Terms & Interest Configuration */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNum}>{selectedBorrower ? '2' : '3'}</Text>
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

        {/* Section Review: Real-Time Review Box */}
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

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, { marginBottom: Math.max(insets.bottom, 16) }]}
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
  /* Linked Borrower Card */
  linkedBorrowerCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    marginBottom: 16,
  },
  linkedBorrowerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkedBorrowerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  linkedBorrowerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  linkedBorrowerMobile: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
  },
  changeBorrowerBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeBorrowerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  linkedBorrowerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  linkedBorrowerNoticeText: {
    fontSize: 11,
    color: '#065F46',
    flex: 1,
    lineHeight: 15,
  },
  /* Mode Toggle */
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
    gap: 6,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modeToggleTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  /* Existing Borrower Search & List */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  borrowersPickerList: {
    gap: 8,
  },
  borrowerPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  borrowerItemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowerItemAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4F46E5',
  },
  borrowerItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  borrowerItemPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  selectBadgeBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  selectBadgeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  moreBorrowersHint: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  emptyBorrowersBox: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  emptyBorrowersText: {
    fontSize: 13,
    color: '#64748B',
  },
  switchToNewBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  switchToNewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  /* Match Alert Banner */
  matchAlertCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginTop: 10,
    marginBottom: 6,
  },
  matchAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  matchAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  matchAlertDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    marginBottom: 10,
  },
  matchAlertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchUseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
  },
  matchUseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  matchIgnoreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  matchIgnoreBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  /* Financial Preview */
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
