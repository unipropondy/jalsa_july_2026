import { API_URL } from "@/constants/Config";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../components/Toast";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";

import PayNowPaymentModal from "../components/payment/PayNowPaymentModal";
import SplitPaymentComponent from "../components/payment/SplitPaymentComponent";
import UPIPaymentModal from "../components/payment/UPIPaymentModal";
import {
  findActiveOrder,
  useActiveOrdersStore,
} from "../stores/activeOrdersStore";
import { useAuthStore } from "../stores/authStore";
import { useCartStore } from "../stores/cartStore";
import { useCompanySettingsStore } from "../stores/companySettingsStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { usePaymentSettingsStore } from "../stores/paymentSettingsStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { CustomerDisplaySync } from "../utils/CustomerDisplaySync";

const EMPTY_ARRAY: any[] = [];

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

type PaymentMethod = {
  payMode: string;
  description: string;
  icon: string;
  commission: number;
  serviceCharge: number;
  isEntertainment: boolean;
  isVoucher: boolean;
  position: number;
};

const PAYMODE_ICON_MAP: Record<string, string> = {
  CAS: "money-bill-wave",
  CASH: "money-bill-wave",
  NETS: "exchange-alt",
  AMEX: "cc-amex",
  MASTER: "cc-mastercard",
  VISA: "cc-visa",
  PAYNOW: "qrcode",
  GRAB: "mobile-alt",
  FOODPANDA: "mobile-alt",
  DINERS: "credit-card",
  CHQ: "university",
  LEDGER: "book",
  VOUCHER: "ticket-alt",
  DEAL: "ticket-alt",
  UPI: "mobile-alt",
  GPAY: "google-pay",
  MEMBER: "user-tag",
  CREDIT: "user-tag",
};

