import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  useWindowDimensions,
  Animated,
  Platform,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";
import { socket } from "../constants/socket";
import { useCompanySettingsStore } from "../stores/companySettingsStore";
import { usePaymentSettingsStore } from "../stores/paymentSettingsStore";
import { API_URL } from "../constants/Config";

interface DisplayState {
  active: boolean;
  paymentSuccess: boolean;
  orderId?: string;
  tableNo?: string;
  orderType?: "DINE_IN" | "TAKEAWAY" | "MANUAL";
  section?: string;
  items: any[];
  grossTotal: number;
  itemDiscounts: number;
  subTotal: number;
  orderDiscountAmount: number;
  gstAmount: number;
  roundOff: number;
  netTotal: number;
  waiterName?: string;
  paid?: number;
  change?: number;
  paymentMethod?: string;
}

const DEFAULT_STATE: DisplayState = {
  active: false,
  paymentSuccess: false,
  items: [],
  grossTotal: 0,
  itemDiscounts: 0,
  subTotal: 0,
  orderDiscountAmount: 0,
  gstAmount: 0,
  roundOff: 0,
  netTotal: 0,
};

const getLogoUri = (logo: string) => {
  if (!logo) return "";
  if (logo.startsWith('data:image')) return logo;
  if (logo.startsWith('http')) return logo;
  return `${API_URL}${logo.startsWith('/') ? '' : '/'}${logo}`;
};

