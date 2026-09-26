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
import { useQueryClient } from '@tanstack/react-query';

import { borrowerSchema, BorrowerFormData } from '@/validations/loan';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { offlineApi } from '@/services/offline/offlineApi';
import { getFriendlyErrorMessage } from '@/utils/error';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CreateBorrowerScreen() {
  const insets = useSafeAreaInsets();
  const { currentOrgId } = useAppStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BorrowerFormData>({
    resolver: zodResolver(borrowerSchema),
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
      notes: '',
    },
  });

  const onSubmit = async (data: BorrowerFormData) => {
    try {
      const { isOffline } = await offlineApi.createBorrower(data, currentOrgId, user?.id);
      queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });

      const title = isOffline ? 'Saved Offline ⏳' : 'Borrower Created';
      const msg = isOffline
        ? `${data.full_name} has been saved locally. It will automatically sync to the server once online.`
        : `${data.full_name} has been added successfully.`;

      Alert.alert(title, msg, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', getFriendlyErrorMessage(err, 'Failed to save borrower.'));
    }
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
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Full Name *</Text>
          <Controller
            control={control}
            name="full_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.full_name && styles.inputError]}
                placeholder="Full Name"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.full_name && <Text style={styles.errorText}>{errors.full_name.message}</Text>}

          <Text style={styles.fieldLabel}>Mobile Number *</Text>
          <Controller
            control={control}
            name="mobile_number"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.mobile_number && styles.inputError]}
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.mobile_number && (
            <Text style={styles.errorText}>{errors.mobile_number.message}</Text>
          )}

          <Text style={styles.fieldLabel}>Alternate Mobile</Text>
          <Controller
            control={control}
            name="alternate_mobile_number"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Secondary phone (optional)"
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
                    placeholder="City"
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
                    placeholder="Pincode"
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
                placeholder="Residential address..."
                multiline
                numberOfLines={2}
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <Text style={styles.fieldLabel}>Government ID / Aadhaar</Text>
          <Controller
            control={control}
            name="government_id"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 (Will be masked)"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <Text style={styles.fieldLabel}>Occupation</Text>
          <Controller
            control={control}
            name="occupation"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="e.g. Shop Owner, Trader"
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Reference Person</Text>
              <Controller
                control={control}
                name="reference_name"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="Name"
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
                    placeholder="Phone"
                    keyboardType="phone-pad"
                    value={value}
                    onChangeText={onChange}
                  />
                )}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Internal Notes</Text>
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any special remarks or background notes"
                multiline
                numberOfLines={2}
                value={value}
                onChangeText={onChange}
              />
            )}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { marginBottom: Math.max(insets.bottom, 16) }]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>
            {isSubmitting ? 'Saving...' : 'Save Borrower Profile'}
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
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
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 3,
  },
  submitBtn: {
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
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