function getPaymodeIcon(payMode: string): string {
  const key = payMode.toUpperCase().replace(/[^A-Z]/g, "");
  if (PAYMODE_ICON_MAP[key]) return PAYMODE_ICON_MAP[key];
  for (const [k, v] of Object.entries(PAYMODE_ICON_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  return "credit-card";
}

const isCashMethod = (payMode: string) => /^(CAS|CASH)$/i.test(payMode.trim());

const formatMoney = (symbol: string, amount: number) => {
  try {
    return `${symbol}${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch (e) {
    return `${symbol}${(amount || 0).toFixed(2)}`;
  }
};

export default function PaymentScreen() {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const memberId = params.memberId as string | undefined;
  const collectAmountRaw = params.collectAmount
    ? parseFloat(params.collectAmount as string)
    : undefined;
  const collectAmount =
    collectAmountRaw !== undefined ? Math.max(0, collectAmountRaw) : undefined;
  const memberName = params.memberName as string | undefined;
  const memberPhone = params.memberPhone as string | undefined;
  const isMember = params.isMember === "true";
  const isLedgerCollection = !!memberId;

  const allocationsParam = useMemo(() => {
    if (!params.allocations) return null;
    try {
      return JSON.parse(params.allocations as string);
    } catch (e) {
      console.error("Failed to parse allocations parameter:", e);
      return null;
    }
  }, [params.allocations]);

  const remarksParam =
    (params.remarks as string) || "Credit payment collection via POS checkout";

  const isFocused = useIsFocused() && pathname.includes("/payment");
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;
  const closeActiveOrder = useActiveOrdersStore((s) => s.closeActiveOrder);
  const clearTable = useTableStatusStore((s) => s.clearTable);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();

  const [selectedMember, setSelectedMember] = useState<any | null>(null);

  useEffect(() => {
    if (memberId) {
      setSelectedMember({
        MemberId: memberId,
        Name: memberName || (isMember ? "Member" : "Credit Customer"),
        Phone: memberPhone || "",
        CurrentBalance: collectAmount || 0,
        CreditLimit: 999999,
      });
      const fetchMemberDetails = async () => {
        try {
          const endpoint = isMember
            ? `${API_URL}/api/members/search?query=${encodeURIComponent(memberPhone || memberId)}`
            : `${API_URL}/api/credit-customers/search?query=${encodeURIComponent(memberPhone || memberId)}`;
          const res = await fetch(endpoint);
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const match = data.find((m: any) => m.MemberId === memberId);
            if (match) {
              setSelectedMember(match);
            }
          }
        } catch (err) {
          console.error("Failed to load details for collection customer:", err);
        }
      };
      fetchMemberDetails();
    }
  }, [memberId, isMember]);

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isMobile = !isTablet;
  const showOrderPanel =
    (isTablet && (isLandscape || width >= 1024)) || (isMobile && isLandscape);

  const context = useOrderContextStore((s) => s.currentOrder);
  const hasHydrated = useActiveOrdersStore((s) => s._hasHydrated);
  const activeOrder = context ? findActiveOrder(context) : undefined;

  const currentContextId = useCartStore((s: any) => s.currentContextId);
  const cart = useCartStore(
    (s: any) =>
      (currentContextId ? s.carts[currentContextId] : undefined) || EMPTY_ARRAY,
  );

  const currentTableOrderId = useCartStore((s: any) =>
    context?.tableId ? s.tableOrderIds[context.tableId] : undefined,
  );
  const displayOrderId = currentTableOrderId || activeOrder?.orderId;

  const discount = useCartStore((s: any) =>
    s.currentContextId ? s.discounts[s.currentContextId] : null,
  );

  const [method, setMethod] = useState("CAS");
  const [cashInput, setCashInput] = useState("");
  const [collectionAmount, setCollectionAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isLedgerCollection && collectAmount !== undefined) {
      setCollectionAmount(collectAmount.toFixed(2));
    }
  }, [collectAmount, isLedgerCollection]);

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const formatted =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;

    const val = parseFloat(formatted) || 0;
    if (collectAmount !== undefined && val > collectAmount) {
      showToast({
        type: "warning",
        message: "Overpayment Prevention",
        subtitle: `Cannot exceed outstanding balance of ${currencySymbol}${collectAmount.toFixed(2)}`,
      });
      setCollectionAmount(collectAmount.toFixed(2));
      if (isCashMethod(method)) {
        setCashInput(collectAmount.toFixed(2));
      }
      return;
    }
    setCollectionAmount(formatted);
    if (isCashMethod(method)) {
      setCashInput(formatted);
    }
  };
  const [time, setTime] = useState(new Date());
  const [isSplitActive, setIsSplitActive] = useState(false);

  // Member flow state
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);

  // Quick Add State variables
  const [isQuickAddMode, setIsQuickAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState("1000");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [selectedCountryCode, setSelectedCountryCode] = useState("+65");
  const [showCountryCodeModal, setShowCountryCodeModal] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const handleQuickAddMember = async () => {
    if (!newName.trim() || !newPhone.trim()) {
      showToast({
        type: "warning",
        message: "Required Fields",
        subtitle: "Please enter Name and Phone",
      });
      return;
    }
    setAddingMember(true);
    const isCredit = method.trim().toUpperCase() === "CREDIT";
    const endpoint = isCredit
      ? `${API_URL}/api/credit-customers/add`
      : `${API_URL}/api/members/add`;
    try {
      const fullPhone = selectedCountryCode + newPhone.trim();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: fullPhone,
          email: newEmail.trim() || null,
          address: newAddress.trim() || null,
          creditLimit: parseFloat(newCreditLimit) || 1000,
          currentBalance: 0,
          balance: 0,
          isActive: newIsActive ? 1 : 0,
          userId: user?.userId,
        }),
      });
      const data = await res.json();
      if (data.success && data.member) {
        setSelectedMember(data.member);
        setIsQuickAddMode(false);
        setNewName("");
        setNewPhone("");
        setNewEmail("");
        setNewAddress("");
        setNewIsActive(true);
        setSelectedCountryCode("+65");
        setNewCreditLimit("1000");
        setMemberQuery(data.member.Name);
        showToast({
          type: "success",
          message: "Success",
          subtitle: isCredit
            ? "New credit customer added and selected!"
            : "New member added and selected!",
        });
      } else {
        showToast({
          type: "error",
          message: "Failed",
          subtitle: data.error || "Could not add customer",
        });
      }
    } catch (err) {
      console.error("Quick add error:", err);
      showToast({
        type: "error",
        message: "Error",
        subtitle: "Could not connect to server",
      });
    } finally {
      setAddingMember(false);
    }
  };

  const searchMembers = async (q: string) => {
    setSearchingMembers(true);
    const isCredit = method.trim().toUpperCase() === "CREDIT";
    const endpoint = isCredit
      ? `${API_URL}/api/credit-customers/search?query=${encodeURIComponent(q)}`
      : `${API_URL}/api/members/search?query=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search members error:", err);
      showToast({
        type: "error",
        message: "Search Failed",
        subtitle: "Could not search accounts",
      });
    } finally {
      setSearchingMembers(false);
    }
  };

  useEffect(() => {
    if (showMemberModal) {
      const timer = setTimeout(() => {
        searchMembers(memberQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [memberQuery, showMemberModal]);

  useEffect(() => {
    if (!showMemberModal) {
      setIsQuickAddMode(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewAddress("");
      setNewIsActive(true);
      setSelectedCountryCode("+65");
      setNewCreditLimit("1000");
    }
  }, [showMemberModal]);

  const splitItems = useCartStore((s: any) => s.activeSplitItems);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<PaymentMethod | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isUPIVisible, setIsUPIVisible] = useState(false);
  const [isPayNowVisible, setIsPayNowVisible] = useState(false);
  const settingsStore = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settingsStore.currencySymbol || "$";
  const gstRate = (settingsStore.gstPercentage || 0) / 100;
  const scRate = (settingsStore.serviceChargePercentage || 0) / 100;
  const [roundOff, setRoundOff] = useState(0);
  const [roundType, setRoundType] = useState<
    "whole" | "five" | "ten" | "custom" | null
  >(null);
  const [isAdjustmentModalVisible, setIsAdjustmentModalVisible] =
    useState(false);
  const [customValue, setCustomValue] = useState("");
  const [isTestModalVisible, setIsTestModalVisible] = useState(false);

  const [pendingPayments, setPendingPayments] = useState<any[] | null>(null);
  const [payNowQrAmount, setPayNowQrAmount] = useState(0);
  const [upiQrAmount, setUpiQrAmount] = useState(0);

  const calculatePayNowAmount = (paymentsList: any[]) => {
    return paymentsList.reduce((sum, p) => {
      const pm = paymentMethods.find((x) => x.position === p.payModeId);
      if (pm) {
        const code = pm.payMode.toUpperCase().trim();
        if (
          code.includes("PAYNOW") ||
          code.includes("QR") ||
          code.includes("PAY-NOW")
        ) {
          return sum + p.amount;
        }
      }
      return sum;
    }, 0);
  };

  const calculateUpiAmount = (paymentsList: any[]) => {
    return paymentsList.reduce((sum, p) => {
      const pm = paymentMethods.find((x) => x.position === p.payModeId);
      if (pm) {
        const code = pm.payMode.toUpperCase().trim();
        if (
          code.includes("UPI") ||
          code.includes("GPAY") ||
          code.includes("PHONE") ||
          code.includes("PAYTM")
        ) {
          return sum + p.amount;
        }
      }
      return sum;
    }, 0);
  };

  const finalItems = useMemo(() => {
    return splitItems || cart;
  }, [splitItems, cart]);

  useEffect(() => {
    const init = async () => {
      await usePaymentSettingsStore.getState().fetchSettings();
      await fetchPaymentMethods();
      if (context?.tableId) {
        try {
          const res = await fetch(`${API_URL}/api/tables/${context.tableId}`);
          const data = await res.json();
          const oid = data.table?.currentOrderId || data.table?.CurrentOrderId;
          if (data.success && oid) {
            useCartStore.getState().setTableOrderId(context.tableId, oid);
          }
        } catch (err) {
          console.error("Failed to sync official Order ID:", err);
        }
      }
    };
    init();
  }, []);

  // 🖥️ CUSTOMER DISPLAY REAL-TIME SYNC
  useEffect(() => {
    CustomerDisplaySync.isPaymentActive = true;
    return () => {
      CustomerDisplaySync.isPaymentActive = false;
      CustomerDisplaySync.syncIdle();
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      if (pathname !== "/payment_success") {
        CustomerDisplaySync.isPaymentActive = false;
        CustomerDisplaySync.syncIdle();
      }
      return;
    }

    CustomerDisplaySync.isPaymentActive = true;

    if (context && finalItems.length > 0) {
      CustomerDisplaySync.syncCart({
        orderContext: context,
        cart: finalItems,
        discountInfo: discount,
        gstPercentage: settingsStore.gstPercentage || 0,
        roundOff: roundOff,
        active: true,
        orderId: displayOrderId,
        paymentMethod: method,
      });
    } else {
      CustomerDisplaySync.syncIdle();
    }
  }, [
    isFocused,
    pathname,
    context,
    finalItems,
    discount,
    settingsStore.gstPercentage,
    roundOff,
    displayOrderId,
    method,
  ]);

  const {
    subtotal,
    grossTotal: payGrossTotal,
    totalItemDiscount: payItemDiscount,
    scEligibleSubtotal,
  } = useMemo(() => {
    if (isLedgerCollection) {
      return {
        grossTotal: collectAmount || 0,
        totalItemDiscount: 0,
        subtotal: collectAmount || 0,
        scEligibleSubtotal: 0,
      };
    }
    const nonVoided = finalItems.filter((i: any) => i.status !== "VOIDED");
    return nonVoided.reduce(
      (acc: any, item: any) => {
        const baseTotal = (item.price || 0) * (item.qty || 0);
        let itemDiscount = 0;
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        const discType = item.discountType || "percentage";
        if (discAmt > 0) {
          if (discType === "percentage") {
            itemDiscount = baseTotal * (discAmt / 100);
          } else {
            itemDiscount = discAmt * (item.qty || 0);
          }
        }
        const itemSubtotal = baseTotal - itemDiscount;
        const isSC =
          Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;
        return {
          grossTotal: acc.grossTotal + baseTotal,
          totalItemDiscount: acc.totalItemDiscount + itemDiscount,
          subtotal: acc.subtotal + itemSubtotal,
          scEligibleSubtotal:
            acc.scEligibleSubtotal + (isSC ? itemSubtotal : 0),
        };
      },
      {
        grossTotal: 0,
        totalItemDiscount: 0,
        subtotal: 0,
        scEligibleSubtotal: 0,
      },
    );
  }, [finalItems, isLedgerCollection, collectAmount]);

  const allItemsHaveSC = useMemo(() => {
    const activeItems = finalItems.filter(
      (i: any) => i.status !== "VOIDED" && i.statusCode !== 0,
    );
    return (
      activeItems.length > 0 &&
      activeItems.every(
        (item: any) =>
          Number(item.isServiceCharge) === 1 || item.isServiceCharge === true,
      )
    );
  }, [finalItems]);

  const discountAmount = useMemo(() => {
    if (isLedgerCollection) return 0;
    if (!discount?.applied) return 0;
    if (discount.type === "percentage")
      return (subtotal * discount.value) / 100;
    return splitItems ? 0 : discount.value;
  }, [discount, subtotal, splitItems, isLedgerCollection]);

  // Service Charge & GST: SC on net, GST on (net + SC)
  const netAfterDiscount = isLedgerCollection
    ? collectAmount || 0
    : subtotal - discountAmount;

  // Pro-rate the bill-level discount to service-charge-eligible items
  const scEligibleNet = useMemo(() => {
    if (isLedgerCollection || subtotal <= 0) return 0;
    const proportion = scEligibleSubtotal / subtotal;
    return Math.max(0, scEligibleSubtotal - proportion * discountAmount);
  }, [scEligibleSubtotal, subtotal, discountAmount, isLedgerCollection]);

  const serviceChargeAmt = isLedgerCollection ? 0 : scEligibleNet * scRate;
  const taxableAmount = netAfterDiscount + serviceChargeAmt;
  const tax = isLedgerCollection ? 0 : taxableAmount * gstRate;
  const baseTotal = taxableAmount + tax;

  useEffect(() => {
    if (isLedgerCollection) {
      setRoundOff(0);
      setRoundType(null);
      return;
    }
    if (!isCashMethod(method)) {
      setRoundOff(0);
      setRoundType(null);
      return;
    }
    if (roundType === "whole") setRoundOff(Math.round(baseTotal) - baseTotal);
    else if (roundType === "five")
      setRoundOff(Math.round(baseTotal * 20) / 20 - baseTotal);
    else if (roundType === "ten")
      setRoundOff(Math.round(baseTotal * 10) / 10 - baseTotal);
  }, [baseTotal, roundType, method, isLedgerCollection]);

  const total = isLedgerCollection
    ? parseFloat(collectionAmount) || 0
    : Math.max(0, Math.round((baseTotal + roundOff) * 100) / 100);
  const displayedTax = isLedgerCollection ? 0 : Math.round(tax * 100) / 100;
  const displayedServiceCharge = isLedgerCollection
    ? 0
    : Math.round(serviceChargeAmt * 100) / 100;
  const netAmountForDisplay = netAfterDiscount;
  // ✅ FIX: Compute round-off from raw (unrounded) total vs rounded-display components.
  // Previously this produced a phantom -$0.01 "Rounding" line when GST had a .5-cent fraction
  // because displayedTax was rounded up but total was the raw float sum.
  const displayedRoundOff =
    roundOff !== 0
      ? parseFloat(
          (
            total -
            (netAmountForDisplay + displayedServiceCharge + displayedTax)
          ).toFixed(2),
        )
      : 0;
  const paidNum = isCashMethod(method) ? parseFloat(cashInput) || 0 : total;
  const change = Math.max(0, paidNum - total);
  const quickCash = [20, 50, 100, 200, 500, 1000];

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-methods`);
      const data: any[] = await res.json();
      const mapped: PaymentMethod[] = data.map((d) => ({
        payMode: d.payMode || "",
        description: d.description || d.payMode || "",
        icon: getPaymodeIcon(d.payMode || ""),
        commission: parseFloat(d.Commission) || 0,
        serviceCharge: parseFloat(d.ServiceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher: d.isVoucher === 1 || d.isVoucher === true,
        position: d.Position || 0,
      }));

      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        const key = isCashMethod(m.payMode)
          ? "__CASH__"
          : m.payMode.toUpperCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const filtered = deduped.filter((m) => {
        const mUpper = m.payMode.toUpperCase().trim();
        if (
          isLedgerCollection &&
          (mUpper === "MEMBER" || mUpper === "CREDIT" || mUpper === "LEDGER")
        )
          return false;
        return true;
      });

      setPaymentMethods(filtered);
      if (filtered.length > 0) {
        setMethod(filtered[0].payMode);
        fetchPaymentDetail(filtered[0].payMode, filtered[0]);
        if (isCashMethod(filtered[0].payMode)) {
          setCashInput(total.toFixed(2));
        }
      }
    } catch {
      setPaymentMethods([
        {
          payMode: "CAS",
          description: "CASH",
          icon: "money-bill-wave",
          commission: 0,
          serviceCharge: 0,
          isEntertainment: false,
          isVoucher: false,
          position: 1,
        },
      ]);
    } finally {
      setLoadingMethods(false);
    }
  };

  const fetchPaymentDetail = async (
    payMode: string,
    fallback?: PaymentMethod,
  ) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(
        `${API_URL}/api/sales/payment-detail/${encodeURIComponent(payMode)}`,
      );
      const d = await res.json();
      setSelectedDetail({
        payMode: d.payMode || payMode,
        description: d.description || payMode,
        icon: getPaymodeIcon(d.payMode || payMode),
        commission: parseFloat(d.commission) || 0,
        serviceCharge: parseFloat(d.serviceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher: d.isVoucher === 1 || d.isVoucher === true,
        position: d.position || 0,
      });
    } catch {
      setSelectedDetail(fallback || null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectMethod = (m: PaymentMethod) => {
    setMethod(m.payMode);
    if (!isCashMethod(m.payMode)) {
      setRoundOff(0);
      setRoundType(null);
    } else {
      setCashInput(total.toFixed(2));
    }
    fetchPaymentDetail(m.payMode, m);
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const confirmPayment = async () => {
    if (processing) return;
    if (isLedgerCollection) {
      const parsedAmt = parseFloat(collectionAmount) || 0;
      if (parsedAmt <= 0) {
        showToast({
          type: "warning",
          message: "Invalid Amount",
          subtitle: "Please enter a positive collection amount.",
        });
        return;
      }
      if (collectAmount !== undefined && parsedAmt > collectAmount + 0.01) {
        showToast({
          type: "warning",
          message: "Overpayment Prevention",
          subtitle: `Cannot exceed outstanding balance of ${currencySymbol}${collectAmount.toFixed(2)}`,
        });
        return;
      }
    }
    if (isLedgerCollection && total <= 0) {
      Alert.alert(
        "No Payment Required",
        `Outstanding balance is ${currencySymbol}${total.toFixed(2)}. No collection payment is required.`,
      );
      return;
    }
    if (
      total > 0 &&
      isCashMethod(method) &&
      paidNum < total &&
      Math.abs(paidNum - total) > 0.01
    ) {
      showToast({
        type: "warning",
        message: "Insufficient Payment",
        subtitle: `Please enter at least ${currencySymbol}${total.toFixed(2)}`,
      });
      return;
    }
    const { settings } = usePaymentSettingsStore.getState();
    const mUpper = method.trim().toUpperCase();
    if (
      mUpper === "MEMBER" ||
      mUpper === "CREDIT" ||
      mUpper === "5" ||
      mUpper === "6"
    ) {
      if (!selectedMember) {
        // No member chosen yet — open modal to search and select one
        setShowMemberModal(true);
        return;
      }
      // Member already selected — proceed to Complement Settlement
      const isLimitExceeded =
        (selectedMember.CurrentBalance || 0) + total >
        (selectedMember.CreditLimit || 0);
      if (isLimitExceeded) {
        const isAdminOrManager =
          user?.role === "ADMIN" || user?.role === "MANAGER";
        if (isAdminOrManager) {
          Alert.alert(
            "Credit Limit Exceeded",
            `Customer outstanding will be ${currencySymbol}${((selectedMember.CurrentBalance || 0) + total).toFixed(2)} which exceeds limit of ${currencySymbol}${(selectedMember.CreditLimit || 0).toFixed(2)}. Authorize this credit sale?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Authorize & Complete",
                onPress: () => executeFinalPayment(),
              },
            ],
          );
        } else {
          showToast({
            type: "error",
            message: "Credit Limit Exceeded",
            subtitle: "Manager approval required to override",
          });
        }
      } else {
        executeFinalPayment();
      }
      return;
    }

    if (mUpper.includes("UPI") && settings.upiId) {
      setIsUPIVisible(true);
      return;
    }
    if (mUpper.includes("PAYNOW") && settings.payNowQrUrl) {
      setIsPayNowVisible(true);
      return;
    }
    executeFinalPayment();
  };

  const executeFinalPayment = async (
    payments?: Array<{
      payModeId: number;
      amount: number;
      referenceNo?: string;
    }>,
    memberOverride?: any,
  ) => {
    if (processing) return;
    setProcessing(true);
    if (isLedgerCollection) {
      const selectedMode = paymentMethods.find((m) => m.payMode === method);
      const payModeId = selectedMode ? selectedMode.position || 1 : 1;
      const finalPayments = payments
        ? payments.map((p) => ({
            payModeId: p.payModeId,
            payMode:
              (p as any).payMode ||
              paymentMethods.find((x) => x.position === p.payModeId)?.payMode ||
              "CASH",
            amount: p.amount,
            referenceNo: p.referenceNo || "",
          }))
        : [
            {
              payModeId,
              payMode: method,
              amount: total,
              referenceNo: "",
            },
          ];

      try {
        const payEndpoint = isMember
          ? `${API_URL}/api/members/pay`
          : `${API_URL}/api/credit-customers/pay`;
        const response = await fetch(payEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({
            memberId: memberId,
            amount: total,
            payments: finalPayments,
            allocations: allocationsParam,
            remarks: remarksParam,
            userId: user?.userId,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setTimeout(() => {
            router.push({
              pathname: "/payment_success" as any,
              params: {
                total: total.toFixed(2),
                paidNum: (payments && payments.length > 0
                  ? total
                  : paidNum
                ).toFixed(2),
                change: (payments && payments.length > 0 ? 0 : change).toFixed(
                  2,
                ),
                method:
                  payments && payments.length > 0 ? "SPLIT" : method.trim(),
                payments: payments ? JSON.stringify(payments) : "[]",
                orderId:
                  result.settlementId ||
                  result.transactionId ||
                  "COLL-" + Date.now(),
                tableNo: "LEDGER",
                section: "",
                orderType: "LEDGER",
                discountInfo: "{}",
                items: "[]",
                roundOff: "0.00",
                serviceCharge: "0.00",
                isSplit: payments && payments.length > 0 ? "true" : "false",
                waiterName: user?.userName || "Cashier",
                isLedgerCollection: "true",
                isMember: isMember ? "true" : "false",
              },
            });
          }, 100);
        } else {
          showToast({
            type: "error",
            message: "Failed",
            subtitle: result.error || "Failed to record collection",
          });
        }
      } catch (e: any) {
        showToast({ type: "error", message: "Error", subtitle: e.message });
      } finally {
        setProcessing(false);
      }
      return;
    }
    const tableState = context?.tableId
      ? useTableStatusStore.getState().tableMap[context.tableId.toLowerCase()]
      : null;
    const saleData = {
      orderId: displayOrderId || activeOrder?.orderId,
      orderType:
        context?.orderType === "DINE_IN"
          ? "DINE-IN"
          : context?.orderType || "DINE-IN",
      tableNo:
        context?.orderType === "TAKEAWAY"
          ? context?.takeawayNo
          : context?.tableNo,
      section: context?.section,
      items: finalItems.map((item: any) => ({
        lineItemId: item.lineItemId,
        dishId: item.id,
        name: item.name,
        songName: item.songName || item.SongName || "",
        qty: item.qty,
        price: item.price,
        status: item.status,
        discountAmount: item.discountAmount ?? item.discount ?? null,
        discountType: item.discountType ?? null,
      })),
      subTotal: subtotal,
      taxAmount: displayedTax,
      serviceCharge: displayedServiceCharge,
      discountAmount: discountAmount + payItemDiscount,
      discountType: discount?.type || "fixed",
      totalAmount: total,
      paymentMethod: payments && payments.length > 0 ? "SPLIT" : method.trim(),
      payments: payments || null,
      memberId: memberOverride?.MemberId || selectedMember?.MemberId || null,
      roundOff: displayedRoundOff,
      cashierId: user?.userId,
      tableId: context?.tableId,
      serverId: context?.serverId,
      serverName: context?.serverName,
      isSplit: !!splitItems,
      splitItems: splitItems,
      discountId: discount?.discountId || null,
      discountPercentage:
        discount?.type === "percentage" ? discount.value : null,
      discountRemarks: discount?.label || null,
      orderDiscountAmount: discountAmount,
      itemDiscountAmount: payItemDiscount,
      customerName: tableState?.customerName || null,
      pax: tableState?.pax || null,
    };

    try {
      const response = await fetch(`${API_URL}/api/sales/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleData),
      });
      const result = await response.json();
      if (result.success) {
        setTimeout(() => {
          router.push({
            pathname: "/payment_success" as any,
            params: {
              total: total.toFixed(2),
              paidNum: (payments && payments.length > 0
                ? total
                : paidNum
              ).toFixed(2),
              change: (payments && payments.length > 0 ? 0 : change).toFixed(2),
              method: payments && payments.length > 0 ? "SPLIT" : method.trim(),
              payments: payments ? JSON.stringify(payments) : "[]",
              orderId: result.billNo || result.orderId || displayOrderId || "",
              tableNo: context?.tableNo ?? "",
              section: context?.section ?? "",
              orderType: context?.orderType ?? "",
              discountInfo: JSON.stringify(
                discount?.applied && discountAmount > 0
                  ? { ...discount, amount: discountAmount, subtotal }
                  : {},
              ),
              items: JSON.stringify(finalItems || []),
              roundOff: displayedRoundOff.toFixed(2),
              serviceCharge: displayedServiceCharge.toFixed(2),
              isSplit: splitItems ? "true" : "false",
              waiterName: context?.serverName ?? "",
            },
          });
          if (context) {
            if (splitItems) {
              const { carts, currentContextId, setCartItems } =
                useCartStore.getState();
              if (currentContextId) {
                const updated = (carts[currentContextId] || [])
                  .map((o) => {
                    const s = splitItems.find(
                      (si: any) => si.lineItemId === o.lineItemId,
                    );
                    return s ? { ...o, qty: o.qty - s.qty } : o;
                  })
                  .filter((i) => i.qty > 0);
                setCartItems(currentContextId, updated);
              }
              useCartStore.getState().setActiveSplitItems(null);
              // Do not clean table context if items remain.
              // If empty, backend socket handles cleanup automatically.
            } else {
              if (context.orderType === "DINE_IN") {
                clearTable(context.section!, context.tableNo!);
              }

              if (context.tableId) {
                useCartStore.getState().clearTableSession(context.tableId);
                closeActiveOrder(displayOrderId || "");
              }

              useOrderContextStore.getState().clearOrderContext();
            }
          }
        }, 100);
      } else {
        showToast({ type: "error", message: "Failed", subtitle: result.error });
      }
    } catch (e: any) {
      showToast({ type: "error", message: "Error", subtitle: e.message });
    } finally {
      setProcessing(false);
    }
  };

  const getDisplayUrl = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.location.origin + "/customer-display";
    }
    if (API_URL && API_URL.startsWith("http")) {
      const match = API_URL.match(/^https?:\/\/([^:/]+)/);
      if (match && match[1]) {
        const host = match[1];
        if (host.includes("railway") || host.includes("production")) {
          return "https://jalsajuly2026-production.up.railway.app/customer-display";
        }
        return `http://${host}:8081/customer-display`;
      }
    }
    return "http://localhost:8081/customer-display";
  };

  const openCustomerDisplay = () => {
    const url = getDisplayUrl();
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      const { Linking } = require("react-native");
      Linking.openURL(url).catch((err: any) => {
        Alert.alert("Error", "Could not open browser: " + err.message);
      });
    }
  };

  const triggerTestSync = (
    type: "current" | "large_mock" | "success" | "idle",
  ) => {
    if (type === "current") {
      if (context && finalItems.length > 0) {
        CustomerDisplaySync.syncCart({
          orderContext: context,
          cart: finalItems,
          discountInfo: discount,
          gstPercentage: settingsStore.gstPercentage || 0,
          roundOff: roundOff,
          active: true,
          orderId: displayOrderId,
          paymentMethod: method,
        });
        showToast({
          type: "info",
          message: "Synced Current Cart",
          subtitle: "Sent checkout state to customer display",
        });
      } else {
        showToast({
          type: "warning",
          message: "Cart is Empty",
          subtitle: "Cannot sync empty cart to checkout",
        });
      }
    } else if (type === "large_mock") {
      const mockItems = [
        {
          id: "m1",
          name: "Premium Wagyu Beef Burger",
          qty: 2,
          price: 18.9,
          status: "SERVED",
          discountAmount: 10,
          discountType: "percentage",
        },
        {
          id: "m2",
          name: "Truffle Parmesan Fries",
          qty: 1,
          price: 8.5,
          status: "SERVED",
        },
        {
          id: "m3",
          name: "Classic Caesar Salad",
          qty: 1,
          price: 12.0,
          status: "SERVED",
          discountAmount: 2,
          discountType: "fixed",
        },
        {
          id: "m4",
          name: "Craft IPA Beer Pint",
          qty: 3,
          price: 14.5,
          status: "SERVED",
        },
        {
          id: "m5",
          name: "Salted Caramel Milkshake",
          qty: 1,
          price: 7.9,
          status: "SERVED",
        },
        {
          id: "m6",
          name: "New York Cheesecake",
          qty: 2,
          price: 9.0,
          status: "SERVED",
        },
        {
          id: "m7",
          name: "Espresso Macchiato",
          qty: 1,
          price: 4.5,
          status: "SERVED",
        },
        {
          id: "m8",
          name: "Sparkling Mineral Water",
          qty: 2,
          price: 3.5,
          status: "SERVED",
        },
      ];
      CustomerDisplaySync.syncCart({
        orderContext: {
          tableNo: "T12",
          orderType: "DINE_IN",
          section: "Main Dining",
          serverName: "Alex",
        },
        cart: mockItems,
        discountInfo: {
          applied: true,
          type: "percentage",
          value: 10,
          label: "10% Grand Opening",
        },
        gstPercentage: settingsStore.gstPercentage || 9,
        roundOff: 0.05,
        active: true,
        orderId: "MOCK-889",
      });
      showToast({
        type: "info",
        message: "Synced Mock Large Cart",
        subtitle: "Sent mock checkout state to customer display",
      });
    } else if (type === "success") {
      CustomerDisplaySync.syncPaymentSuccess({
        orderId: "BILL-2026-987",
        total: 125.8,
        paid: 150.0,
        change: 24.2,
        method: "CASH",
      });
      showToast({
        type: "info",
        message: "Synced Payment Success",
        subtitle: "Sent payment success state to customer display",
      });
    } else if (type === "idle") {
      CustomerDisplaySync.syncIdle();
      showToast({
        type: "info",
        message: "Synced Idle State",
        subtitle: "Customer display set to idle attract loop",
      });
    }
    setIsTestModalVisible(false);
  };

  const renderTestDisplayModal = () => (
    <Modal
      visible={isTestModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setIsTestModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={() => setIsTestModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.adjustModalContent, { maxHeight: "90%" }]}>
              <View style={styles.adjustModalHeader}>
                <Text style={styles.adjustModalTitle}>
                  Customer Display Tester
                </Text>
                <TouchableOpacity onPress={() => setIsTestModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: Theme.textSecondary,
                    fontFamily: Fonts.medium,
                    marginBottom: 16,
                  }}
                >
                  Simulate different screens on the customer display to test
                  responsiveness, scrolling, and layouts.
                </Text>
                <View style={styles.adjustPresets}>
                  <TouchableOpacity
                    style={styles.presetItem}
                    onPress={() => triggerTestSync("current")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons
                        name="cart-outline"
                        size={20}
                        color={Theme.primary}
                      />
                      <View>
                        <Text style={styles.presetLabel}>
                          Sync Current Cart
                        </Text>
                        <Text style={{ fontSize: 11, color: Theme.textMuted }}>
                          Send active bill detail
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.presetItem}
                    onPress={() => triggerTestSync("large_mock")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons
                        name="list-outline"
                        size={20}
                        color={Theme.primary}
                      />
                      <View>
                        <Text style={styles.presetLabel}>
                          Sync Mock Large Cart
                        </Text>
                        <Text style={{ fontSize: 11, color: Theme.textMuted }}>
                          Test list scrolling & totals
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.presetItem}
                    onPress={() => triggerTestSync("success")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons
                        name="checkmark-done-circle-outline"
                        size={20}
                        color={Theme.success || "#10B981"}
                      />
                      <View>
                        <Text style={styles.presetLabel}>
                          Sync Payment Success
                        </Text>
                        <Text style={{ fontSize: 11, color: Theme.textMuted }}>
                          Test thank you & QR code
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.presetItem}
                    onPress={() => triggerTestSync("idle")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Ionicons
                        name="images-outline"
                        size={20}
                        color={Theme.warning || "#F59E0B"}
                      />
                      <View>
                        <Text style={styles.presetLabel}>
                          Reset to Idle State
                        </Text>
                        <Text style={{ fontSize: 11, color: Theme.textMuted }}>
                          Test attract animation loop
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.separator} />

                <View style={styles.linkSection}>
                  <Text style={styles.linkTitle}>Test on Another Device</Text>
                  <Text style={styles.linkSub}>
                    Scan this QR code with your phone/tablet on the same Wi-Fi,
                    or click the button below to view the customer screen.
                  </Text>

                  <View style={styles.qrContainer}>
                    <QRCode
                      value={getDisplayUrl()}
                      size={120}
                      color={Theme.textPrimary}
                      backgroundColor="#fff"
                    />
                  </View>

                  <Text style={styles.urlText} selectable>
                    {getDisplayUrl()}
                  </Text>

                  <TouchableOpacity
                    style={styles.openBtn}
                    onPress={openCustomerDisplay}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="open-outline" size={16} color="#fff" />
                    <Text style={styles.openBtnText}>
                      Open Customer Display
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderAdjustmentModal = () => (
    <Modal
      visible={isAdjustmentModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setIsAdjustmentModalVisible(false)}
    >
      <TouchableWithoutFeedback
        onPress={() => setIsAdjustmentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.adjustModalContent}>
              <View style={styles.adjustModalHeader}>
                <Text style={styles.adjustModalTitle}>Bill Adjustment</Text>
                <TouchableOpacity
                  onPress={() => setIsAdjustmentModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={styles.adjustPresets}>
                {[
                  {
                    label: "Singapore Standard",
                    value: "Nearest .05",
                    mode: "five" as const,
                    target: Math.round(baseTotal * 20) / 20,
                  },
                  {
                    label: "Quick Round",
                    value: "Nearest .10",
                    mode: "ten" as const,
                    target: Math.round(baseTotal * 10) / 10,
                  },
                  {
                    label: "Premium Nett",
                    value: "Whole Dollar",
                    mode: "whole" as const,
                    target: Math.round(baseTotal),
                  },
                ].map((p) => (
                  <TouchableOpacity
                    key={p.mode}
                    style={styles.presetItem}
                    onPress={() => {
                      setRoundOff(p.target - baseTotal);
                      setRoundType(p.mode);
                      if (method === "CAS") setCashInput(p.target.toFixed(2));
                      setIsAdjustmentModalVisible(false);
                    }}
                  >
                    <Text style={styles.presetLabel}>{p.label}</Text>
                    <Text style={styles.presetValue}>{p.value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customInputSection}>
                <Text style={styles.inputLabel}>Custom Adjustment Amount</Text>
                <View style={styles.customInputRow}>
                  <TextInput
                    style={styles.adjustTextInput}
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={customValue}
                    onChangeText={setCustomValue}
                  />
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => {
                      const n = parseFloat(customValue);
                      if (!isNaN(n)) {
                        setRoundOff(n);
                        setRoundType("custom");
                        if (method === "CAS")
                          setCashInput((baseTotal + n).toFixed(2));
                        setIsAdjustmentModalVisible(false);
                      }
                    }}
                  >
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={styles.resetBtnFull}
                onPress={() => {
                  setRoundOff(0);
                  setRoundType(null);
                  if (method === "CAS") setCashInput(baseTotal.toFixed(2));
                  setIsAdjustmentModalVisible(false);
                }}
              >
                <Text style={styles.resetBtnText}>Reset to Original Bill</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderItem = ({ item }: { item: any }) => {
    const isVoided = item.status === "VOIDED" || item.isVoided;
    const baseTotal = (item.price || 0) * item.qty;
    const discountVal = Number(item.discountAmount ?? item.discount ?? 0);
    const discountType = item.discountType || "percentage";

    const itemDiscount =
      discountType === "fixed" ||
      (discountType === "percentage" &&
        !item.discount &&
        item.discountAmount > 0)
        ? discountVal * item.qty
        : baseTotal * (discountVal / 100);

    const finalPrice = baseTotal - itemDiscount;

    const isSC =
      Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;

    return (
      <View
        style={[
          styles.itemRow,
          isSC && {
            borderWidth: 1.5,
            borderColor: Theme.dangerBorder,
            backgroundColor: Theme.dangerBg,
            borderRadius: 8,
            marginVertical: 4,
            paddingHorizontal: 8,
          },
        ]}
      >
        <Text style={[styles.itemQty, isVoided && styles.itemVoidedText]}>
          {item.qty}x
        </Text>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Text
              style={[
                styles.itemName,
                { flex: undefined },
                isVoided && styles.itemVoidedText,
              ]}
              numberOfLines={2}
            >
              {item.name}
              {isVoided && " (VOIDED)"}
            </Text>
            {item.isTakeaway && (
              <View style={styles.itemTwBadge}>
                <Text style={styles.itemTwBadgeText}>TW</Text>
              </View>
            )}
          </View>

          {/* Modifiers & Notes */}
          {(item.spicy && item.spicy !== "Medium") ||
          (item.oil && item.oil !== "Normal") ||
          (item.salt && item.salt !== "Normal") ||
          (item.sugar && item.sugar !== "Normal") ||
          item.note ? (
            <Text style={styles.itemSubText} numberOfLines={2}>
              {[
                item.spicy && item.spicy !== "Medium" ? `🌶 ${item.spicy}` : "",
                item.oil && item.oil !== "Normal" ? `Oil: ${item.oil}` : "",
                item.salt && item.salt !== "Normal" ? `Salt: ${item.salt}` : "",
                item.sugar && item.sugar !== "Normal"
                  ? `Sugar: ${item.sugar}`
                  : "",
                item.note ? `📝 ${item.note}` : "",
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          ) : null}

          {item.modifiers &&
            Array.isArray(item.modifiers) &&
            item.modifiers.length > 0 && (
              <Text style={styles.itemSubText} numberOfLines={2}>
                {item.modifiers
                  .map((m: any) => `+ ${m.ModifierName}`)
                  .join("  ·  ")}
              </Text>
            )}
          {isSC && settingsStore.serviceChargePercentage > 0 && !isVoided && (
            <Text
              style={[
                styles.itemSubText,
                { color: Theme.primary, fontFamily: Fonts.bold, marginTop: 4 },
              ]}
            >
              Item Service Charge ({settingsStore.serviceChargePercentage}%):{" "}
              {currencySymbol}
              {(
                (baseTotal - itemDiscount) *
                (settingsStore.serviceChargePercentage / 100)
              ).toFixed(2)}
            </Text>
          )}
        </View>

        <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
          {discountVal > 0 && !isVoided && (
            <View style={styles.itemDiscountRow}>
              <Text style={styles.itemOriginalPrice}>
                {currencySymbol}
                {baseTotal.toFixed(2)}
              </Text>
              <View style={styles.itemDiscountBadge}>
                <Text style={styles.itemDiscountBadgeText}>
                  {discountType === "fixed" ||
                  (discountType === "percentage" &&
                    !item.discount &&
                    item.discountAmount > 0)
                    ? `-${currencySymbol}${discountVal.toFixed(2)}`
                    : `-${discountVal}%`}
                </Text>
              </View>
            </View>
          )}
          <Text style={[styles.itemPrice, isVoided && styles.itemVoidedText]}>
            {currencySymbol}
            {finalPrice.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  if (!context && !isLedgerCollection) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/category");
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Theme.textSecondary} />
          </TouchableOpacity>
          <View style={styles.orderInfo}>
            <Text style={styles.orderTitle}>
              {isLedgerCollection ? "Ledger Collection" : "Checkout"}
            </Text>
            <View style={styles.orderBadgeRow}>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: isLedgerCollection
                      ? Theme.success + "20"
                      : context?.orderType === "DINE_IN"
                        ? Theme.primaryLight
                        : Theme.warningBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    {
                      color: isLedgerCollection
                        ? Theme.success
                        : context?.orderType === "DINE_IN"
                          ? Theme.primary
                          : Theme.warning,
                    },
                  ]}
                >
                  {isLedgerCollection
                    ? "LEDGER COLLECTION"
                    : context?.orderType === "DINE_IN"
                      ? "DINE-IN"
                      : "TAKEAWAY"}
                </Text>
              </View>
              {isLedgerCollection ? (
                <View style={styles.tableBadge}>
                  <Text style={styles.tableBadgeText}>{memberName}</Text>
                </View>
              ) : (
                context?.orderType === "DINE_IN" && (
                  <View style={styles.tableBadge}>
                    <Text style={styles.tableBadgeText}>
                      {formatSection(context?.section || "")} • T
                      {context?.tableNo}
                    </Text>
                  </View>
                )
              )}
              <Text style={styles.orderSub}>
                #
                {isLedgerCollection
                  ? memberPhone || "LEDGER"
                  : displayOrderId || "NEW"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[
                styles.backBtn,
                { borderColor: Theme.primaryBorder },
                isSplitActive && {
                  backgroundColor: Theme.primary,
                  borderColor: Theme.primary,
                },
              ]}
              onPress={() => setIsSplitActive(!isSplitActive)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="git-compare-outline"
                size={20}
                color={isSplitActive ? "#fff" : Theme.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.backBtn, { borderColor: Theme.primaryBorder }]}
              onPress={openCustomerDisplay}
              activeOpacity={0.7}
            >
              <Ionicons name="open-outline" size={20} color={Theme.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.backBtn, { borderColor: Theme.primaryBorder }]}
              onPress={() => setIsTestModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="desktop-outline"
                size={20}
                color={Theme.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View
              style={[
                styles.mainLayout,
                isLandscape && { flexDirection: "row" },
              ]}
            >
              <View
                style={[
                  styles.leftPane,
                  isLandscape && { flex: 1.2, paddingRight: 20 },
                ]}
              >
                {/* Summary for Mobile */}
                {!showOrderPanel && (
                  <View style={styles.mobileSummaryCard}>
                    <View style={styles.mobileSummaryRow}>
                      <View>
                        <Text style={styles.mobileSummaryLabel}>
                          AMOUNT DUE
                        </Text>
                        <Text style={styles.mobileSummaryTotal}>
                          {currencySymbol}
                          {total.toFixed(2)}
                        </Text>
                      </View>
                      {isCashMethod(method) && (
                        <TouchableOpacity
                          style={styles.mobileAdjustBtn}
                          onPress={() => setIsAdjustmentModalVisible(true)}
                        >
                          <Ionicons
                            name="options-outline"
                            size={20}
                            color={Theme.primary}
                          />
                          <Text style={styles.mobileAdjustText}>Adjust</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {(discount?.applied || discountAmount > 0) && (
                      <View
                        style={[
                          styles.mobileSummaryRow,
                          {
                            marginTop: 10,
                            paddingTop: 10,
                            borderTopWidth: 1,
                            borderTopColor: Theme.border + "40",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.mobileSummaryLabel,
                            { color: Theme.danger },
                          ]}
                        >
                          DISCOUNT
                        </Text>
                        <Text
                          style={[
                            styles.mobileSummaryTotal,
                            { fontSize: 18, color: Theme.danger },
                          ]}
                        >
                          -{currencySymbol}
                          {discountAmount.toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                {isSplitActive ? (
                  <SplitPaymentComponent
                    targetTotal={total}
                    paymentMethods={paymentMethods.map((pm) => ({
                      payMode: pm.payMode,
                      description: pm.description,
                      position: pm.position,
                    }))}
                    selectedMember={selectedMember}
                    onSelectMember={(mode) => {
                      if (mode) setMethod(mode);
                      setShowMemberModal(true);
                    }}
                    onComplete={(finalPayments) => {
                      executeFinalPayment(finalPayments);
                    }}
                    onCancel={() => setIsSplitActive(false)}
                    processing={processing}
                    currencySymbol={currencySymbol}
                  />
                ) : (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>
                        Select Payment Method
                      </Text>
                    </View>
                    {loadingMethods ? (
                      <View
                        style={{
                          height: 100,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ActivityIndicator size="large" color={Theme.primary} />
                        <Text
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            fontFamily: Fonts.medium,
                            color: Theme.textSecondary,
                          }}
                        >
                          Loading methods...
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.methodsGrid}>
                        {paymentMethods.map((m) => (
                          <TouchableOpacity
                            key={m.payMode}
                            style={[
                              styles.methodCard,
                              method === m.payMode && styles.activeMethodCard,
                              isMobile && { width: "30%", height: 75 },
                            ]}
                            onPress={() => handleSelectMethod(m)}
                          >
                            <View
                              style={[
                                styles.methodIconBox,
                                method === m.payMode && styles.activeIconBox,
                                isMobile && { width: 30, height: 30 },
                              ]}
                            >
                              <FontAwesome5
                                name={m.icon}
                                size={isMobile ? 16 : 20}
                                color={
                                  method === m.payMode ? "#fff" : Theme.primary
                                }
                              />
                            </View>
                            <Text
                              style={[
                                styles.methodLabel,
                                method === m.payMode &&
                                  styles.activeMethodLabel,
                                isMobile && { fontSize: 10 },
                              ]}
                            >
                              {m.description}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {(method.trim().toUpperCase() === "MEMBER" ||
                      method.trim().toUpperCase() === "CREDIT") && (
                      <View style={styles.creditMemberSection}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>
                            {method.trim().toUpperCase() === "CREDIT"
                              ? "Credit Customer Account"
                              : "Member Account"}
                          </Text>
                        </View>

                        {selectedMember ? (
                          <View style={styles.selectedCreditCard}>
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                <View style={styles.creditIconBadge}>
                                  <FontAwesome5
                                    name="user-tag"
                                    size={14}
                                    color="#fff"
                                  />
                                </View>
                                <View>
                                  <Text style={styles.creditCardName}>
                                    {selectedMember.Name}
                                  </Text>
                                  <Text style={styles.creditCardPhone}>
                                    {selectedMember.Phone}
                                  </Text>
                                </View>
                              </View>
                              <TouchableOpacity
                                style={styles.changeCreditBtn}
                                onPress={() => setShowMemberModal(true)}
                              >
                                <Text style={styles.changeCreditBtnText}>
                                  Change
                                </Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.creditCardStatsRow}>
                              <View style={styles.creditStatCol}>
                                <Text style={styles.creditStatLabel}>
                                  Available Credit
                                </Text>
                                <Text
                                  style={[
                                    styles.creditStatValue,
                                    {
                                      color:
                                        (selectedMember.CreditLimit || 0) -
                                          (selectedMember.CurrentBalance || 0) <
                                        total
                                          ? Theme.danger
                                          : Theme.success,
                                    },
                                  ]}
                                >
                                  {formatMoney(
                                    currencySymbol,
                                    (selectedMember.CreditLimit || 0) -
                                      (selectedMember.CurrentBalance || 0),
                                  )}
                                </Text>
                              </View>
                              <View style={styles.creditStatCol}>
                                <Text style={styles.creditStatLabel}>
                                  Credit Limit
                                </Text>
                                <Text style={styles.creditStatValue}>
                                  {formatMoney(
                                    currencySymbol,
                                    selectedMember.CreditLimit || 0,
                                  )}
                                </Text>
                              </View>
                              <View style={styles.creditStatCol}>
                                <Text style={styles.creditStatLabel}>
                                  Outstanding
                                </Text>
                                <Text style={styles.creditStatValue}>
                                  {formatMoney(
                                    currencySymbol,
                                    selectedMember.CurrentBalance || 0,
                                  )}
                                </Text>
                              </View>
                            </View>

                            {(selectedMember.CurrentBalance || 0) + total >
                              (selectedMember.CreditLimit || 0) && (
                              <View style={styles.limitExceededBanner}>
                                <Ionicons
                                  name="alert-circle"
                                  size={16}
                                  color={Theme.danger}
                                />
                                <Text style={styles.limitExceededText}>
                                  Transaction exceeds Credit Limit by{" "}
                                  {formatMoney(
                                    currencySymbol,
                                    (selectedMember.CurrentBalance || 0) +
                                      total -
                                      (selectedMember.CreditLimit || 0),
                                  )}
                                </Text>
                              </View>
                            )}
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.selectCreditPrompt}
                            onPress={() => setShowMemberModal(true)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.selectCreditPromptInner}>
                              <Ionicons
                                name="search-outline"
                                size={24}
                                color={Theme.primary}
                              />
                              <Text style={styles.selectCreditPromptTitle}>
                                No Customer Selected
                              </Text>
                              <Text style={styles.selectCreditPromptSub}>
                                Tap here to search existing or quick-add a new
                                credit customer
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {isCashMethod(method) && (
                      <View style={styles.cashSection}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Cash Received</Text>
                        </View>
                        <View style={styles.cashInputBox}>
                          <Text style={styles.currencyPrefix}>
                            {currencySymbol}
                          </Text>
                          <TextInput
                            style={styles.cashInput}
                            value={cashInput}
                            onChangeText={setCashInput}
                            keyboardType="numeric"
                            placeholder="0.00"
                            {...Platform.select({
                              web: { outlineStyle: "none" } as any,
                            })}
                          />
                        </View>
                        <View style={styles.quickCashContainer}>
                          {quickCash.map((v) => {
                            const isSelected = parseFloat(cashInput) === v;
                            return (
                              <TouchableOpacity
                                key={v}
                                style={[
                                  styles.quickCashBtn,
                                  isSelected && styles.activeQuickCashBtn,
                                ]}
                                onPress={() => setCashInput(v.toString())}
                              >
                                <Text
                                  style={[
                                    styles.quickCashText,
                                    isSelected && styles.activeQuickCashText,
                                  ]}
                                >
                                  {currencySymbol}
                                  {v}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                          {(() => {
                            const isExact =
                              Math.abs(parseFloat(cashInput) - total) < 0.01;
                            return (
                              <TouchableOpacity
                                style={[
                                  styles.quickCashBtn,
                                  isExact && styles.activeQuickCashBtn,
                                ]}
                                onPress={() => setCashInput(total.toFixed(2))}
                              >
                                <Text
                                  style={[
                                    styles.quickCashText,
                                    isExact && styles.activeQuickCashText,
                                  ]}
                                >
                                  Exact
                                </Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                        {paidNum > 0 && (
                          <View style={styles.changeBox}>
                            <Text style={styles.changeLabel}>
                              Change to Return
                            </Text>
                            <Text style={styles.changeValue}>
                              {currencySymbol}
                              {change.toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    <View style={{ marginTop: 15 }}>
                      <TouchableOpacity
                        style={[
                          styles.completeBtn,
                          processing && { opacity: 0.7 },
                        ]}
                        onPress={confirmPayment}
                        disabled={processing}
                      >
                        {processing ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons
                              name="checkmark-circle"
                              size={24}
                              color="#fff"
                            />
                            <Text style={styles.completeBtnText}>
                              {(method.trim().toUpperCase() === "MEMBER" ||
                                method.trim().toUpperCase() === "CREDIT" ||
                                method.trim().toUpperCase() === "5" ||
                                method.trim().toUpperCase() === "6") &&
                              selectedMember
                                ? "Complement Settlement"
                                : "Complete Settlement"}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>

              {showOrderPanel && (
                <View style={styles.rightPane}>
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                      <Text style={styles.summaryTitle}>Amount Due</Text>
                      <Text style={styles.summaryTotal}>
                        {currencySymbol}
                        {total.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.breakdown}>
                      <View style={styles.breakRow}>
                        <Text style={styles.breakLabel}>Subtotal</Text>
                        <Text style={styles.breakValue}>
                          {currencySymbol}
                          {(payItemDiscount > 0
                            ? payGrossTotal
                            : subtotal
                          ).toFixed(2)}
                        </Text>
                      </View>

                      {discountAmount + payItemDiscount > 0 && (
                        <>
                          <View style={styles.breakRow}>
                            <Text
                              style={[
                                styles.breakLabel,
                                { color: Theme.danger },
                              ]}
                            >
                              Discount
                            </Text>
                            <Text
                              style={[
                                styles.breakValue,
                                { color: Theme.danger },
                              ]}
                            >
                              -{currencySymbol}
                              {(discountAmount + payItemDiscount).toFixed(2)}
                            </Text>
                          </View>
                          <View style={styles.receiptDivider} />
                          <View style={styles.breakRow}>
                            <Text style={styles.breakLabel}>Net Amount</Text>
                            <Text style={styles.breakValue}>
                              {currencySymbol}
                              {netAfterDiscount.toFixed(2)}
                            </Text>
                          </View>
                        </>
                      )}

                      {displayedServiceCharge > 0 && (
                        <View style={styles.breakRow}>
                          <Text style={styles.breakLabel}>
                            {allItemsHaveSC
                              ? "Service Charge"
                              : "Item Service Charge"}{" "}
                            ({settingsStore.serviceChargePercentage || 0}%)
                          </Text>
                          <Text style={styles.breakValue}>
                            {currencySymbol}
                            {displayedServiceCharge.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      {displayedTax > 0 && (
                        <View style={styles.breakRow}>
                          <Text style={styles.breakLabel}>
                            GST ({settingsStore.gstPercentage || 0}%)
                          </Text>
                          <Text style={styles.breakValue}>
                            {currencySymbol}
                            {displayedTax.toFixed(2)}
                          </Text>
                        </View>
                      )}

                      {displayedRoundOff !== 0 && (
                        <View style={styles.breakRow}>
                          <Text
                            style={[
                              styles.breakLabel,
                              { color: Theme.primary },
                            ]}
                          >
                            Rounding
                          </Text>
                          <Text
                            style={[
                              styles.breakValue,
                              { color: Theme.primary },
                            ]}
                          >
                            {displayedRoundOff > 0 ? "+" : ""}
                            {currencySymbol}
                            {displayedRoundOff.toFixed(2)}
                          </Text>
                        </View>
                      )}

                      <View style={styles.receiptDivider} />
                      <View style={styles.breakRow}>
                        <Text
                          style={[
                            styles.breakLabel,
                            {
                              fontFamily: Fonts.bold,
                              color: Theme.textPrimary,
                            },
                          ]}
                        >
                          Payable
                        </Text>
                        <Text
                          style={[
                            styles.breakValue,
                            {
                              fontFamily: Fonts.bold,
                              color: Theme.textPrimary,
                            },
                          ]}
                        >
                          {currencySymbol}
                          {total.toFixed(2)}
                        </Text>
                      </View>
                      {isCashMethod(method) && (
                        <>
                          <View style={styles.receiptDivider} />
                          <View style={styles.roundingContainer}>
                            <View style={styles.roundingHeader}>
                              <Text style={styles.roundingLabel}>Rounding</Text>
                              {roundType && (
                                <TouchableOpacity
                                  onPress={() => {
                                    setRoundOff(0);
                                    setRoundType(null);
                                    if (method === "CAS")
                                      setCashInput(baseTotal.toFixed(2));
                                  }}
                                >
                                  <Text style={styles.resetTextLink}>
                                    Reset
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <TouchableOpacity
                                style={[
                                  styles.roundingToggleBtn,
                                  roundType === "ten" &&
                                    styles.activeRoundingBtn,
                                ]}
                                onPress={() => {
                                  if (roundType === "ten") {
                                    setRoundOff(0);
                                    setRoundType(null);
                                    if (method === "CAS")
                                      setCashInput(baseTotal.toFixed(2));
                                  } else {
                                    const target =
                                      Math.round(baseTotal * 10) / 10;
                                    setRoundOff(target - baseTotal);
                                    setRoundType("ten");
                                    if (method === "CAS")
                                      setCashInput(target.toFixed(2));
                                  }
                                }}
                              >
                                <Ionicons
                                  name={
                                    roundType === "ten"
                                      ? "checkmark-circle"
                                      : "radio-button-off"
                                  }
                                  size={18}
                                  color={
                                    roundType === "ten" ? "#fff" : Theme.primary
                                  }
                                />
                                <Text
                                  style={[
                                    styles.roundingToggleText,
                                    roundType === "ten" &&
                                      styles.activeRoundingText,
                                  ]}
                                >
                                  {roundType === "ten"
                                    ? "Rounded to .10"
                                    : "Round to .10"}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.moreAdjustBtn}
                                onPress={() =>
                                  setIsAdjustmentModalVisible(true)
                                }
                              >
                                <Ionicons
                                  name="options"
                                  size={18}
                                  color={Theme.primary}
                                />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                  {isLedgerCollection ? (
                    <View style={styles.orderItemsCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>
                          Ledger Collection Details
                        </Text>
                      </View>
                      <View
                        style={{
                          padding: 16,
                          backgroundColor: Theme.bgInput,
                          borderRadius: 8,
                          gap: 10,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: Fonts.bold,
                              color: Theme.textSecondary,
                            }}
                          >
                            Customer Name
                          </Text>
                          <Text
                            style={{
                              fontFamily: Fonts.black,
                              color: Theme.textPrimary,
                            }}
                          >
                            {memberName}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: Fonts.bold,
                              color: Theme.textSecondary,
                            }}
                          >
                            Phone Number
                          </Text>
                          <Text
                            style={{
                              fontFamily: Fonts.black,
                              color: Theme.textPrimary,
                            }}
                          >
                            {memberPhone}
                          </Text>
                        </View>
                        <View
                          style={{
                            height: 1,
                            backgroundColor: Theme.border,
                            marginVertical: 4,
                          }}
                        />
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: Fonts.bold,
                              color: Theme.textSecondary,
                            }}
                          >
                            Amount to Collect
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: Theme.bgCard,
                              borderWidth: 1,
                              borderColor: Theme.border,
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              height: 40,
                              width: 140,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: Fonts.black,
                                color: Theme.textPrimary,
                                marginRight: 2,
                              }}
                            >
                              {currencySymbol}
                            </Text>
                            <TextInput
                              style={{
                                flex: 1,
                                fontFamily: Fonts.black,
                                color: Theme.primary,
                                fontSize: 16,
                                padding: 0,
                                ...Platform.select({
                                  web: { outlineStyle: "none" } as any,
                                }),
                              }}
                              value={collectionAmount}
                              onChangeText={handleAmountChange}
                              keyboardType="numeric"
                              placeholder="0.00"
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.orderItemsCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Order Items</Text>
                      </View>
                      <FlatList
                        data={finalItems}
                        keyExtractor={(_, index) => index.toString()}
                        renderItem={renderItem}
                        scrollEnabled={false}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {renderAdjustmentModal()}
      {renderTestDisplayModal()}
      <UPIPaymentModal
        visible={isUPIVisible}
        onClose={() => {
          setIsUPIVisible(false);
          setPendingPayments(null);
        }}
        amount={isSplitActive ? upiQrAmount : total}
        onSuccess={() =>
          executeFinalPayment(isSplitActive ? pendingPayments || [] : undefined)
        }
      />
      <PayNowPaymentModal
        visible={isPayNowVisible}
        onClose={() => {
          setIsPayNowVisible(false);
          setPendingPayments(null);
        }}
        amount={isSplitActive ? payNowQrAmount : total}
        onSuccess={() => {
          if (isSplitActive && upiQrAmount > 0) {
            setIsUPIVisible(true);
          } else {
            executeFinalPayment(
              isSplitActive ? pendingPayments || [] : undefined,
            );
          }
        }}
      />

      {/* MEMBER SEARCH MODAL */}
      <Modal
        visible={showMemberModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMemberModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMemberModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.memberModalContent}>
                <View style={styles.adjustModalHeader}>
                  <Text style={styles.adjustModalTitle}>
                    {isQuickAddMode
                      ? method.trim().toUpperCase() === "CREDIT"
                        ? "Quick Add Credit Account"
                        : "Quick Add Member"
                      : method.trim().toUpperCase() === "CREDIT"
                        ? "Select Credit Customer"
                        : "Select Member"}
                  </Text>
                  <TouchableOpacity onPress={() => setShowMemberModal(false)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                  showsVerticalScrollIndicator={false}
                >
                  {isQuickAddMode ? (
                    /* QUICK ADD FORM */
                    <View style={styles.quickAddForm}>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Customer Name *</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="Enter full name"
                          placeholderTextColor={Theme.textMuted || "#999"}
                          value={newName}
                          onChangeText={setNewName}
                          {...Platform.select({
                            web: { outlineStyle: "none" } as any,
                          })}
                        />
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Phone Number *</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity
                            style={[
                              styles.formInput,
                              {
                                width: 85,
                                justifyContent: "center",
                                alignItems: "center",
                                flexDirection: "row",
                                gap: 4,
                              },
                            ]}
                            onPress={() => setShowCountryCodeModal(true)}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: Fonts.bold,
                                color: Theme.textPrimary,
                              }}
                            >
                              {selectedCountryCode}
                            </Text>
                            <Ionicons
                              name="chevron-down"
                              size={12}
                              color={Theme.textSecondary}
                            />
                          </TouchableOpacity>
                          <TextInput
                            style={[styles.formInput, { flex: 1 }]}
                            placeholder="Enter phone number"
                            placeholderTextColor={Theme.textMuted || "#999"}
                            value={newPhone}
                            onChangeText={setNewPhone}
                            keyboardType="phone-pad"
                            {...Platform.select({
                              web: { outlineStyle: "none" } as any,
                            })}
                          />
                        </View>
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Email Address</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="Enter email address"
                          placeholderTextColor={Theme.textMuted || "#999"}
                          value={newEmail}
                          onChangeText={setNewEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          {...Platform.select({
                            web: { outlineStyle: "none" } as any,
                          })}
                        />
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Address</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="Enter address"
                          placeholderTextColor={Theme.textMuted || "#999"}
                          value={newAddress}
                          onChangeText={setNewAddress}
                          {...Platform.select({
                            web: { outlineStyle: "none" } as any,
                          })}
                        />
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>
                          Default Credit Limit ({currencySymbol})
                        </Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="e.g. 1000"
                          placeholderTextColor={Theme.textMuted || "#999"}
                          value={newCreditLimit}
                          onChangeText={setNewCreditLimit}
                          keyboardType="numeric"
                          {...Platform.select({
                            web: { outlineStyle: "none" } as any,
                          })}
                        />
                      </View>
                      <View
                        style={[
                          styles.formField,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 4,
                          },
                        ]}
                      >
                        <Text style={styles.formLabel}>
                          Account Status (Active)
                        </Text>
                        <TouchableOpacity
                          style={{
                            width: 48,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: newIsActive
                              ? Theme.primary
                              : Theme.border,
                            justifyContent: "center",
                            paddingHorizontal: 2,
                          }}
                          onPress={() => setNewIsActive(!newIsActive)}
                        >
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              backgroundColor: "#fff",
                              alignSelf: newIsActive
                                ? "flex-end"
                                : "flex-start",
                              ...Theme.shadowSm,
                            }}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* SEARCH & LIST WORKFLOW */
                    <>
                      {/* Quick Add Toggle Button */}
                      <TouchableOpacity
                        style={styles.quickAddToggleBtn}
                        onPress={() => {
                          setIsQuickAddMode(true);
                          if (memberQuery && isNaN(Number(memberQuery))) {
                            setNewName(memberQuery);
                          } else if (memberQuery) {
                            setNewPhone(memberQuery);
                          }
                        }}
                      >
                        <Ionicons
                          name="person-add"
                          size={16}
                          color={Theme.primary}
                        />
                        <Text style={styles.quickAddToggleText}>
                          + Quick Add New Customer
                        </Text>
                      </TouchableOpacity>

                      {/* Search Bar */}
                      <View style={styles.searchBarBox}>
                        <Ionicons
                          name="search"
                          size={20}
                          color={Theme.textSecondary}
                          style={{ marginRight: 8 }}
                        />
                        <TextInput
                          style={{
                            flex: 1,
                            fontSize: 16,
                            fontFamily: Fonts.medium,
                            color: Theme.textPrimary,
                            height: "100%",
                            borderWidth: 0,
                            marginLeft: 8,
                            ...Platform.select({
                              web: { outlineStyle: "none" } as any,
                            }),
                          }}
                          placeholder="Search by Name or Phone..."
                          placeholderTextColor={Theme.textMuted || "#999"}
                          value={memberQuery}
                          onChangeText={setMemberQuery}
                          autoFocus
                        />
                        {searchingMembers && (
                          <ActivityIndicator
                            size="small"
                            color={Theme.primary}
                          />
                        )}
                      </View>

                      {/* Members List */}
                      <View style={{ marginVertical: 8 }}>
                        {members.length === 0 ? (
                          <View
                            style={{
                              alignItems: "center",
                              justifyContent: "center",
                              paddingVertical: 40,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: Fonts.medium,
                                color: Theme.textSecondary,
                              }}
                            >
                              No members found
                            </Text>
                          </View>
                        ) : (
                          members.map((item) => {
                            const isSelected =
                              selectedMember?.MemberId === item.MemberId;
                            const remainingCredit =
                              (item.CreditLimit || 0) -
                              (item.CurrentBalance || 0);
                            const isLimitExceeded =
                              (item.CurrentBalance || 0) + total >
                              (item.CreditLimit || 0);
                            return (
                              <TouchableOpacity
                                key={item.MemberId}
                                style={[
                                  styles.memberListItem,
                                  isSelected && styles.selectedMemberItem,
                                  !item.IsActive && { opacity: 0.5 },
                                ]}
                                disabled={!item.IsActive}
                                onPress={() => {
                                  if (!item.IsActive) {
                                    showToast({
                                      type: "warning",
                                      message: "Inactive Member",
                                      subtitle: "Cannot select inactive member",
                                    });
                                    return;
                                  }
                                  // Select member only — payment is completed via "Complement Settlement" button below
                                  setSelectedMember(item);
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.memberNameText,
                                        isSelected && { color: Theme.primary },
                                      ]}
                                    >
                                      {item.Name}
                                    </Text>
                                    {!item.IsActive && (
                                      <View style={styles.inactiveBadge}>
                                        <Text style={styles.inactiveBadgeText}>
                                          INACTIVE
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.memberPhoneText}>
                                    {item.Phone}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontFamily: Fonts.medium,
                                      color: Theme.textMuted,
                                      marginTop: 4,
                                    }}
                                  >
                                    Limit:{" "}
                                    {formatMoney(
                                      currencySymbol,
                                      item.CreditLimit || 0,
                                    )}{" "}
                                    | Outstanding:{" "}
                                    {formatMoney(
                                      currencySymbol,
                                      item.CurrentBalance || 0,
                                    )}
                                  </Text>
                                </View>
                                <View style={{ alignItems: "flex-end" }}>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontFamily: Fonts.bold,
                                      color: isLimitExceeded
                                        ? Theme.danger
                                        : Theme.success,
                                    }}
                                  >
                                    Avail:{" "}
                                    {formatMoney(
                                      currencySymbol,
                                      remainingCredit,
                                    )}
                                  </Text>
                                  {isLimitExceeded && (
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontFamily: Fonts.medium,
                                        color: Theme.danger,
                                        marginTop: 2,
                                      }}
                                    >
                                      Limit Exceeded
                                    </Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>

                      {/* Selected Member Details & Confirmation */}
                      {selectedMember && (
                        <View style={styles.selectedMemberDetailCard}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontFamily: Fonts.black,
                              color: Theme.textPrimary,
                            }}
                          >
                            SELECTED ACCOUNT
                          </Text>
                          <View style={{ marginTop: 6, gap: 4 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontFamily: Fonts.bold,
                                color: Theme.primary,
                              }}
                            >
                              {selectedMember.Name} ({selectedMember.Phone})
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                marginTop: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: Fonts.medium,
                                  color: Theme.textSecondary,
                                }}
                              >
                                Bill Amount:
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: Fonts.bold,
                                  color: Theme.textPrimary,
                                }}
                              >
                                {formatMoney(currencySymbol, total)}
                              </Text>
                            </View>
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: Fonts.medium,
                                  color: Theme.textSecondary,
                                }}
                              >
                                Remaining Credit:
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontFamily: Fonts.bold,
                                  color: Theme.textPrimary,
                                }}
                              >
                                {formatMoney(
                                  currencySymbol,
                                  selectedMember.CreditLimit -
                                    selectedMember.CurrentBalance,
                                )}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>

                {/* Fixed bottom actions outside ScrollView */}
                {isQuickAddMode ? (
                  <View style={styles.adjustModalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setIsQuickAddMode(false)}
                    >
                      <Text
                        style={{
                          color: Theme.textSecondary,
                          fontFamily: Fonts.bold,
                        }}
                      >
                        Back to Search
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.confirmBtn,
                        addingMember && { opacity: 0.7 },
                      ]}
                      disabled={addingMember}
                      onPress={handleQuickAddMember}
                    >
                      {addingMember ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontFamily: Fonts.bold }}>
                          Save & Select
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.adjustModalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setShowMemberModal(false)}
                    >
                      <Text
                        style={{
                          color: Theme.textSecondary,
                          fontFamily: Fonts.bold,
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    {selectedMember && (
                      <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={() => {
                          // Only close the modal and confirm member selection.
                          // Payment is finalized by pressing "Complement Settlement" on the payment screen.
                          setShowMemberModal(false);
                        }}
                      >
                        <Text style={{ color: "#fff", fontFamily: Fonts.bold }}>
                          Confirm
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {showCountryCodeModal && (
        <Modal
          visible={showCountryCodeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCountryCodeModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCountryCodeModal(false)}
          >
            <View
              style={[
                styles.adjustModalContent,
                { maxHeight: "60%", width: "80%" },
              ]}
            >
              <View style={styles.adjustModalHeader}>
                <Text style={styles.adjustModalTitle}>Select Country Code</Text>
                <TouchableOpacity
                  onPress={() => setShowCountryCodeModal(false)}
                >
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {[
                  { code: "+65", label: "Singapore (+65)", flag: "🇸🇬" },
                  { code: "+60", label: "Malaysia (+60)", flag: "🇲🇾" },
                  { code: "+971", label: "UAE (+971)", flag: "🇦🇪" },
                  { code: "+91", label: "India (+91)", flag: "🇮🇳" },
                  { code: "+1", label: "US/Canada (+1)", flag: "🇺🇸" },
                  { code: "+44", label: "UK (+44)", flag: "🇬🇧" },
                  { code: "+61", label: "Australia (+61)", flag: "🇦🇺" },
                  { code: "+62", label: "Indonesia (+62)", flag: "🇮🇩" },
                  { code: "+66", label: "Thailand (+66)", flag: "🇹🇭" },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 12,
                      borderBottomWidth: 0.5,
                      borderBottomColor: Theme.border,
                    }}
                    onPress={() => {
                      setSelectedCountryCode(c.code);
                      setShowCountryCodeModal(false);
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: Fonts.bold,
                        color: Theme.textPrimary,
                      }}
                    >
                      {c.flag} {c.label}
                    </Text>
                    {selectedCountryCode === c.code && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={Theme.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1, padding: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  orderInfo: { alignItems: "center", flex: 1 },
  orderTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  orderBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontFamily: Fonts.black },
  tableBadge: {
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  tableBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  orderSub: {
    color: Theme.textSecondary,
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  mainLayout: { gap: 15 },
  leftPane: {
    padding: 15,
    borderRadius: 20,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  methodsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 15,
  },
  methodCard: {
    width: "31.8%",
    height: 70,
    backgroundColor: Theme.bgMuted,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 4,
  },
  activeMethodCard: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowMd,
  },
  methodIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  activeIconBox: { backgroundColor: "rgba(255,255,255,0.2)" },
  methodLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  activeMethodLabel: { color: "#fff" },
  cashSection: { marginTop: 5 },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cashInputBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: Theme.border,
    marginBottom: 12,
  },
  currencyPrefix: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginRight: 8,
  },
  cashInput: {
    flex: 1,
    fontSize: 24,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  quickCashContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 15,
  },
  quickCashBtn: {
    minWidth: 54,
    height: 38,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  activeQuickCashBtn: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primaryBorder,
  },
  quickCashText: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  activeQuickCashText: { color: Theme.primary },
  changeBox: {
    padding: 12,
    backgroundColor: Theme.primaryLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    marginBottom: 15,
  },
  changeLabel: {
    fontSize: 9,
    fontFamily: Fonts.black,
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  changeValue: { fontSize: 26, fontFamily: Fonts.black, color: Theme.primary },
  completeBtn: {
    height: 50,
    backgroundColor: Theme.primary,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    ...Theme.shadowLg,
  },
  completeBtnText: { fontSize: 16, fontFamily: Fonts.black, color: "#fff" },
  splitToggleBtn: {
    height: 50,
    backgroundColor: "transparent",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.primary,
    borderStyle: "dashed",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  splitToggleBtnText: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  rightPane: { flex: 0.7, gap: 15 },
  summaryCard: {
    padding: 18,
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  summaryHeader: {
    marginBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryTotal: {
    fontSize: 30,
    fontFamily: Fonts.black,
    color: Theme.primary,
    lineHeight: 34,
  },
  breakdown: { gap: 8 },
  breakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakLabel: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Theme.textSecondary,
  },
  breakValue: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  roundingContainer: { marginTop: 8 },
  roundingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  roundingLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  resetTextLink: { fontSize: 11, fontFamily: Fonts.bold, color: Theme.danger },
  roundingToggleBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: Theme.primaryBorder,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  activeRoundingBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  roundingToggleText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  activeRoundingText: { color: "#fff" },
  moreAdjustBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  orderItemsCard: {
    flex: 1,
    padding: 20,
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  itemQty: {
    width: 30,
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  itemPrice: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary },
  itemVoidedText: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  itemSubText: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
    fontFamily: Fonts.medium,
  },
  itemDiscountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  itemOriginalPrice: {
    fontSize: 11,
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  itemDiscountBadge: {
    backgroundColor: "#22C55E15",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#22C55E30",
  },
  itemDiscountBadgeText: {
    color: "#15803D",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  itemTwBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Theme.danger + "30",
    marginLeft: 6,
  },
  itemTwBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.black,
    color: Theme.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  adjustModalContent: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
  },
  adjustModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  adjustModalTitle: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  adjustPresets: { gap: 10, marginBottom: 20 },
  presetItem: {
    backgroundColor: Theme.bgMuted,
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  presetLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  presetValue: { fontSize: 13, fontFamily: Fonts.black, color: Theme.primary },
  customInputSection: { marginBottom: 20 },
  inputLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  customInputRow: { flexDirection: "row", gap: 8 },
  adjustTextInput: {
    flex: 1,
    height: 46,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  applyBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
  },
  applyBtnText: { color: "#fff", fontFamily: Fonts.bold, fontSize: 13 },
  resetBtnFull: { height: 44, justifyContent: "center", alignItems: "center" },
  resetBtnText: { color: Theme.danger, fontFamily: Fonts.bold, fontSize: 13 },
  mobileSummaryCard: {
    backgroundColor: Theme.primary + "10",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.primary + "20",
  },
  mobileSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileSummaryLabel: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  mobileSummaryTotal: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  mobileAdjustBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  mobileAdjustText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  mobileDiscountText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.danger,
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 16,
  },
  linkSection: {
    alignItems: "center",
    marginTop: 5,
  },
  linkTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  linkSub: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginBottom: 12,
    alignSelf: "flex-start",
    lineHeight: 15,
  },
  qrContainer: {
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  urlText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.primary,
    marginBottom: 12,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  openBtn: {
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: "100%",
  },
  openBtnText: {
    color: "#fff",
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  memberModalContent: {
    width: "90%",
    maxWidth: 550,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    ...Theme.shadowLg,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: Theme.bgInput || "#f8f9fa",
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    marginTop: 10,
    ...Theme.shadowSm,
  },
  memberListItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    borderRadius: 8,
  },
  selectedMemberItem: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primaryBorder,
    borderWidth: 1,
  },
  memberNameText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  memberPhoneText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  inactiveBadge: {
    backgroundColor: Theme.danger + "22",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Theme.danger + "40",
  },
  inactiveBadgeText: {
    fontSize: 8,
    fontFamily: Fonts.bold,
    color: Theme.danger,
  },
  selectedMemberDetailCard: {
    padding: 12,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  adjustModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  // Credit / Member Section Styles
  creditMemberSection: {
    marginTop: 5,
    marginBottom: 10,
  },
  selectedCreditCard: {
    backgroundColor: Theme.bgMuted,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  creditIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  creditCardName: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  creditCardPhone: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  changeCreditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    backgroundColor: Theme.primaryLight,
  },
  changeCreditBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  creditCardStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.border + "30",
  },
  creditStatCol: {
    flex: 1,
    alignItems: "center",
  },
  creditStatLabel: {
    fontSize: 9,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  creditStatValue: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
  },
  limitExceededBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.danger + "10",
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: Theme.danger + "20",
  },
  limitExceededText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.danger,
    flex: 1,
  },
  selectCreditPrompt: {
    backgroundColor: Theme.bgCard,
    borderWidth: 1.5,
    borderColor: Theme.primaryBorder,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  selectCreditPromptInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  selectCreditPromptTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  selectCreditPromptSub: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  quickAddToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Theme.primaryLight,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    borderRadius: 12,
    marginVertical: 8,
  },
  quickAddToggleText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  quickAddForm: {
    gap: 12,
    marginVertical: 10,
  },
  formField: {
    gap: 4,
  },
  formLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  formInput: {
    height: 46,
    backgroundColor: Theme.bgInput || "#f8f9fa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
});
