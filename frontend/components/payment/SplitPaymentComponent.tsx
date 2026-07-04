import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/Fonts";
import { Theme } from "../../constants/theme";
import UPIPaymentModal from "./UPIPaymentModal";
import PayNowPaymentModal from "./PayNowPaymentModal";

const formatMoney = (symbol: string, amount: number) => {
  try {
    return `${symbol}${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch (e) {
    return `${symbol}${(amount || 0).toFixed(2)}`;
  }
};

export type SplitPaymentRow = {
  id: string;
  payModeId: number;
  payMode: string;
  amount: string;
  referenceNo: string;
  status: "Paid" | "Pending";
};

type PaymentMethodType = {
  payMode: string;
  description: string;
  position: number;
};

interface SplitPaymentComponentProps {
  targetTotal: number;
  paymentMethods: PaymentMethodType[];
  onComplete: (payments: Array<{ payModeId: number; payMode: string; amount: number; referenceNo?: string }>) => void;
  onCancel: () => void;
  processing: boolean;
  memberFlow?: boolean;
  currencySymbol?: string;
  selectedMember?: any;
  onSelectMember?: (payMode?: string) => void;
}

const isQRMode = (modeName: string): boolean => {
  const m = modeName.toUpperCase().trim();
  return m.includes("PAYNOW") || m.includes("PAY-NOW") || m.includes("UPI") || m.includes("GPAY") || m.includes("PHONE") || m.includes("PAYTM");
};

const isPayNowMode = (modeName: string): boolean => {
  const m = modeName.toUpperCase().trim();
  return m.includes("PAYNOW") || m.includes("PAY-NOW");
};

const isUpiMode = (modeName: string): boolean => {
  const m = modeName.toUpperCase().trim();
  return m.includes("UPI") || m.includes("GPAY") || m.includes("PHONE") || m.includes("PAYTM");
};

export default function SplitPaymentComponent({
  targetTotal,
  paymentMethods,
  onComplete,
  onCancel,
  processing,
  memberFlow = false,
  currencySymbol = "$",
  selectedMember = null,
  onSelectMember,
}: SplitPaymentComponentProps) {
  const [rows, setRows] = useState<SplitPaymentRow[]>([]);
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);

  // Digital verification modal states
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrModalType, setQrModalType] = useState<"PAYNOW" | "UPI" | null>(null);
  const [qrModalAmount, setQrModalAmount] = useState(0);
  const [activeQrRowId, setActiveQrRowId] = useState<string | null>(null);

  // Filter payment methods: for member collections, we shouldn't allow paying with MEMBER credit
  const availableMethods = useMemo(() => {
    if (memberFlow) {
      return paymentMethods.filter(
        (m) => m.payMode.toUpperCase().trim() !== "MEMBER" && m.payMode.toUpperCase().trim() !== "CREDIT"
      );
    }
    return paymentMethods;
  }, [paymentMethods, memberFlow]);

  // Sum of all payment rows
  const totalPaid = useMemo(() => {
    return rows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  }, [rows]);

  // Remaining balance
  const remainingBalance = useMemo(() => {
    return Math.max(0, targetTotal - totalPaid);
  }, [targetTotal, totalPaid]);

  // Initial rows: default to 2 payment rows
  useEffect(() => {
    if (availableMethods.length > 0 && rows.length === 0) {
      const firstMode = availableMethods[0];
      const secondMode = availableMethods.length > 1 ? availableMethods[1] : availableMethods[0];
      
      const firstStatus = isQRMode(firstMode.payMode) ? "Pending" : "Paid";
      const secondStatus = isQRMode(secondMode.payMode) ? "Pending" : "Paid";
      
      setRows([
        {
          id: Math.random().toString(36).substring(7),
          payModeId: firstMode.position,
          payMode: firstMode.payMode,
          amount: targetTotal.toFixed(2),
          referenceNo: "",
          status: firstStatus,
        },
        {
          id: Math.random().toString(36).substring(7),
          payModeId: secondMode.position,
          payMode: secondMode.payMode,
          amount: "0.00",
          referenceNo: "",
          status: secondStatus,
        },
      ]);
    }
  }, [availableMethods, targetTotal]);

  // Check if a row is locked (a verified paid digital row)
  const isRowLocked = (row: SplitPaymentRow) => {
    return isQRMode(row.payMode) && row.status === "Paid";
  };

  // Adjust payment rows when targetTotal changes (due to rounding changes)
  useEffect(() => {
    if (rows.length === 0) return;

    const sumPaid = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const diff = targetTotal - sumPaid;
    if (Math.abs(diff) < 0.005) return;

    const editableRows = rows.filter(r => !isRowLocked(r));
    if (editableRows.length > 0) {
      const lastEditable = editableRows[editableRows.length - 1];
      setRows(prevRows =>
        prevRows.map(r => {
          if (r.id === lastEditable.id) {
            const currentAmt = parseFloat(r.amount) || 0;
            const newAmt = Math.max(0, currentAmt + diff);
            return { ...r, amount: newAmt.toFixed(2) };
          }
          return r;
        })
      );
    }
  }, [targetTotal]);

  // Get available payment methods for a specific row
  const getAvailableMethodsForRow = (rowId: string) => {
    return availableMethods;
  };

  // Check validations programmatically
  const validationError = useMemo((): string | null => {
    const sumDiff = Math.abs(totalPaid - targetTotal);
    if (sumDiff > 0.01) {
      return `Total paid (${currencySymbol}${totalPaid.toFixed(2)}) must match target (${currencySymbol}${targetTotal.toFixed(2)})`;
    }

    const totalMemberAmt = rows.reduce((sum, r) => {
      const isMemberMode = r.payMode.toUpperCase().trim() === "MEMBER" || r.payMode.toUpperCase().trim() === "CREDIT";
      return sum + (isMemberMode ? (parseFloat(r.amount) || 0) : 0);
    }, 0);

    for (const r of rows) {
      const amt = parseFloat(r.amount);
      if (isNaN(amt) || amt <= 0) {
        return "Please enter a valid amount greater than zero in all rows.";
      }
      if (!r.payMode) {
        return "Please select a payment mode in all rows.";
      }

      // Member credit validation
      const isMemberMode = r.payMode.toUpperCase().trim() === "MEMBER" || r.payMode.toUpperCase().trim() === "CREDIT";
      if (isMemberMode && !memberFlow) {
        if (!selectedMember) {
          return "Please select a member first to use Member Credit.";
        }
        const availLimit = (selectedMember.CreditLimit || 0) - (selectedMember.CurrentBalance || 0);
        if (totalMemberAmt > availLimit) {
          return `Total member payment (${formatMoney(currencySymbol, totalMemberAmt)}) exceeds available credit limit (${formatMoney(currencySymbol, availLimit)}).`;
        }
      }
    }

    return null;
  }, [rows, totalPaid, targetTotal, selectedMember, memberFlow, currencySymbol]);

  const isValid = useMemo(() => {
    return validationError === null;
  }, [validationError]);

  const handleAddRow = () => {
    if (remainingBalance <= 0) {
      Alert.alert("Fully Paid", "Remaining balance is already zero.");
      return;
    }

    // Find first unused paymode
    const unusedMethods = availableMethods.filter(m => !rows.some(r => r.payModeId === m.position));
    const nextMode = unusedMethods.length > 0 ? unusedMethods[0] : availableMethods[0];
    if (!nextMode) return;

    const initialStatus = isQRMode(nextMode.payMode) ? "Pending" : "Paid";

    setRows([
      ...rows,
      {
        id: Math.random().toString(36).substring(7),
        payModeId: nextMode.position,
        payMode: nextMode.payMode,
        amount: remainingBalance.toFixed(2),
        referenceNo: "",
        status: initialStatus,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    const targetRow = rows.find(r => r.id === id);
    if (targetRow && isRowLocked(targetRow)) {
      Alert.alert("Locked Row", "This payment has already been verified and cannot be deleted.");
      return;
    }
    setRows(rows.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, updates: Partial<SplitPaymentRow>) => {
    setRows(
      rows.map((r) => {
        if (r.id === id) {
          if (isRowLocked(r)) return r; // Prevent editing locked rows

          const updated = { ...r, ...updates };

          if (updates.payModeId !== undefined) {
            const method = availableMethods.find((m) => m.position === updates.payModeId);
            if (method) {
              updated.payMode = method.payMode;
              updated.status = isQRMode(method.payMode) ? "Pending" : "Paid";

              // If they selected Member and no member is set, trigger lookup
              const isMember = method.payMode.toUpperCase().trim() === "MEMBER" || method.payMode.toUpperCase().trim() === "CREDIT";
              if (isMember && !selectedMember && onSelectMember) {
                onSelectMember(method.payMode);
              }
            }
          }
          return updated;
        }
        return r;
      })
    );
  };

  const handleOpenDropdown = (row: SplitPaymentRow) => {
    if (isRowLocked(row)) return;
    setActiveDropdownRowId(row.id);
  };

  const handleSelectMode = (method: PaymentMethodType) => {
    if (activeDropdownRowId) {
      handleUpdateRow(activeDropdownRowId, { payModeId: method.position });
      setActiveDropdownRowId(null);
    }
  };

  // Launch digital payment sequential verification
  const handleGenerateQR = (row: SplitPaymentRow) => {
    const amt = parseFloat(row.amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount before generating QR.");
      return;
    }

    setActiveQrRowId(row.id);
    setQrModalAmount(amt);

    if (isPayNowMode(row.payMode)) {
      setQrModalType("PAYNOW");
      setQrModalVisible(true);
    } else if (isUpiMode(row.payMode)) {
      setQrModalType("UPI");
      setQrModalVisible(true);
    } else {
      Alert.alert("Error", "Selected payment mode is not a QR payment type.");
    }
  };

  const handleQrPaymentSuccess = () => {
    if (activeQrRowId) {
      setRows(prevRows =>
        prevRows.map(r => (r.id === activeQrRowId ? { ...r, status: "Paid" } : r))
      );
      Alert.alert("Success", "QR payment confirmed successfully.");
    }
    setQrModalVisible(false);
    setQrModalType(null);
    setActiveQrRowId(null);
  };

  const handlePay = () => {
    if (!isValid) {
      Alert.alert("Validation Error", validationError || "Invalid payments.");
      return;
    }

    const pendingQR = rows.some(r => r.status === "Pending");
    if (pendingQR) {
      Alert.alert("Payments Pending", "Please verify and complete all QR payments first.");
      return;
    }

    const finalPayments = rows.map((r) => ({
      payModeId: r.payModeId,
      payMode: r.payMode,
      amount: parseFloat(r.amount) || 0,
      referenceNo: r.referenceNo || undefined,
    }));
    onComplete(finalPayments);
  };

  const activeRowForDropdown = rows.find(r => r.id === activeDropdownRowId);
  const dropdownOptions = activeDropdownRowId ? getAvailableMethodsForRow(activeDropdownRowId) : [];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        {memberFlow ? "Collect Member Credit Payment" : "Split Payment Checkout"}
      </Text>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {rows.map((row, idx) => {
          const locked = isRowLocked(row);
          const isMemberMode = row.payMode.toUpperCase().trim() === "MEMBER" || row.payMode.toUpperCase().trim() === "CREDIT";
          const availLimit = selectedMember
            ? (selectedMember.CreditLimit || 0) - (selectedMember.CurrentBalance || 0)
            : 0;
          const exceedsLimit = isMemberMode && !memberFlow && selectedMember && (parseFloat(row.amount) || 0) > availLimit;

          return (
            <View key={row.id} style={[styles.rowContainer, locked && styles.lockedRow]}>
              <View style={styles.rowHeader}>
                <View style={styles.rowTitleContainer}>
                  <Text style={styles.rowLabel}>Payment Method #{idx + 1}</Text>
                  {locked && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={10} color={Theme.success} />
                      <Text style={styles.lockText}>VERIFIED</Text>
                    </View>
                  )}
                </View>
                {rows.length > 1 && !locked && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleRemoveRow(row.id)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputsRow}>
                {/* Custom Styled Dropdown Selector */}
                <TouchableOpacity
                  activeOpacity={locked ? 1 : 0.7}
                  onPress={() => handleOpenDropdown(row)}
                  style={[styles.dropdownTrigger, locked && styles.disabledInput]}
                  disabled={locked}
                >
                  <Text style={[styles.dropdownTriggerText, locked && styles.disabledText]}>
                    {row.payMode.toUpperCase()}
                  </Text>
                  {!locked && <Ionicons name="chevron-down" size={18} color={Theme.textSecondary} />}
                </TouchableOpacity>

                {/* Amount Input */}
                <View style={[styles.amountInputWrapper, locked && styles.disabledInput, exceedsLimit && styles.errorBorder]}>
                  <Text style={[styles.currencyPrefix, locked && styles.disabledText]}>{currencySymbol}</Text>
                  <TextInput
                    style={[styles.amountInput, locked && styles.disabledText]}
                    keyboardType="numeric"
                    value={row.amount}
                    onChangeText={(val) => handleUpdateRow(row.id, { amount: val })}
                    placeholder="0.00"
                    placeholderTextColor={Theme.textMuted}
                    editable={!locked}
                  />
                </View>
              </View>

              {/* Member specific info */}
              {isMemberMode && !memberFlow && (
                <View style={styles.memberInfoBox}>
                  {selectedMember ? (
                    <View>
                      <Text style={styles.memberInfoName}>
                        Member: <Text style={{ fontFamily: Fonts.black }}>{selectedMember.Name}</Text>
                      </Text>
                      <Text style={[styles.memberLimitText, exceedsLimit && { color: Theme.danger }]}>
                        Avail Limit: {formatMoney(currencySymbol, availLimit)}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => onSelectMember && onSelectMember(row.payMode)} style={styles.memberSelectLink}>
                      <Ionicons name="people" size={14} color={Theme.primary} />
                      <Text style={styles.memberSelectLinkText}>Tap to select customer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Status and QR Generation Actions */}
              <View style={styles.rowFooter}>
                <View style={styles.statusBox}>
                  <Text style={styles.statusLabel}>Status: </Text>
                  <View style={[styles.statusBadge, row.status === "Paid" ? styles.badgePaid : styles.badgePending]}>
                    <Text style={[styles.statusText, row.status === "Paid" ? styles.textPaid : styles.textPending]}>
                      {row.status === "Paid" ? "PAID" : "PENDING"}
                    </Text>
                  </View>
                </View>

                {isQRMode(row.payMode) && row.status === "Pending" && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleGenerateQR(row)}
                    style={styles.generateQrBtn}
                  >
                    <Ionicons name="qr-code" size={14} color="#fff" />
                    <Text style={styles.generateQrText}>Generate QR</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Reference Number for Non-Cash, editable only if unlocked */}
              {row.payMode.toUpperCase().trim() !== "CASH" && row.payMode.toUpperCase().trim() !== "CAS" && (
                <TextInput
                  style={[styles.refInput, locked && styles.disabledInput]}
                  placeholder="Reference / Transaction Number (Optional)"
                  placeholderTextColor={Theme.textMuted}
                  value={row.referenceNo}
                  onChangeText={(val) => handleUpdateRow(row.id, { referenceNo: val })}
                  editable={!locked}
                />
              )}
            </View>
          );
        })}

        {/* Add Payment Method Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleAddRow}
          style={[styles.addMethodBtn, remainingBalance <= 0 && styles.addMethodBtnDisabled]}
          disabled={remainingBalance <= 0}
        >
          <Ionicons name="add-circle-outline" size={20} color={remainingBalance <= 0 ? Theme.textMuted : Theme.primary} />
          <Text style={[styles.addMethodBtnText, remainingBalance <= 0 && { color: Theme.textMuted }]}>
            Add Payment Method
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bill & Payment Status Board */}
      <View style={styles.summaryBoard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Bill</Text>
          <Text style={styles.summaryValue}>{formatMoney(currencySymbol, targetTotal)}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Paid</Text>
          <Text style={[styles.summaryValue, { color: Theme.success }]}>
            {formatMoney(currencySymbol, totalPaid)}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Remaining Balance</Text>
          <Text
            style={[
              styles.summaryValue,
              { color: remainingBalance > 0.01 ? Theme.danger : Theme.success, fontFamily: Fonts.black },
            ]}
          >
            {formatMoney(currencySymbol, remainingBalance)}
          </Text>
        </View>

        {validationError && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={14} color={Theme.danger} />
            <Text style={styles.errorBannerText}>{validationError}</Text>
          </View>
        )}
      </View>

      {/* Action Row */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onCancel}
          style={styles.cancelBtn}
          disabled={processing}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handlePay}
          style={[styles.payBtn, (!isValid || rows.some(r => r.status === "Pending")) && styles.payBtnDisabled]}
          disabled={!isValid || rows.some(r => r.status === "Pending") || processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText}>
              {memberFlow ? "Submit Payment" : "Complete Checkout"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* DROPDOWN SELECTOR MODAL */}
      <Modal visible={activeDropdownRowId !== null} transparent animationType="fade" onRequestClose={() => setActiveDropdownRowId(null)}>
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setActiveDropdownRowId(null)}
        >
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownTitle}>Select Payment Mode</Text>
            <ScrollView style={styles.dropdownScroll}>
              {dropdownOptions.map((m) => (
                <TouchableOpacity
                  key={m.position}
                  style={styles.dropdownOption}
                  onPress={() => handleSelectMode(m)}
                >
                  <Text style={styles.dropdownOptionText}>{m.description.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* SEQUENTIAL QR MODALS */}
      {qrModalType === "PAYNOW" && (
        <PayNowPaymentModal
          visible={qrModalVisible}
          onClose={() => setQrModalVisible(false)}
          amount={qrModalAmount}
          onSuccess={handleQrPaymentSuccess}
        />
      )}

      {qrModalType === "UPI" && (
        <UPIPaymentModal
          visible={qrModalVisible}
          onClose={() => setQrModalVisible(false)}
          amount={qrModalAmount}
          onSuccess={handleQrPaymentSuccess}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 16,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 20,
  },
  rowContainer: {
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 10,
    ...Theme.shadowSm,
  },
  lockedRow: {
    backgroundColor: Theme.bgInput + "25",
    borderColor: Theme.success + "30",
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  rowTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.success + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  lockText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.success,
  },
  removeBtn: {
    padding: 4,
  },
  inputsRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  dropdownTrigger: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    height: 52,
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  amountInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    height: 52,
  },
  currencyPrefix: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  disabledInput: {
    backgroundColor: Theme.bgInput + "10",
    borderColor: Theme.border + "50",
  },
  disabledText: {
    color: Theme.textMuted,
  },
  errorBorder: {
    borderColor: Theme.danger,
  },
  refInput: {
    marginTop: 12,
    height: 44,
    backgroundColor: Theme.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  memberInfoBox: {
    backgroundColor: Theme.primary + "08",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Theme.primary + "15",
  },
  memberInfoName: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  memberLimitText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.success,
    marginTop: 2,
  },
  memberSelectLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberSelectLinkText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  rowFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.border + "40",
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePaid: {
    backgroundColor: Theme.success + "15",
  },
  badgePending: {
    backgroundColor: Theme.warningBg || "#FFF8E1",
  },
  statusText: {
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  textPaid: {
    color: Theme.success,
  },
  textPending: {
    color: Theme.warning || "#F57F17",
  },
  generateQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
    ...Theme.shadowSm,
  },
  generateQrText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: Fonts.black,
  },
  addMethodBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primary,
    borderStyle: "dashed",
    marginTop: 8,
  },
  addMethodBtnDisabled: {
    borderColor: Theme.border,
  },
  addMethodBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  summaryBoard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 6,
    marginTop: 16,
    marginBottom: 16,
    ...Theme.shadowSm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.danger + "08",
    padding: 10,
    borderRadius: 10,
    gap: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Theme.danger + "15",
  },
  errorBannerText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.danger,
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    backgroundColor: Theme.bgInput,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  payBtn: {
    flex: 1.8,
    height: 54,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  payBtnDisabled: {
    backgroundColor: Theme.border,
    opacity: 0.6,
  },
  payBtnText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: "#fff",
  },
  // Dropdown Picker Modal
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownModal: {
    width: "80%",
    maxWidth: 300,
    maxHeight: 350,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    ...Theme.shadowLg,
  },
  dropdownTitle: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 12,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "40",
    paddingBottom: 8,
  },
  dropdownScroll: {
    marginVertical: 4,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "20",
  },
  dropdownOptionText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textAlign: "center",
  },
});
