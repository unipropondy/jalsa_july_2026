import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../../components/Toast";

interface CustomDateTimePickerProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onApply: (date: Date) => void;
  title: string;
  mode?: "date" | "datetime";
}

function CustomDateTimePicker({ visible, onClose, selectedDate, onApply, title, mode = "datetime" }: CustomDateTimePickerProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 640;

  const [viewDate, setViewDate] = useState(() => new Date(selectedDate));
  const [selectedDay, setSelectedDay] = useState(() => new Date(selectedDate));

  // Time states
  const [hour, setHour] = useState(() => {
    let h = selectedDate.getHours();
    h = h % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState(() => selectedDate.getMinutes());
  const [amPm, setAmPm] = useState<"AM" | "PM">(() => selectedDate.getHours() >= 12 ? "PM" : "AM");

  // Sync state when selectedDate changes or modal opens
  useEffect(() => {
    if (visible) {
      setViewDate(new Date(selectedDate));
      setSelectedDay(new Date(selectedDate));
      let h = selectedDate.getHours();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12;
      setHour(h === 0 ? 12 : h);
      setMinute(selectedDate.getMinutes());
      setAmPm(ampm);
    }
  }, [visible, selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Navigation handlers
  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Days list computation
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const arr = [];
    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      arr.push({
        day: prevMonthDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false,
      });
    }
    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      arr.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
      });
    }
    // Next month padding
    const totalCells = arr.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      arr.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false,
      });
    }
    return arr;
  }, [year, month]);

  const handleDaySelect = (dayObj: typeof days[0]) => {
    setSelectedDay(new Date(dayObj.year, dayObj.month, dayObj.day));
  };

  // Time adjustment helpers
  const adjustHour = (amount: number) => {
    setHour(prev => {
      let next = prev + amount;
      if (next > 12) return 1;
      if (next < 1) return 12;
      return next;
    });
  };

  const adjustMinute = (amount: number) => {
    setMinute(prev => {
      let next = prev + amount;
      if (next > 59) return 0;
      if (next < 0) return 59;
      return next;
    });
  };

  const handleApply = () => {
    const finalDate = new Date(selectedDay);
    if (mode === "datetime") {
      let finalHours = hour % 12;
      if (amPm === "PM") {
        finalHours += 12;
      }
      finalDate.setHours(finalHours, minute, 0, 0);
    } else {
      finalDate.setHours(0, 0, 0, 0);
    }
    onApply(finalDate);
    onClose();
  };

  const formatSummaryStr = () => {
    const d = selectedDay.getDate().toString().padStart(2, '0');
    const m = (selectedDay.getMonth() + 1).toString().padStart(2, '0');
    const y = selectedDay.getFullYear();
    if (mode === "date") return `${d}-${m}-${y}`;
    const h = hour.toString().padStart(2, '0');
    const minStr = minute.toString().padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${minStr} ${amPm}`;
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={[
          pickerStyles.modalContainer,
          mode === 'date' && isTablet && { width: 380 },
          mode === 'date' && !isTablet && { width: 360 },
          !isTablet && { flexDirection: 'column', width: '95%', padding: 16 }
        ]}>
          {/* Header */}
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>{title}</Text>
            <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#44403C" />
            </TouchableOpacity>
          </View>

          {/* Columns Container */}
          <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 20 }}>
            {/* Left Side: Calendar */}
            <View style={{ flex: 1 }}>
              {/* Calendar Navigator */}
              <View style={pickerStyles.calNavigator}>
                <TouchableOpacity onPress={prevMonth} style={pickerStyles.navBtn}>
                  <Ionicons name="chevron-back" size={16} color="#44403C" />
                </TouchableOpacity>
                <Text style={pickerStyles.monthYearText}>{monthNames[month]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={pickerStyles.navBtn}>
                  <Ionicons name="chevron-forward" size={16} color="#44403C" />
                </TouchableOpacity>
              </View>

              {/* Weekdays Row */}
              <View style={pickerStyles.weekdaysRow}>
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((wd, i) => (
                  <Text key={i} style={pickerStyles.weekdayText}>{wd}</Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={pickerStyles.daysGrid}>
                {days.map((dObj, idx) => {
                  const isSelected = selectedDay.getDate() === dObj.day &&
                    selectedDay.getMonth() === dObj.month &&
                    selectedDay.getFullYear() === dObj.year;

                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleDaySelect(dObj)}
                      style={[
                        pickerStyles.dayBtn,
                        isSelected && pickerStyles.dayBtnSelected
                      ]}
                    >
                      <Text style={[
                        pickerStyles.dayText,
                        !dObj.isCurrentMonth && pickerStyles.dayTextInactive,
                        isSelected && pickerStyles.dayTextSelected
                      ]}>
                        {dObj.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Vertical Divider */}
            {isTablet && mode === "datetime" && <View style={pickerStyles.verticalDivider} />}

            {/* Right Side: Time */}
            {mode === "datetime" && (
              <View style={[pickerStyles.timePanel, !isTablet && { width: '100%', marginTop: 10 }]}>
                <Text style={pickerStyles.setTimeTitle}>SET TIME</Text>

                {/* Picker Blocks */}
                <View style={pickerStyles.timePickersRow}>
                  {/* Hour */}
                  <View style={pickerStyles.timeBlock}>
                    <TouchableOpacity onPress={() => adjustHour(1)} style={pickerStyles.arrowBtn}>
                      <Ionicons name="chevron-up" size={18} color="#44403C" />
                    </TouchableOpacity>
                    <TextInput
                      style={[pickerStyles.timeInputBox, { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, textAlign: 'center' }]}
                      value={hour.toString().padStart(2, '0')}
                      onChangeText={(v) => {
                        const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(n) && n >= 1 && n <= 12) setHour(n);
                      }}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <TouchableOpacity onPress={() => adjustHour(-1)} style={pickerStyles.arrowBtn}>
                      <Ionicons name="chevron-down" size={18} color="#44403C" />
                    </TouchableOpacity>
                    <Text style={pickerStyles.timeLabel}>Hour</Text>
                  </View>

                  {/* Separator */}
                  <Text style={pickerStyles.timeSeparator}>:</Text>

                  {/* Minute */}
                  <View style={pickerStyles.timeBlock}>
                    <TouchableOpacity onPress={() => adjustMinute(1)} style={pickerStyles.arrowBtn}>
                      <Ionicons name="chevron-up" size={18} color="#44403C" />
                    </TouchableOpacity>
                    <TextInput
                      style={[pickerStyles.timeInputBox, { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, textAlign: 'center' }]}
                      value={minute.toString().padStart(2, '0')}
                      onChangeText={(v) => {
                        const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(n) && n >= 0 && n <= 59) setMinute(n);
                      }}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <TouchableOpacity onPress={() => adjustMinute(-1)} style={pickerStyles.arrowBtn}>
                      <Ionicons name="chevron-down" size={18} color="#44403C" />
                    </TouchableOpacity>
                    <Text style={pickerStyles.timeLabel}>Min</Text>
                  </View>

                  {/* AM/PM */}
                  <View style={[pickerStyles.timeBlock, { justifyContent: 'center' }]}>
                    <TouchableOpacity
                      onPress={() => setAmPm(prev => prev === "AM" ? "PM" : "AM")}
                      style={[pickerStyles.ampmBtn, pickerStyles.ampmBtnActive]}
                    >
                      <Text style={pickerStyles.ampmBtnTextActive}>{amPm}</Text>
                    </TouchableOpacity>
                    <Text style={[pickerStyles.timeLabel, { marginTop: 12 }]}>AM/PM</Text>
                  </View>
                </View>

                {/* Summary Display */}
                <View style={pickerStyles.summaryCard}>
                  <Text style={pickerStyles.summaryLabel}>Selected Date-Time:</Text>
                  <Text style={pickerStyles.summaryValue}>{formatSummaryStr()}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Footer Actions */}
          <View style={pickerStyles.footer}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose}>
              <Text style={pickerStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pickerStyles.applyBtn} onPress={handleApply}>
              <Text style={pickerStyles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: 620,
    maxWidth: '95%',
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      }
    }) as any,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: '#9CA3AF',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayBtn: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 8,
  },
  dayBtnSelected: {
    backgroundColor: '#F97316', // Orange theme
  },
  dayText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  dayTextInactive: {
    color: '#D1D5DB',
  },
  dayTextSelected: {
    color: '#fff',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  timePanel: {
    width: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTimeTitle: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 16,
  },
  timePickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  timeBlock: {
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 2,
  },
  timeInputBox: {
    width: 50,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeValueText: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  timeSeparator: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginTop: -18,
  },
  ampmBtn: {
    width: 60,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22, // align with inputs vertically
  },
  ampmBtnActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  ampmBtnTextActive: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: '#F97316',
  },
  timeLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: '#9CA3AF',
    marginTop: 4,
  },
  summaryCard: {
    width: '100%',
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#F97316',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F5F5F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#44403C',
  },
  applyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#fff',
  },
});

export default function SettlementScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, token } = useAuthStore();
  const canAccessDayEnd = useAuthStore((s: any) => s.canAccessDayEnd);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string>("");
  const [showLov, setShowLov] = useState(false);

  const [totalSales, setTotalSales] = useState<any>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  // Cash Out State
  const [cashOutEntries, setCashOutEntries] = useState<any[]>([]);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showCashBoxModal, setShowCashBoxModal] = useState(false);
  const [cashOutForm, setCashOutForm] = useState({
    CashOutId: '',
    Amount: '',
    Reason: '',
    Remarks: '',
    PaymentMode: 'Cash',
    ReferenceNo: ''
  });
  const [cashBoxForm, setCashBoxForm] = useState({
    ArtistName: '',
    Amount: ''
  });
  const [lovMode, setLovMode] = useState<"OPEN" | "CLOSE">("OPEN");

  const [openingCash, setOpeningCash] = useState<string>("0");

  const [dishList, setDishList] = useState<any[]>([]);
  const [showDishLov, setShowDishLov] = useState(false);
  const [artistSearch, setArtistSearch] = useState("");

  const [fromDate, setFromDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [toDate, setToDate] = useState<Date>(new Date());

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [showDayendModal, setShowDayendModal] = useState(false);
  const [showDayendFromPicker, setShowDayendFromPicker] = useState(false);
  const [showDayendToPicker, setShowDayendToPicker] = useState(false);
  const [dayendRangeStart, setDayendRangeStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dayendRangeEnd, setDayendRangeEnd] = useState<Date>(new Date());

  const userId = user?.userId || "0";

  // Hardcoded denominations
  const denominations = [100.00, 50.00, 20.00, 10.00, 5.00, 2.00, 1.00, 0.50, 0.20, 0.10, 0.05, 0.01];

  const initialCounts: Record<string, string> = {
    "100.00": "", "50.00": "", "20.00": "", "10.00": "", "5.00": "", "2.00": "",
    "1.00": "", "0.50": "", "0.20": "", "0.10": "", "0.05": "", "0.01": ""
  };

  const [openingCounts, setOpeningCounts] = useState<Record<string, string>>(initialCounts);
  const [closingCounts, setClosingCounts] = useState<Record<string, string>>(initialCounts);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const formatDateTime = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const h = hours.toString().padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${minutes} ${ampm}`;
  };

  const handleCountChange = (denomStr: string, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    if (lovMode === "OPEN") {
      setOpeningCounts(prev => ({ ...prev, [denomStr]: cleaned }));
    } else {
      setClosingCounts(prev => ({ ...prev, [denomStr]: cleaned }));
    }
  };

  const computeTotal = (counts: Record<string, string>) => Object.entries(counts).reduce((sum, [denom, count]) => {
    const val = parseFloat(denom);
    const qty = parseInt(count, 10) || 0;
    return sum + val * qty;
  }, 0);

  const totalOpening = computeTotal(openingCounts);
  const totalClosing = computeTotal(closingCounts);

  useEffect(() => {
    loadTerminals();
    loadDishes();
  }, []);

  const loadTerminals = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/settlement/terminals`);
      const termData = res.data || [];
      setTerminals(termData);
      if (termData.length > 0) {
        setSelectedTerminal(termData[0].TerminalCode);
      } else {
        setSelectedTerminal("ALL");
      }
    } catch (err) {
      console.error("❌ TERMINAL LOAD ERROR", err);
      setSelectedTerminal("ALL");
    } finally {
      setLoading(false);
    }
  };

  const loadDishes = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/settlement/artist-list`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("ARTIST DATA =", res.data);

      setDishList(res.data.data || []);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    if (selectedTerminal) fetchData();
  }, [selectedTerminal, fromDate, toDate]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const fromStr = formatLocal(fromDate);
      const toStr = formatLocal(toDate);

      const totalRes = await axios.get(`${API_URL}/api/settlement/total-sales/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: {} }));
      const payRes = await axios.get(`${API_URL}/api/settlement/payment/${selectedTerminal}/${userId}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));
      const transRes = await axios.get(`${API_URL}/api/settlement/transactions/${selectedTerminal}/${userId}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));
      const salesRes = await axios.get(`${API_URL}/api/settlement/sales-summary/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));

      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;
      const dateStr = getLocalDateStr(fromDate); // Fetch opening cash for the fromDate
      const openRes = await axios.get(`${API_URL}/api/settlement/opening-cash?outletId=${outId}&date=${dateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const denomsRes = await axios.get(`${API_URL}/api/settlement/denominations?type=OPEN&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const closeDenomsRes = await axios.get(`${API_URL}/api/settlement/denominations?type=CLOSE&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashOutRes = await axios.get(`${API_URL}/api/settlement/cash-out/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));

      setTotalSales(totalRes.data || {});
      setPayments(payRes.data || []);
      setTransactions(transRes.data || []);
      setSales(salesRes.data || []);
      setCashOutEntries(cashOutRes.data?.data || []);

      if (openRes.data?.data?.total) {
        setOpeningCash(openRes.data.data.total.toString());
      } else if (openRes.data?.total) {
        setOpeningCash(openRes.data.total.toString());
      } else {
        setOpeningCash("0");
      }

      if (denomsRes.data?.success && Array.isArray(denomsRes.data.data)) {
        const newCounts: Record<string, string> = { ...initialCounts };
        denomsRes.data.data.forEach((d: any) => {
          const valStr = parseFloat(d.CurrencyValue).toFixed(2);
          if (newCounts[valStr] !== undefined) {
            newCounts[valStr] = d.NoteCount > 0 ? d.NoteCount.toString() : "";
          }
        });
        setOpeningCounts(newCounts);
      }

      if (closeDenomsRes.data?.success && Array.isArray(closeDenomsRes.data.data)) {
        const newCounts: Record<string, string> = { ...initialCounts };
        closeDenomsRes.data.data.forEach((d: any) => {
          const valStr = parseFloat(d.CurrencyValue).toFixed(2);
          if (newCounts[valStr] !== undefined) {
            newCounts[valStr] = d.NoteCount > 0 ? d.NoteCount.toString() : "";
          }
        });
        setClosingCounts(newCounts);
      }
    } catch (err) {
      console.error("❌ FETCH DATA ERROR", err);
      Alert.alert("Error", "Failed to load settlement data.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: any) => {
    const val = parseFloat(amount);
    if (isNaN(val)) return "0.00";
    return val.toFixed(2);
  };

  const netSales =
    (parseFloat(totalSales.SubTotal) || 0) +
    (parseFloat(totalSales.ServiceCharge) || 0) +
    (parseFloat(totalSales.TotalTax) || 0) -
    (parseFloat(totalSales.DiscountAmount) || 0);

  const salesTotal = sales.reduce((sum, s) => sum + (parseFloat(s.Amount) || 0), 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);
  const displayOpeningAmount = totalOpening > 0 ? totalOpening : (parseFloat(openingCash) || 0);
  const totalCashOut = cashOutEntries.reduce((sum, entry) => sum + (parseFloat(entry.Amount) || 0), 0);
  const cashBoxTotal = payments
    .filter(p => p.PaymodeName?.toUpperCase().includes("CASH BOX") || p.PaymodeName?.toUpperCase().includes("CASHBOX"))
    .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

  const regularPayments = payments.filter(p => !(p.PaymodeName?.toUpperCase().includes("CASH BOX") || p.PaymodeName?.toUpperCase().includes("CASHBOX")));

  const baseTransactionsTotal = transactions.reduce((sum, t) => {
    const amt = parseFloat(t.Amount) || 0;
    return sum + (t.TransactionType === "IN" ? amt : -amt);
  }, 0);

  const transactionsTotal = baseTransactionsTotal + displayOpeningAmount - totalCashOut;
  const salesCash = parseFloat(payments.find(p => p.PaymodeName?.toUpperCase() === 'CASH')?.Amount) || 0;

  const sysCash = salesCash + transactionsTotal;

  const totalCashIn = paymentsTotal + displayOpeningAmount + transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);
  const totalCashOutSum = totalCashOut + transactions.filter(t => t.TransactionType === "OUT").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);

  const handleFinalize = async () => {
    try {
      setLoading(true);

      const payload = {
        outletId: 1, // Fallback, backend handles this based on user
        settlementDate: getLocalDateStr(fromDate),
        cashierName: user?.userName || "Admin",
        totalSales: totalSales.SubTotal || 0,
        totalDiscount: totalSales.DiscountAmount || 0,
        voidAmount: 0,
        netSales: netSales,
        cashReceived: totalClosing,
        expectedClosing: sysCash,
        variance: totalClosing - sysCash,
        varianceStatus: totalClosing === sysCash ? "BALANCED" : (totalClosing > sysCash ? "SURPLUS" : "SHORTAGE"),
        openingCash: displayOpeningAmount,
        cashAmount: totalClosing,
        cardAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'CARD')?.Amount || 0,
        upiAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'UPI')?.Amount || 0,
        paynowAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'PAYNOW')?.Amount || 0,
        valueCardAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'VALUE CARD')?.Amount || 0,
      };

      const res = await axios.post(`${API_URL}/api/settlement/finalize`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        // After finalizing settlement, actually close the day by deleting the date entry
        try {
          await fetch(`${API_URL}/api/settings/delete-date`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
        } catch (delErr) {
          console.warn("Failed to delete date entry after finalize", delErr);
        }

        Alert.alert("Success", "Settlement finalized and Day Closed successfully!");
        router.back();
      } else {
        Alert.alert("Error", res.data.error || "Failed to finalize settlement");
      }
    } catch (err: any) {
      console.error("❌ FINALIZE ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to finalize settlement");
    } finally {
      setLoading(false);
    }
  };

  const handleClearDenominations = () => {
    if (lovMode === "OPEN") {
      setOpeningCounts(initialCounts);
    } else {
      setClosingCounts(initialCounts);
    }
  };

  const handleSaveDenominations = async () => {
    try {
      setLoading(true);
      const counts = lovMode === "OPEN" ? openingCounts : closingCounts;
      const denomsPayload = Object.entries(counts).map(([denom, count]) => ({
        value: parseFloat(denom),
        count: parseInt(count, 10) || 0
      }));

      const dateStr = getLocalDateStr(fromDate);
      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;

      const res = await axios.post(`${API_URL}/api/settlement/save-denominations`, {
        denominations: denomsPayload,
        type: lovMode,
        date: dateStr,
        outletId: outId,
        screenType: 'CB'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        if (lovMode === "OPEN") {
          setOpeningCash(totalOpening.toString());
        }
        setShowLov(false);
        Alert.alert("Success", `${lovMode === "OPEN" ? "Opening" : "Closing"} cash denominations saved.`);
      } else {
        Alert.alert("Error", res.data.error || "Failed to save denominations");
      }
    } catch (err: any) {
      console.error("❌ SAVE DENOMINATIONS ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to save denominations");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCashOut = async () => {
    if (!cashOutForm.Amount || parseFloat(cashOutForm.Amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        amount: parseFloat(cashOutForm.Amount),
        reason: cashOutForm.Reason,
        remarks: cashOutForm.Remarks,
        paymentMode: cashOutForm.PaymentMode,
        referenceNo: cashOutForm.ReferenceNo,
        terminalCode: selectedTerminal === "ALL" ? "" : selectedTerminal,
        date: getLocalDateStr(fromDate)
      };

      let res;
      if (cashOutForm.CashOutId) {
        res = await axios.put(`${API_URL}/api/settlement/cash-out/${cashOutForm.CashOutId}`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      } else {
        res = await axios.post(`${API_URL}/api/settlement/cash-out`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      if (res.data.success) {
        setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' });
        setShowCashOutModal(false);
        setToDate(new Date()); // Auto-update the "To" date so the new record falls within the filter range
        // Since setToDate triggers a re-fetch via useEffect, we don't strictly need fetchData() here,
        // but we'll leave it to guarantee a refresh.
        fetchData();
        Alert.alert("Success", "Cash Out entry saved");
      }
    } catch (err: any) {
      console.error("❌ SAVE CASH OUT ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to save cash out entry");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCashBox = async () => {
    try {

      await axios.post(
        `${API_URL}/api/settlement/artist-cashbox`,
        {
          ArtistName: cashBoxForm.ArtistName,
          Amount: parseFloat(cashBoxForm.Amount)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      Alert.alert("Success", "Cash Box Saved");

      setCashBoxForm({
        ArtistName: "",
        Amount: "",
      });

      setShowCashBoxModal(false);
      setToDate(new Date()); // Update To Date just like in cash out to ensure new data is caught
      fetchData(); // Refresh the report data

    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Failed to save");
    }
  };

  const executeDeleteCashOut = async (id: string) => {
    try {
      setLoading(true);
      const res = await axios.delete(`${API_URL}/api/settlement/cash-out/${id}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
      });
      if (res.data.success) {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to delete entry");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCashOut = async (id: string) => {
    if (!id) {
      Alert.alert("Error", "Invalid entry ID");
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to delete this cash out entry?")) {
        executeDeleteCashOut(id);
      }
    } else {
      Alert.alert("Confirm", "Are you sure you want to delete this cash out entry?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => executeDeleteCashOut(id) }
      ]);
    }
  };

  const handlePrintReport = async () => {
    try {
      // 1. Fetch Cashier Printer IP from settings
      let cashierIp = "";
      try {
        const response = await fetch(`${API_URL}/api/settings/kitchen-printers`);
        const printers = await response.json();
        if (Array.isArray(printers)) {
          const cashierPrinter = printers.find((p: any) => p.PrinterType === 1);
          cashierIp = cashierPrinter?.PrinterPath || "";
        }
      } catch (err) {
        console.warn("Failed to fetch printer IP from settings:", err);
      }

      // Helper function for robust reachability check
      const checkIpReachable = async (ip: string, port = 80, timeoutMs = 600): Promise<boolean> => {
        if (!ip || ip.trim() === "") return false;
        const cleanIp = ip.trim();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          await fetch(`http://${cleanIp}:${port}`, {
            method: "GET",
            signal: controller.signal,
            mode: "no-cors",
            headers: { "Cache-Control": "no-cache" }
          });
          clearTimeout(timer);
          return true;
        } catch (err: any) {
          clearTimeout(timer);
          if (err.name === "AbortError") {
            return false;
          }
          return true; // Connection refused/other error means host is online
        }
      };

      const fromDateStr = formatDateTime(fromDate).split(' ')[0];
      const toDateStr = formatDateTime(toDate).split(' ')[0];

      // 2. Format HTML aligned to 80mm width
      const html = `
        <html>
          <head>
            <style>
              @page { margin: 0; size: 80mm auto; }
              * { box-sizing: border-box; }
              body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 80mm; 
                padding: 4mm; 
                margin: 0; 
                color: #000; 
                background-color: #fff; 
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
                font-size: 13px;
                line-height: 1.2;
              }
              .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
              .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
              .double-divider { border-bottom: 2px double #000; margin: 10px 0; }
              .info-line { margin-bottom: 3px; }
              table { width: 100%; border-collapse: collapse; margin: 8px 0; }
              td { padding: 4px 0; font-size: 13px; vertical-align: top; }
              .right { text-align: right; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .header-row td { font-weight: bold; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 5px; }
              .section-row td { font-weight: bold; padding-top: 10px; padding-bottom: 5px; text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="title">Settlement Report</div>
            <div class="double-divider"></div>
            <div class="info-line">Period: ${fromDateStr} to ${toDateStr}</div>
            ${selectedTerminal !== "ALL" ? `<div class="info-line">Terminal: ${selectedTerminal}</div>` : ""}
            <div class="info-line">Generated: ${new Date().toLocaleTimeString()}</div>
            <div class="double-divider"></div>

            <table>
              <tr class="header-row">
                <td>Particulars</td>
                <td class="center" style="width: 15%;">Qty</td>
                <td class="right" style="width: 35%;">Amount</td>
              </tr>
              
              <tr class="section-row">
                <td colspan="3">Revenue Summary</td>
              </tr>
              <tr>
                <td>Gross Sales</td>
                <td class="center">${totalSales.InvoiceCount || '-'}</td>
                <td class="right">${formatCurrency(totalSales.SubTotal)}</td>
              </tr>
              <tr>
                <td>Total Discount</td>
                <td class="center">-</td>
                <td class="right">-${formatCurrency(totalSales.DiscountAmount)}</td>
              </tr>
              <tr>
                <td>Service Charge</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalSales.ServiceCharge)}</td>
              </tr>
              <tr>
                <td>Tax Collected (GST)</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalSales.TotalTax)}</td>
              </tr>
              <tr>
                <td>Rounding & Excess</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalSales.RoundedBy)}</td>
              </tr>
              <tr>
                <td>Tips</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalSales.Tips)}</td>
              </tr>
              <tr class="bold">
                <td>Net Sales</td>
                <td class="center">${totalSales.InvoiceCount || '-'}</td>
                <td class="right">${formatCurrency(netSales)}</td>
              </tr>

              <tr class="section-row">
                <td colspan="3">Payment Breakdown</td>
              </tr>
              <tr>
                <td>Opening Balance</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(displayOpeningAmount)}</td>
              </tr>
              ${payments.map(p => `
                <tr>
                   <td>${p.PaymodeName}</td>
                   <td class="center">-</td>
                   <td class="right">${formatCurrency(p.Amount)}</td>
                </tr>
              `).join('')}
              ${transactions.map(t => `
                <tr>
                   <td>${t.TransactionMode} (${t.TransactionType})</td>
                   <td class="center">-</td>
                   <td class="right">${t.TransactionType === "IN" ? formatCurrency(t.Amount) : '-' + formatCurrency(t.Amount)}</td>
                </tr>
              `).join('')}
              ${cashOutEntries.map(co => `
                <tr>
                   <td>${co.Reason || 'Cash Out'}</td>
                   <td class="center">-</td>
                   <td class="right">-${formatCurrency(co.Amount)}</td>
                </tr>
              `).join('')}
              <tr class="divider"><td colspan="3"></td></tr>
              <tr class="bold">
                <td>Total Collected (In)</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalCashIn)}</td>
              </tr>
              <tr class="bold">
                <td>Total Withdrawn (Out)</td>
                <td class="center">-</td>
                <td class="right">-${formatCurrency(totalCashOutSum)}</td>
              </tr>
              <tr class="bold" style="font-size: 14px;">
                <td>Net Total in Drawer</td>
                <td class="center">-</td>
                <td class="right">${formatCurrency(totalCashIn - totalCashOutSum)}</td>
              </tr>
            </table>
            <div class="double-divider"></div>
            <div class="center" style="font-size: 11px; margin-top: 15px;">SMART-POS BY UNIPROSG</div>
          </body>
        </html>
      `;

      // 3. Attempt silent IP printing first if IP is reachable
      let printedToHardware = false;
      const isIp = cashierIp && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cashierIp.trim());
      if (isIp && Platform.OS !== 'web') {
        try {
          // Check if IP reachable
          const ipReachable = await checkIpReachable(cashierIp.trim());

          if (ipReachable) {
            // Generate ESC/POS payload
            const formatTwoCols48 = (left: string, right: string) => {
              const cleanLeft = left.replace(/<[^>]*>/g, "");
              const cleanRight = right.replace(/<[^>]*>/g, "");
              const spaceCount = 48 - cleanLeft.length - cleanRight.length;
              return spaceCount > 0 ? `${left}${" ".repeat(spaceCount)}${right}\n` : `${left}\n${right.padStart(48, " ")}\n`;
            };

            let text = "[C]================================================\n";
            text += "[C]<font size='big'><B>SETTLEMENT REPORT</B></font>\n";
            text += "[C]================================================\n";
            text += `[C]Period: ${fromDateStr} to ${toDateStr}\n`;
            if (selectedTerminal !== "ALL") text += `[C]Terminal: ${selectedTerminal}\n`;
            text += `[C]Generated: ${new Date().toLocaleTimeString()}\n`;
            text += "[C]------------------------------------------------\n\n";

            text += "[L]<B>REVENUE SUMMARY</B>\n";
            text += "[L]------------------------------------------------\n";
            text += formatTwoCols48("Gross Sales (" + (totalSales.InvoiceCount || 0) + "):", formatCurrency(totalSales.SubTotal));
            text += formatTwoCols48("Total Discount:", "-" + formatCurrency(totalSales.DiscountAmount));
            text += formatTwoCols48("Service Charge:", formatCurrency(totalSales.ServiceCharge));
            text += formatTwoCols48("Tax Collected (GST):", formatCurrency(totalSales.TotalTax));
            text += formatTwoCols48("Rounding & Excess:", formatCurrency(totalSales.RoundedBy));
            text += formatTwoCols48("Tips:", formatCurrency(totalSales.Tips));
            text += "[L]------------------------------------------------\n";
            text += formatTwoCols48("<B>Net Sales:</B>", "<B>" + formatCurrency(netSales) + "</B>");
            text += "[L]------------------------------------------------\n\n";

            text += "[L]<B>PAYMENT BREAKDOWN</B>\n";
            text += "[L]------------------------------------------------\n";
            text += formatTwoCols48("Opening Balance:", formatCurrency(displayOpeningAmount));
            payments.forEach(p => {
              text += formatTwoCols48(p.PaymodeName + ":", formatCurrency(p.Amount));
            });
            transactions.forEach(t => {
              const sign = t.TransactionType === "IN" ? "" : "-";
              text += formatTwoCols48(t.TransactionMode + " (" + t.TransactionType + "):", sign + formatCurrency(t.Amount));
            });
            cashOutEntries.forEach(co => {
              text += formatTwoCols48((co.Reason || "Cash Out") + ":", "-" + formatCurrency(co.Amount));
            });
            text += "[L]------------------------------------------------\n";
            text += formatTwoCols48("<B>Total Collected (In):</B>", "<B>" + formatCurrency(totalCashIn) + "</B>");
            text += formatTwoCols48("<B>Total Withdrawn (Out):</B>", "<B>-" + formatCurrency(totalCashOutSum) + "</B>");
            text += "[L]------------------------------------------------\n";
            text += formatTwoCols48("<font size='big'><B>Net Total in Drawer:</B></font>", "<font size='big'><B>" + formatCurrency(totalCashIn - totalCashOutSum) + "</B></font>");
            text += "[C]================================================\n";
            text += "[C]SMART-POS BY UNIPROSG\n\n\n\n";

            const ThermalPrinter = require("react-native-thermal-printer").default;
            await ThermalPrinter.printTcp({
              ip: cashierIp.trim(),
              port: 9100,
              payload: text,
              mmFeedPaper: 60,
            });
            printedToHardware = true;
          }
        } catch (printErr) {
          console.warn("Direct IP print failed, fallback to system printing:", printErr);
        }
      }

      // 4. Try Sunmi direct print if Sunmi is detected
      if (!printedToHardware && Platform.OS === 'android') {
        try {
          const SunmiPrinterService = require("../../components/SunmiPrinterService").default;
          const sunmiReady = await SunmiPrinterService.init();
          if (sunmiReady) {
            const SunmiModule = require("sunmi-printer-expo");
            await SunmiModule.initPrinter();
            await SunmiModule.lineWrap(1);
            await SunmiModule.printText("================================\n");

            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(32);
            await SunmiModule.printText("  SETTLEMENT REPORT\n");
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(24);
            await SunmiModule.printText("================================\n");

            await SunmiModule.printText(`Period: ${fromDateStr} to ${toDateStr}\n`);
            if (selectedTerminal !== "ALL") await SunmiModule.printText(`Terminal: ${selectedTerminal}\n`);
            await SunmiModule.printText(`Generated: ${new Date().toLocaleTimeString()}\n`);
            await SunmiModule.printText("--------------------------------\n");

            const formatTwoCols32 = (left: string, right: string) => {
              const spaceCount = 32 - left.length - right.length;
              return spaceCount > 0 ? `${left}${" ".repeat(spaceCount)}${right}\n` : `${left}\n${right.padStart(32, " ")}\n`;
            };

            await SunmiModule.printText("REVENUE SUMMARY\n");
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("Gross Sales (" + (totalSales.InvoiceCount || 0) + "):", formatCurrency(totalSales.SubTotal)));
            await SunmiModule.printText(formatTwoCols32("Total Discount:", "-" + formatCurrency(totalSales.DiscountAmount)));
            await SunmiModule.printText(formatTwoCols32("Service Charge:", formatCurrency(totalSales.ServiceCharge)));
            await SunmiModule.printText(formatTwoCols32("Tax Collected (GST):", formatCurrency(totalSales.TotalTax)));
            await SunmiModule.printText(formatTwoCols32("Rounding & Excess:", formatCurrency(totalSales.RoundedBy)));
            await SunmiModule.printText(formatTwoCols32("Tips:", formatCurrency(totalSales.Tips)));
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("Net Sales:", formatCurrency(netSales)));
            await SunmiModule.printText("--------------------------------\n\n");

            await SunmiModule.printText("PAYMENT BREAKDOWN\n");
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("Opening Balance:", formatCurrency(displayOpeningAmount)));
            for (const p of payments) {
              await SunmiModule.printText(formatTwoCols32(p.PaymodeName + ":", formatCurrency(p.Amount)));
            }
            for (const t of transactions) {
              const sign = t.TransactionType === "IN" ? "" : "-";
              await SunmiModule.printText(formatTwoCols32(t.TransactionMode + " (" + t.TransactionType + "):", sign + formatCurrency(t.Amount)));
            }
            for (const co of cashOutEntries) {
              await SunmiModule.printText(formatTwoCols32((co.Reason || "Cash Out") + ":", "-" + formatCurrency(co.Amount)));
            }
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("Total Collected (In):", formatCurrency(totalCashIn)));
            await SunmiModule.printText(formatTwoCols32("Total Withdrawn (Out):", "-" + formatCurrency(totalCashOutSum)));
            await SunmiModule.printText("--------------------------------\n");
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(28);
            await SunmiModule.printText(formatTwoCols32("Net in Drawer:", formatCurrency(totalCashIn - totalCashOutSum)));
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(24);
            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("     SMART-POS BY UNIPROSG\n");
            await SunmiModule.lineWrap(3);
            await SunmiModule.cutPaper();
            printedToHardware = true;
          }
        } catch (sunmiErr) {
          console.warn("Sunmi direct print failed, fallback to system printing:", sunmiErr);
        }
      }

      // 5. Fallback/Standard option: Show PDF Preview or system print aligned to 80mm
      if (!printedToHardware) {
        if (Platform.OS === 'web') {
          const frame = document.createElement("iframe");
          frame.style.display = "none";
          document.body.appendChild(frame);
          frame.contentWindow?.document.open();
          frame.contentWindow?.document.write(html);
          frame.contentWindow?.document.close();
          setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            document.body.removeChild(frame);
          }, 500);
        } else {
          // mobile PDF fallback / system print with 80mm width config
          await Print.printAsync({
            html,
            width: 226, // 80mm approximate width in points
          });
        }
      }
    } catch (err) {
      console.error("Print Error", err);
      Alert.alert("Error", "Failed to print report");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={[styles.header, !isTablet && { flexDirection: 'column', alignItems: 'stretch', gap: 12, paddingVertical: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/category" as any)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={Theme.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Settlement</Text>

            {!isTablet && (
              <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  onPress={handlePrintReport}
                >
                  <Ionicons name="print-outline" size={16} color="#fff" />
                  <Text style={[styles.confirmBtnText, { fontSize: 12 }]}>Print</Text>
                </TouchableOpacity>

              </View>
            )}
          </View>

          {/* Date Pickers */}
          <View style={
            isTablet
              ? { marginLeft: 'auto', flexDirection: 'row', gap: 20, alignItems: 'center', marginRight: 20 }
              : { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }
          }>
            <View style={{ flex: !isTablet ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: Theme.textSecondary, fontFamily: Fonts.medium }}>From:</Text>
              <TouchableOpacity
                style={{
                  flex: !isTablet ? 1 : undefined,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  borderWidth: 1.5,
                  borderColor: Theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  height: 38,
                  gap: 6,
                  justifyContent: 'space-between',
                  ...Platform.select({
                    web: {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }
                  }) as any
                }}
                onPress={() => setShowFromPicker(true)}
              >
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
                  {formatDateTime(fromDate).split(' ')[0]}
                </Text>
                <Ionicons name="calendar-outline" size={13} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: !isTablet ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: Theme.textSecondary, fontFamily: Fonts.medium }}>To:</Text>
              <TouchableOpacity
                style={{
                  flex: !isTablet ? 1 : undefined,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  borderWidth: 1.5,
                  borderColor: Theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  height: 38,
                  gap: 6,
                  justifyContent: 'space-between',
                  ...Platform.select({
                    web: {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }
                  }) as any
                }}
                onPress={() => setShowToPicker(true)}
              >
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
                  {formatDateTime(toDate).split(' ')[0]}
                </Text>
                <Ionicons name="calendar-outline" size={13} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <CustomDateTimePicker
              visible={showFromPicker}
              onClose={() => setShowFromPicker(false)}
              selectedDate={fromDate}
              onApply={(date) => setFromDate(date)}
              title="Select Start Date"
              mode="date"
            />
            <CustomDateTimePicker
              visible={showToPicker}
              onClose={() => setShowToPicker(false)}
              selectedDate={toDate}
              onApply={(date) => setToDate(date)}
              title="Select End Date"
              mode="date"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: isTablet ? 0 : 10, width: isTablet ? 'auto' : '100%', justifyContent: isTablet ? 'flex-end' : 'space-between' }}>
            <TouchableOpacity
              style={[styles.confirmBtn, { paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
              onPress={handlePrintReport}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>Print Report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                if (!dayendRangeStart) {
                  showToast({ type: "error", message: "Please select a date first" });
                  return;
                }
                
                const performClose = async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/settings/delete-date`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({})
                    });
                    const data = await res.json();
                    if (data.success) {
                      showToast({ type: "success", message: "DayEnd Close Successfully" });
                      setShowDayendModal(false);
                    } else {
                      showToast({ type: "error", message: data.error || "Failed to perform DayEnd Close" });
                    }
                  } catch (err) {
                    showToast({ type: "error", message: "Network error" });
                  }
                };

                if (Platform.OS === 'web') {
                  if (window.confirm("Are you sure you want to perform the Dayend Close?")) {
                    performClose();
                  }
                } else {
                  Alert.alert(
                    "Confirm Dayend Close",
                    "Are you sure you want to perform the Dayend Close?",
                    [
                      { text: "No", style: "cancel" },
                      { text: "Yes", onPress: performClose }
                    ]
                  );
                }
              }}
              activeOpacity={0.8}
              style={[styles.confirmBtn, { backgroundColor: '#DC2626', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, opacity: !dayendRangeStart ? 0.5 : 1 }]}
            >
              <Text style={styles.confirmBtnText}>Dayend Close</Text>
            </TouchableOpacity>
            {/* <TouchableOpacity
              style={[styles.confirmBtn, { paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ea580c' }]}
              onPress={() => setShowDayendModal(true)}
            >
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>Perform Dayend</Text>
            </TouchableOpacity> */}
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Theme.primary} />
            <Text style={styles.loadingText}>Fetching Settlement...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {/* Top Overview Cards */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}
                onPress={() => {
                  setLovMode("OPEN");
                  setShowLov(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="wallet-outline" size={isTablet ? 16 : 14} color="#3B82F6" />
                  <Text style={{ fontFamily: Fonts.bold, color: '#1E3A8A', fontSize: isTablet ? 12 : 11 }}>Opening Amount</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: '#1D4ED8', marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(displayOpeningAmount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 }]}
                onPress={() => setShowCashOutModal(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="remove-circle-outline" size={isTablet ? 16 : 14} color="#EF4444" />
                  <Text style={{ fontFamily: Fonts.bold, color: '#991B1B', fontSize: isTablet ? 12 : 11 }}>Cash Out</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: '#B91C1C', marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalCashOut)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    flex: isTablet ? 1 : undefined,
                    minWidth: isTablet ? 0 : '48%',
                    flexGrow: 1,
                    padding: isTablet ? 15 : 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F3F4F6",
                    borderColor: "#D1D5DB",
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setShowCashBoxModal(true)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="cube-outline" size={isTablet ? 16 : 14} color="#374151" />
                  <Text
                    style={{
                      fontFamily: Fonts.bold,
                      color: "#7f97be",
                      fontSize: isTablet ? 12 : 11,
                    }}
                  >
                    Cash Box
                  </Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: '#374151', marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(cashBoxTotal)}</Text>
              </TouchableOpacity>

              <View style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="trending-up-outline" size={isTablet ? 16 : 14} color="#10B981" />
                  <Text style={{ fontFamily: Fonts.bold, color: '#166534', fontSize: isTablet ? 12 : 11 }}>Net Sales</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: '#15803D', marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(netSales)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1 }]}
                onPress={() => {
                  setLovMode("CLOSE");
                  setShowLov(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calculator-outline" size={isTablet ? 16 : 14} color="#F97316" />
                  <Text style={{ fontFamily: Fonts.bold, color: '#9A3412', fontSize: isTablet ? 12 : 11 }}>Closing Amount</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: '#C2410C', marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalClosing)}</Text>
              </TouchableOpacity>
            </View>


            <View style={[styles.grid, isTablet && styles.gridTablet]}>
              {/* === SUMMARY === */}
              <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SUMMARY</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 1 }]}>Details</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Amount</Text>
                </View>
                <View style={[styles.cardBody, { flex: 1 }]}>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Sales Total</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.SubTotal)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Total Discount</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.DiscountAmount)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Service Charge</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.ServiceCharge)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>GST</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.TotalTax)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Round Off</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.RoundedBy)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tips</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.Tips)}</Text>
                  </View>
                  <View style={[styles.row, styles.highlightRow, { marginTop: 'auto' }]}>
                    <Text style={[styles.rowLabel, styles.highlightText]}>Net Sales</Text>
                    <Text style={[styles.rowValue, styles.highlightText]}>{formatCurrency(netSales)}</Text>
                  </View>
                </View>
              </View>

              {/* === SALES SUMMARY === */}
              {/* <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SALES SUMMARY</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Paymode</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Sys Amount</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Manual Amount</Text>
                </View>
                <ScrollView style={styles.cardBodyScroll} nestedScrollEnabled> */}
              {/* Opening Cash Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => {
                      setLovMode("OPEN");
                      setShowLov(true);
                    }}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.textSecondary }]}>OPENING AMOUNT</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.textSecondary} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold, color: Theme.textSecondary }]}>
                      {formatCurrency(displayOpeningAmount)}
                    </Text>
                  </TouchableOpacity> */}

              {/* Hardcoded CASH Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => {
                      setLovMode("CLOSE");
                      setShowLov(true);
                    }}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.primary }]}>CASH</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.primary} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                      {formatCurrency(sysCash)}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold }]}>
                      {formatCurrency(totalClosing)}
                    </Text>
                  </TouchableOpacity> */}

              {/* Cash Out Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => setShowCashOutModal(true)}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.danger }]}>CASH OUT</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.danger} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold, color: Theme.danger }]}>
                      {formatCurrency(totalCashOut)}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
                <View style={styles.cardFooter}>
                  <Text style={styles.footerLabel}>Total</Text>
                  <Text style={styles.footerValue}>{formatCurrency(totalClosing)}</Text>
                </View>
                </View>
              </View> */}

              {/* === SALES === */}
              <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SALES</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Paymode</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Cash In</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Cash Out</Text>
                </View>
                <ScrollView style={styles.cardBodyScroll} nestedScrollEnabled>
                  {displayOpeningAmount > 0 && (
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>Opening Balance</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.success }]}>
                        +{formatCurrency(displayOpeningAmount)}
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                        0.00
                      </Text>
                    </View>
                  )}
                  {cashOutEntries.map((co, i) => (
                    <TouchableOpacity
                      key={`co-${i}`}
                      style={[styles.tableRow, { alignItems: 'center' }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '' });
                        setShowCashOutModal(true);
                      }}
                    >
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.tableCellText}>{co.Reason || 'Cash Out'}</Text>
                        <Ionicons name="create-outline" size={14} color={Theme.textPrimary} style={{ marginLeft: 6 }} />
                      </View>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                        0.00
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.danger }]}>
                        -{formatCurrency(co.Amount)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {transactions.map((t, i) => (
                    <View key={`trans-${i}`} style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>{t.TransactionMode}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: t.TransactionType === "IN" ? Theme.success : undefined }]}>
                        {t.TransactionType === "IN" ? `+${formatCurrency(t.Amount)}` : "0.00"}
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: t.TransactionType === "OUT" ? Theme.danger : undefined }]}>
                        {t.TransactionType === "OUT" ? `-${formatCurrency(t.Amount)}` : "0.00"}
                      </Text>
                    </View>
                  ))}
                  {regularPayments.map((p, i) => (
                    <View key={`pay-${i}`} style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>{p.PaymodeName}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.success }]}>+{formatCurrency(p.Amount)}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    </View>
                  ))}
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableCellText, { flex: 2 }]}>Cash Box</Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: cashBoxTotal > 0 ? Theme.success : Theme.textSecondary }]}>
                      +{formatCurrency(cashBoxTotal)}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                      0.00
                    </Text>
                  </View>
                  {regularPayments.length === 0 && displayOpeningAmount === 0 && transactions.length === 0 && cashOutEntries.length === 0 && cashBoxTotal === 0 && <Text style={styles.emptyText}>No sales</Text>}
                </ScrollView>
                <View style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 12, backgroundColor: "#FAFAFA", borderTopWidth: 1, borderTopColor: Theme.border, alignItems: "center" }}>
                  <View style={{ flex: 2, alignItems: 'flex-end', paddingRight: 15 }}>
                    <Text style={{ fontFamily: Fonts.black, fontSize: 14, color: Theme.primaryDark }}>TOTAL</Text>
                  </View>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: Theme.success }}>
                    {formatCurrency(totalCashIn)}
                  </Text>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: Theme.danger }}>
                    {formatCurrency(totalCashOutSum)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F9FAFB", borderTopWidth: 1, borderTopColor: "#E5E7EB", alignItems: "center" }}>
                  <View style={{ flex: 2, alignItems: 'flex-end', paddingRight: 15 }}>
                    <Text style={{ fontFamily: Fonts.black, fontSize: 13, color: Theme.textSecondary }}>NET AMOUNT</Text>
                  </View>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: (totalCashIn - totalCashOutSum) >= 0 ? Theme.success : Theme.danger }}>
                    {formatCurrency(totalCashIn - totalCashOutSum)}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Cash Denominations Modal */}
      <Modal
        visible={showLov}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLov(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalDismiss}
            activeOpacity={1}
            onPress={() => setShowLov(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Denomination</Text>
              <TouchableOpacity onPress={() => setShowLov(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Currency Value</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>No.Of Currencies</Text>
            </View>

            <ScrollView style={styles.modalList} nestedScrollEnabled>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  {lovMode === "OPEN" ? "Opening Cash Notes" : "Count All Cash Notes"}
                </Text>
              </View>
              {denominations.filter(d => d >= 1).map((denom, i) => {
                const denomStr = denom.toFixed(2);
                const val = lovMode === "OPEN" ? openingCounts[denomStr] : closingCounts[denomStr];
                return (
                  <View key={`note-${i}`} style={[styles.tableRow, { alignItems: "center" }]}>
                    <Text style={[styles.tableCellText, { flex: 1 }]}>{denomStr}</Text>
                    <TextInput
                      style={styles.currencyInput}
                      keyboardType="numeric"
                      value={val || ""}
                      onChangeText={(v) => handleCountChange(denomStr, v)}
                      placeholder="0"
                      placeholderTextColor={Theme.textMuted}
                    />
                  </View>
                );
              })}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  {lovMode === "OPEN" ? "Opening Cash Coins" : "Count All Cash Coins"}
                </Text>
              </View>
              {denominations.filter(d => d < 1).map((denom, i) => {
                const denomStr = denom.toFixed(2);
                const val = lovMode === "OPEN" ? openingCounts[denomStr] : closingCounts[denomStr];
                return (
                  <View key={`coin-${i}`} style={[styles.tableRow, { alignItems: "center" }]}>
                    <Text style={[styles.tableCellText, { flex: 1 }]}>{denomStr}</Text>
                    <TextInput
                      style={styles.currencyInput}
                      keyboardType="numeric"
                      value={val || ""}
                      onChangeText={(v) => handleCountChange(denomStr, v)}
                      placeholder="0"
                      placeholderTextColor={Theme.textMuted}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalDivider} />

            <View style={styles.modalFooter}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textSecondary }}>Total Cash:</Text>
                <Text style={{ fontFamily: Fonts.black, fontSize: 18, color: Theme.primary }}>
                  {formatCurrency(lovMode === "OPEN" ? totalOpening : totalClosing)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                  onPress={handleClearDenominations}
                >
                  <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { flex: 1 }]}
                  onPress={handleSaveDenominations}
                >
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cash Out Modal */}
      <Modal
        visible={showCashOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashOutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCashOutModal(false)}
          />
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Cash Out</Text>
              <TouchableOpacity onPress={() => setShowCashOutModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingVertical: 5 }} showsVerticalScrollIndicator={false}>
              {/* List of Today's Cash Out */}
              <View style={{ marginBottom: 15 }}>
                {/* <Text style={{ fontFamily: Fonts.bold, marginBottom: 8, color: Theme.textPrimary }}>Today's Entries</Text> */}
                {cashOutEntries.length > 0 ? (
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {cashOutEntries.map((co, idx) => (
                      <View key={idx} style={[styles.tableRow, { alignItems: 'center' }]}>
                        <Text style={[styles.tableCellText, { flex: 2 }]}>{co.Reason || 'Cash Out'}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', paddingRight: 15 }]}>{formatCurrency(co.Amount)}</Text>
                        <View style={{ flexDirection: 'row', gap: 15, width: 60, justifyContent: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '' })}>
                            <Ionicons name="create-outline" size={18} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCashOut(co.CashOutId || co.cashOutId)}>
                            <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>No cash out entries found for the selected time period.</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Amount *</Text>
                  <TextInput
                    style={[styles.premiumInput, { textAlign: 'right', fontSize: 18 }]}
                    keyboardType="numeric"
                    value={cashOutForm.Amount}
                    onChangeText={(v) => setCashOutForm({ ...cashOutForm, Amount: v })}
                    placeholder="0.00"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Payment Mode</Text>
                  <TextInput
                    style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                    value={cashOutForm.PaymentMode}
                    onChangeText={(v) => setCashOutForm({ ...cashOutForm, PaymentMode: v })}
                    placeholder="Cash"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Reason</Text>
                <TextInput
                  style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                  value={cashOutForm.Reason}
                  onChangeText={(v) => setCashOutForm({ ...cashOutForm, Reason: v })}
                  // placeholder="e.g. Supplier Payment"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>

              {/* <View style={{ marginBottom: 15 }}>
                <Text style={{ fontFamily: Fonts.medium, fontSize: 12, marginBottom: 4 }}>Remarks</Text>
                <TextInput
                  style={[styles.currencyInput, { height: 60, textAlignVertical: 'top', textAlign: 'left', fontFamily: Fonts.medium }]}
                  multiline
                  value={cashOutForm.Remarks}
                  onChangeText={(v) => setCashOutForm({ ...cashOutForm, Remarks: v })}
                  placeholder="Additional notes..."
                />
              </View> */}
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' })}
              >
                <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear Form</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={handleSaveCashOut}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showCashBoxModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashBoxModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCashBoxModal(false)}
          />

          <View style={[styles.modalContent, { maxWidth: 600, width: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cash Box</Text>

              <TouchableOpacity
                onPress={() => setShowCashBoxModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: Fonts.bold,
                  fontSize: 13,
                  marginBottom: 6,
                  color: Theme.textSecondary,
                }}
              >
                Artist Name *
              </Text>
              <TouchableOpacity
                style={[styles.premiumInput, { justifyContent: 'center' }]}
                onPress={() => setShowDishLov(true)}
              >
                <Text style={{ fontFamily: Fonts.medium, color: cashBoxForm.ArtistName ? Theme.textPrimary : Theme.textMuted }}>
                  {cashBoxForm.ArtistName || "Select Artist"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 15, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: Fonts.bold,
                    fontSize: 13,
                    marginBottom: 6,
                    color: Theme.textSecondary,
                  }}
                >
                  Amount *
                </Text>

                <TextInput
                  style={[styles.premiumInput, { textAlign: "right", fontSize: 18 }]}
                  keyboardType="numeric"
                  value={cashBoxForm.Amount}
                  onChangeText={(v) =>
                    setCashBoxForm({ ...cashBoxForm, Amount: v })
                  }
                  placeholder="0.00"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleSaveCashBox}
            >
              <Text style={styles.confirmBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDishLov}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDishLov(false);
          setArtistSearch("");
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowDishLov(false);
              setArtistSearch("");
            }}
          />
          <View style={[styles.modalContent, { maxWidth: 450, width: "90%", padding: 0, overflow: 'hidden' }]}>
            <View style={[styles.modalHeader, { padding: 16, backgroundColor: Theme.bgCard }]}>
              <Text style={styles.modalTitle}>Select Artist</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDishLov(false);
                  setArtistSearch("");
                }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.bgInput, borderRadius: 8, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Theme.border }}>
                <Ionicons name="search-outline" size={18} color={Theme.textMuted} />
                <TextInput
                  style={{ flex: 1, marginLeft: 8, fontFamily: Fonts.medium, fontSize: 14, color: Theme.textPrimary, outlineStyle: 'none' } as any}
                  placeholder="Search artist..."
                  placeholderTextColor={Theme.textMuted}
                  value={artistSearch}
                  onChangeText={setArtistSearch}
                />
                {artistSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setArtistSearch("")}>
                    <Ionicons name="close-circle" size={16} color={Theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView style={{ maxHeight: 350, backgroundColor: Theme.bgMain }}>
              {dishList.filter(item => item.Name.toLowerCase().includes(artistSearch.toLowerCase())).length > 0 ? (
                dishList.filter(item => item.Name.toLowerCase().includes(artistSearch.toLowerCase())).map((item, index) => {
                  const isSelected = cashBoxForm.ArtistName === item.Name;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        backgroundColor: isSelected ? Theme.primaryLight : Theme.bgCard,
                        borderBottomWidth: 1,
                        borderBottomColor: Theme.border,
                      }}
                      onPress={() => {
                        setCashBoxForm({
                          ...cashBoxForm,
                          ArtistName: item.Name,
                        });
                        setShowDishLov(false);
                        setArtistSearch("");
                      }}
                    >
                      <Text style={{
                        fontFamily: isSelected ? Fonts.bold : Fonts.medium,
                        fontSize: 14,
                        color: isSelected ? Theme.primary : Theme.textPrimary
                      }}>
                        {item.Name}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color={Theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={32} color={Theme.border} style={{ marginBottom: 10 }} />
                  <Text style={{ fontFamily: Fonts.medium, color: Theme.textMuted, fontSize: 14 }}>
                    No artists found matching "{artistSearch}"
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showDayendModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalDismiss}
            onPress={() => setShowDayendModal(false)}
          />
          <View style={[styles.modalContent, { width: isTablet ? 450 : "95%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Dayend Operation</Text>
                <Text style={{ fontSize: 13, color: Theme.textSecondary, fontFamily: Fonts.medium }}>Select period to close the day</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDayendModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <View style={{ marginTop: 20, borderWidth: 1, borderColor: '#FED7AA', borderRadius: 12, padding: 16 }}>
                <Text style={{ fontSize: 11, fontFamily: Fonts.black, color: Theme.textSecondary, marginBottom: 12, letterSpacing: 0.5 }}>SELECT DATE RANGE</Text>

                <View style={{ flexDirection: 'column', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, color: Theme.textSecondary, fontFamily: Fonts.bold, width: 50 }}>From:</Text>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, paddingHorizontal: 12, height: 48, justifyContent: 'space-between' }}
                      onPress={() => setShowDayendFromPicker(true)}
                    >
                      <Text style={{ fontFamily: Fonts.black, color: Theme.textPrimary, fontSize: 14 }}>
                        {formatDateTime(dayendRangeStart).split(' ')[0]}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color="#F97316" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, color: Theme.textSecondary, fontFamily: Fonts.bold, width: 50 }}>To:</Text>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, paddingHorizontal: 12, height: 48, justifyContent: 'space-between' }}
                      onPress={() => setShowDayendToPicker(true)}
                    >
                      <Text style={{ fontFamily: Fonts.black, color: Theme.textPrimary, fontSize: 14 }}>
                        {formatDateTime(dayendRangeEnd).split(' ')[0]}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color="#F97316" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 20, borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="document-text" size={20} color="#F97316" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: Fonts.black, color: Theme.textPrimary }}>Perform Dayend</Text>
                    <Text style={{ fontSize: 12, fontFamily: Fonts.medium, color: Theme.textSecondary }}>Close the day for selected period</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    handlePrintReport();
                    setShowDayendModal(false);
                  }}
                  style={{ backgroundColor: '#F97316', height: 48, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 12 }}
                >
                  <Ionicons name="document-text" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontFamily: Fonts.black, fontSize: 15 }}>Report</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const res = await fetch(`${API_URL}/api/settings/delete-date`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({})
                      });
                      const data = await res.json();
                      if (data.success) {
                        showToast({ type: "success", message: "DayEnd Close Successfully" });
                        setShowDayendModal(false);
                      } else {
                        showToast({ type: "error", message: data.error || "Failed to perform DayEnd Close" });
                      }
                    } catch (err) {
                      showToast({ type: "error", message: "Network error" });
                    }
                  }}
                  disabled={!dayendRangeStart}
                  activeOpacity={0.8}
                  style={{ backgroundColor: '#DC2626', height: 48, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                >
                  <Text style={{ color: '#fff', fontFamily: Fonts.black, fontSize: 15 }}>Dayend Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <CustomDateTimePicker
              visible={showDayendFromPicker}
              onClose={() => setShowDayendFromPicker(false)}
              selectedDate={dayendRangeStart}
              onApply={(date) => setDayendRangeStart(date)}
              title="Select Dayend Start"
              mode="date"
            />
            <CustomDateTimePicker
              visible={showDayendToPicker}
              onClose={() => setShowDayendToPicker(false)}
              selectedDate={dayendRangeEnd}
              onApply={(date) => setDayendRangeEnd(date)}
              title="Select Dayend End"
              mode="date"
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  verticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: Theme.border,
  },
  filterWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterTitle: {
    fontSize: 11,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  filterScroll: {
    gap: 6,
    alignItems: "center",
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  filterBtnTextActive: {
    color: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  content: {
    padding: 12,
  },
  grid: {
    flexDirection: "column",
    gap: 12,
  },
  gridTablet: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    backgroundColor: Theme.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    width: "100%",
  },
  cardTablet: {
    flex: 1, // Distribute evenly in a single row
  },
  cardHeader: {
    backgroundColor: Theme.bgCard,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  cardBody: {
    padding: 12,
  },
  cardBodyScroll: {
    height: 280,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  highlightRow: {
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    borderBottomWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    marginBottom: -12,
  },
  highlightText: {
    color: Theme.primaryDark,
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: '#F8FAFC', // Very subtle cool gray
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  tableHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  tableCellText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  currencyInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: Theme.bgInput,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    textAlign: "right",
  },
  premiumInput: {
    height: 52,
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 16,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  modalList: {
    maxHeight: 300,
  },
  sectionHeader: {
    backgroundColor: Theme.bgMuted,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 4,
  },
  sectionHeaderText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  modalFooter: {
    marginTop: 8,
  },
  confirmBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  confirmBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  clickableRow: {
    backgroundColor: Theme.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primary,
    paddingHorizontal: 8,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#FAFAFA",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  footerLabel: {
    backgroundColor: Theme.bgMuted,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primaryDark,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  footerValue: {
    backgroundColor: Theme.bgCard,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primaryDark,
    borderWidth: 1,
    borderColor: Theme.border,
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    minWidth: 80,
    textAlign: "right",
  },
});