export default function CustomerDisplayScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const companySettings = useCompanySettingsStore((s) => s.settings);
  const paymentSettings = usePaymentSettingsStore((s) => s.settings);

  const [displayState, setDisplayState] = useState<DisplayState>(DEFAULT_STATE);
  const [floatingFoods, setFloatingFoods] = useState<any[]>([]);
  
  // Animation value for success screen fade/scale
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // 1. Initialize settings & socket listener
  useEffect(() => {
    usePaymentSettingsStore.getState().fetchSettings();
    useCompanySettingsStore.getState().fetchSettings("1");

    const handleSync = (data: any) => {
      console.log("🖥️ [CustomerDisplay] Received sync event:", data.paymentSuccess ? "SUCCESS" : (data.active ? "CART" : "IDLE"));
      setDisplayState(data);
    };

    socket.on("customer_display_sync", handleSync);

    return () => {
      socket.off("customer_display_sync", handleSync);
    };
  }, []);

  // 2. Success screen trigger
  useEffect(() => {
    if (displayState.paymentSuccess) {
      // Animate success screen entrance
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          tension: 40,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      successScale.setValue(0);
      successOpacity.setValue(0);
    }
  }, [displayState.paymentSuccess]);

  // 3. Spawning popping food animations for Attract Loop
  useEffect(() => {
    if (displayState.active) {
      setFloatingFoods([]);
      return;
    }

    const icons = [
      "pizza-outline",
      "cafe-outline",
      "ice-cream-outline",
      "restaurant-outline",
      "beer-outline",
      "fast-food-outline",
    ];

    const interval = setInterval(() => {
      const id = Math.random().toString();
      const icon = icons[Math.floor(Math.random() * icons.length)];
      // Spawn coordinates (percentage of screen viewport)
      const x = Math.random() * 80 + 10; 
      const y = Math.random() * 70 + 15; 

      const scale = new Animated.Value(0);
      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(1);

      const newItem = { id, icon, x, y, scale, translateY, opacity };
      setFloatingFoods((prev) => [...prev, newItem].slice(-15)); // Keep max 15 on screen

      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.3,
          tension: 30,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -80 - Math.random() * 50,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          delay: 2200,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Clean up from state once finished
        setFloatingFoods((prev) => prev.filter((item) => item.id !== id));
      });

    }, 900);

    return () => clearInterval(interval);
  }, [displayState.active]);

  // 4. Generate UPI QR URL
  const upiUrl = (() => {
    if (!paymentSettings.upiId) return "";
    const cleanUpiId = paymentSettings.upiId.trim();
    const cleanShopName = paymentSettings.shopName.replace(/[&?=]/g, "").trim();
    return `upi://pay?pa=${cleanUpiId}&pn=${encodeURIComponent(cleanShopName)}&am=${(displayState.netTotal || 0).toFixed(2)}&cu=INR`;
  })();

  // ─── RENDERS ───

  // Success view
  if (displayState.paymentSuccess && paymentSettings.customerSideDisplay) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successMainContent}>
          <Animated.View
            style={[
              styles.successCard,
              {
                transform: [{ scale: successScale }],
                opacity: successOpacity,
              },
            ]}
          >
            <View style={styles.successIconWrapper}>
              <Ionicons name="checkmark-circle" size={100} color={Theme.success} />
            </View>
            <Text style={styles.successTitle}>Payment Successful</Text>
            <Text style={styles.successOrderText}>
              Order #{displayState.orderId}
            </Text>

            <View style={styles.dashedDivider} />

            <View style={styles.successDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Settlement Mode</Text>
                <Text style={styles.detailValue}>{displayState.paymentMethod || "CARD/UPI"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Amount Paid</Text>
                <Text style={[styles.detailValue, { color: Theme.primary }]}>
                  {companySettings.currencySymbol || "$"}{displayState.paid?.toFixed(2) || (displayState.netTotal || 0).toFixed(2)}
                </Text>
              </View>
              {displayState.change && displayState.change > 0 ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Change Given</Text>
                  <Text style={styles.detailValue}>
                    {companySettings.currencySymbol || "$"}{(displayState.change || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.successFooter}>Thank you! Visit us again.</Text>
          </Animated.View>
        </View>

        {/* Unipro Footer on Success Screen */}
        <View style={styles.idleUniproFooter}>
          <Image
            source={require("../assets/images/unipro_logo.png")}
            style={styles.uniproLogoImage}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  // Active checkout view
  if (displayState.active && paymentSettings.customerSideDisplay) {
    const isUPI = /UPI|GPAY|PHONE|PAYTM/i.test(displayState.paymentMethod || "") || (displayState.paymentMethod === undefined && paymentSettings.upiId);
    const isPayNow = /PAYNOW|QR|PAY-NOW/i.test(displayState.paymentMethod || "") || (displayState.paymentMethod === undefined && paymentSettings.payNowQrUrl);

    return (
      <View style={styles.checkoutContainer}>
        {/* Top Header Banner */}
        <View style={styles.topHeaderBanner}>
          <Text style={styles.topHeaderText} numberOfLines={1}>
            {paymentSettings.shopName || companySettings.name || "INDIAN SUPERMARKET PTE LTD"}
          </Text>
          {(displayState.section || displayState.tableNo) ? (
            <View style={styles.headerInfoContainer}>
              {displayState.section ? (
                <Text style={styles.headerSectionText}>{displayState.section}</Text>
              ) : null}
              {displayState.tableNo ? (
                <View style={styles.headerTableBadge}>
                  <Text style={styles.headerTableText}>{displayState.tableNo}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={[styles.checkoutLayout, isLandscape && styles.checkoutLayoutLandscape]}>
          
          {/* Left Pane: Payment QR / Restaurant Logo & Branding Footer */}
          <View style={styles.leftPane}>
            <View style={styles.leftMainContent}>
              {displayState.paymentMethod && isUPI && paymentSettings.upiId ? (
                <View style={styles.qrCard}>
                  <Text style={styles.qrTitle}>Scan to Pay via UPI</Text>
                  <View style={styles.qrImageContainer}>
                    {Platform.OS === "web" ? (
                      <Image
                        source={{
                          uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`,
                        }}
                        style={styles.webQrImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <QRCode value={upiUrl} size={200} color="#000" backgroundColor="#fff" />
                    )}
                  </View>
                  <Text style={styles.qrSubtitle}>GPay, PhonePe, Paytm, BHIM</Text>
                </View>
              ) : displayState.paymentMethod && isPayNow && paymentSettings.payNowQrUrl ? (
                <View style={styles.qrCard}>
                  <Text style={styles.qrTitle}>Scan to Pay via PayNow</Text>
                  <View style={styles.qrImageContainer}>
                    <Image
                      source={{
                        uri: paymentSettings.payNowQrUrl.startsWith("data:")
                          ? paymentSettings.payNowQrUrl
                          : `${API_URL}${paymentSettings.payNowQrUrl}`,
                      }}
                      style={styles.payNowQrImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.qrSubtitle}>Scan QR code with your mobile banking app</Text>
                </View>
              ) : (
                <View style={styles.logoCard}>
                  {companySettings.companyLogo ? (
                    <View style={styles.logoCircle}>
                      <Image
                        source={{ uri: getLogoUri(companySettings.companyLogo) }}
                        style={styles.largeRestaurantLogo}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View style={styles.logoCircleFallback}>
                      <Ionicons name="restaurant" size={80} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.logoShopName}>
                    {paymentSettings.shopName || companySettings.name || "Smart Cafe"}
                  </Text>
                </View>
              )}
            </View>

            {/* Mandatory Unipro Branding Footer (Always present on left column) */}
            <View style={styles.uniproFooterContainer}>
              <Image
                source={require("../assets/images/unipro_logo.png")}
                style={styles.uniproLogoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Right Pane: Cart & Totals Summary */}
          <View style={styles.rightPane}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.cellDesc]}>Description</Text>
              <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qty</Text>
              <Text style={[styles.tableHeaderCell, styles.tableHeaderCellTotal]}>Total</Text>
            </View>

            {/* Itemized List */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.receiptItemsScroll}>
              {displayState.items.map((item, idx) => (
                <View key={`${item.lineItemId}-${idx}`} style={[styles.receiptItemRow, item.isVoided && styles.voidedRow]}>
                  <View style={styles.cellDesc}>
                    <Text style={[styles.receiptItemName, item.isVoided && styles.voidedText]}>
                      {item.name}
                      {item.isVoided && " (VOIDED)"}
                    </Text>
                    {item.discountAmount > 0 && !item.isVoided ? (
                      <Text style={styles.receiptItemDiscount}>
                        🏷️ Discount: -{companySettings.currencySymbol || "$"}{item.discountAmount.toFixed(2)}
                        {item.discountPercent > 0 ? ` (${item.discountPercent}%)` : ""}
                      </Text>
                    ) : null}
                    {item.note ? <Text style={styles.receiptItemNote}>📝 {item.note}</Text> : null}
                    {item.modifiers && item.modifiers.map((m: any, mIdx: number) => (
                      <Text key={mIdx} style={styles.receiptItemModifier}>
                        + {m.ModifierName}
                      </Text>
                    ))}
                  </View>
                  <Text style={[styles.receiptItemQty, styles.cellQty, item.isVoided && styles.voidedText]}>
                    {(item.qty || 0).toFixed(2)}
                  </Text>
                  <View style={styles.cellTotal}>
                    {item.discountAmount > 0 && !item.isVoided ? (
                      <Text style={styles.receiptItemOriginalPrice}>
                        {companySettings.currencySymbol || "$"}{(item.originalPrice || 0).toFixed(2)}
                      </Text>
                    ) : null}
                    <Text style={[styles.receiptItemTotal, item.isVoided && styles.voidedText]}>
                      {companySettings.currencySymbol || "$"}{(item.finalPrice || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Summary details */}
            <View style={styles.receiptSummaryContainer}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Sub Total</Text>
                  <Text style={styles.breakdownValue}>
                    {companySettings.currencySymbol || "$"}{(displayState.subTotal || 0).toFixed(2)}
                  </Text>
                </View>

                {((displayState.itemDiscounts || 0) + (displayState.orderDiscountAmount || 0)) > 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={[styles.breakdownLabel, { color: Theme.danger }]}>Discount</Text>
                    <Text style={[styles.breakdownValue, { color: Theme.danger }]}>
                      {companySettings.currencySymbol || "$"}{((displayState.itemDiscounts || 0) + (displayState.orderDiscountAmount || 0)).toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {displayState.gstAmount > 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Tax</Text>
                    <Text style={styles.breakdownValue}>
                      {companySettings.currencySymbol || "$"}{(displayState.gstAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {displayState.roundOff !== 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>RoundOff</Text>
                    <Text style={styles.breakdownValue}>
                      {displayState.roundOff > 0 ? "+" : ""}{companySettings.currencySymbol || "$"}{(displayState.roundOff || 0).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Net Total High-Contrast Box */}
              <View style={styles.netTotalHighlightBox}>
                <Text style={styles.netTotalLabel}>Net Total</Text>
                <Text style={styles.netTotalValue}>
                  {companySettings.currencySymbol || "$"}{(displayState.netTotal || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {displayState.waiterName ? (
              <View style={styles.waiterFooter}>
                <Ionicons name="person-circle-outline" size={16} color={Theme.textSecondary} />
                <Text style={styles.waiterText}>Served by: {displayState.waiterName}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // Idle attract loop view
  return (
    <View style={styles.idleContainer}>
      {/* Floating popping food animations */}
      {floatingFoods.map((item) => (
        <Animated.View
          key={item.id}
          style={[
            styles.floatingFood,
            {
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: [
                { scale: item.scale },
                { translateY: item.translateY },
              ],
              opacity: item.opacity,
            },
          ]}
        >
          <Ionicons name={item.icon} size={48} color={Theme.primary + "30"} />
        </Animated.View>
      ))}

      <View style={styles.idleMainContent}>
        {/* Main Branding Card */}
        <View style={styles.brandingCard}>
          {companySettings.companyLogo ? (
            <Image
              source={{ uri: getLogoUri(companySettings.companyLogo) }}
              style={styles.logoImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.fallbackLogoContainer}>
              <Ionicons name="restaurant" size={60} color="#fff" />
            </View>
          )}

          <Text style={styles.welcomeTitle}>
            {companySettings.name || "Welcome to our Restaurant!"}
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Order details will appear here during checkout.
          </Text>

          <View style={styles.halalContainer}>
            {companySettings.showHalalLogo && companySettings.halalLogo ? (
              <Image
                source={{ uri: getLogoUri(companySettings.halalLogo) }}
                style={styles.halalImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </View>

      {/* Unipro Footer on Idle Screen */}
      <View style={styles.idleUniproFooter}>
        <Image
          source={require("../assets/images/unipro_logo.png")}
          style={styles.uniproLogoImage}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  idleContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 32,
    position: "relative",
    overflow: "hidden",
  },
  idleMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  floatingFood: {
    position: "absolute",
    zIndex: 1,
  },
  brandingCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 30,
    alignItems: "center",
    maxWidth: 550,
    width: "90%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: Theme.border,
  },
  logoImage: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  fallbackLogoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  halalContainer: {
    marginTop: 20,
    height: 50,
  },
  halalImage: {
    width: 80,
    height: 50,
  },

  // Checkout layout
  checkoutContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  topHeaderBanner: {
    backgroundColor: "#FEF9E7",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderBottomWidth: 1.5,
    borderBottomColor: "#F5CBA7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topHeaderText: {
    fontSize: 24,
    fontFamily: Fonts.black,
    color: "#4A2711",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  headerInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerSectionText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#7E5109",
    textTransform: "uppercase",
    backgroundColor: "#FFF9E6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F5CBA7",
  },
  headerTableBadge: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  headerTableText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: "#fff",
    textTransform: "uppercase",
  },
  checkoutLayout: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  checkoutLayoutLandscape: {
    flexDirection: "row",
  },

  // Left column
  leftPane: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: Theme.border,
    justifyContent: "space-between",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  leftMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  logoCircleFallback: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  largeRestaurantLogo: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  logoShopName: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: "#374151",
    marginTop: 20,
    textAlign: "center",
  },

  // QR Code views
  qrCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  qrTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: "#1F2937",
    marginBottom: 16,
  },
  qrImageContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  webQrImage: {
    width: 220,
    height: 220,
  },
  payNowQrImage: {
    width: 220,
    height: 220,
  },
  qrSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#4B5563",
    marginTop: 16,
    textAlign: "center",
  },

  // Unipro Footers
  uniproFooterContainer: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  uniproLogoImage: {
    width: 280,
    height: 80,
  },
  idleUniproFooter: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },

  // Right column
  rightPane: {
    flex: 1.2,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Theme.border,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "#E5E7EB",
  },
  tableHeaderCell: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: "#4B5563",
  },
  cellDesc: {
    flex: 1.6,
  },
  cellQty: {
    width: 70,
    textAlign: "center",
  },
  cellTotal: {
    width: 100,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tableHeaderCellTotal: {
    width: 100,
    textAlign: "right",
  },
  receiptItemOriginalPrice: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  receiptItemDiscount: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.danger || "#EF4444",
    marginTop: 2,
  },

  receiptItemsScroll: {
    flex: 1,
  },
  receiptItemRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    alignItems: "center",
  },
  voidedRow: {
    backgroundColor: "#FEF2F2",
    opacity: 0.6,
  },
  receiptItemName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#1F2937",
  },
  voidedText: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  receiptItemNote: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  receiptItemModifier: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    marginTop: 2,
    paddingLeft: 6,
  },
  receiptItemQty: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#374151",
  },
  receiptItemTotal: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: "#1F2937",
  },

  receiptSummaryContainer: {
    borderTopWidth: 1.5,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    padding: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 12,
  },
  breakdownItem: {
    alignItems: "center",
    flex: 1,
    minWidth: 70,
  },
  breakdownLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#6B7280",
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#374151",
  },

  netTotalHighlightBox: {
    backgroundColor: "#16A34A",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  netTotalLabel: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  netTotalValue: {
    fontSize: 32,
    fontFamily: Fonts.black,
    color: "#fff",
  },

  waiterFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 6,
  },
  waiterText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },

  // Success Container
  successContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    position: "relative",
  },
  successMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  successCard: {
    backgroundColor: "#fff",
    borderRadius: 32,
    padding: 40,
    width: "90%",
    maxWidth: 450,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.border,
  },
  successIconWrapper: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  successOrderText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.success,
    marginTop: 5,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: Theme.border,
    borderStyle: "dashed",
    width: "100%",
    marginVertical: 20,
  },
  successDetails: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  detailValue: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  successFooter: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginTop: 10,
    textAlign: "center",
  },
});
