import { API_URL } from "@/constants/Config";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CartSidebar from "../../components/CartSidebar";
import { useToast } from "../../components/Toast";
import { Skeleton } from "../../components/ui/Skeleton";
import UniversalPrinter from "../../components/UniversalPrinter";
import { Fonts } from "../../constants/Fonts";
import { Theme } from "../../constants/theme";
import { useAuthStore } from "../../stores/authStore";
import {
  addToCartGlobal,
  getContextId,
  setCurrentContext,
  useCartStore
} from "../../stores/cartStore";
import { useGeneralSettingsStore } from "../../stores/generalSettingsStore";
import { useMenuStore } from "../../stores/menuStore";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { usePaymentSettingsStore } from "../../stores/paymentSettingsStore";

const EMPTY_ARRAY: any[] = [];

const IMAGE_BASE_URL = `${API_URL}/api/menu/image/`;

// --- COMPONENTS ---

const NavRail = () => {
  const router = useRouter();
  const navItems = [
    { id: "home", icon: "home-outline", label: "Home", active: true },
  ];

  return (
    <View style={styles.rail}>
      <View style={styles.railTop}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.railItem, item.active && styles.railItemActive]}
            onPress={() => {
              if (item.id === "home") router.replace("/(tabs)/category");
            }}
          >
            <Ionicons
              name={item.icon as any}
              size={22}
              color={item.active ? Theme.primary : Theme.textSecondary}
            />
            <Text
              style={[styles.railLabel, item.active && styles.railLabelActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.railBottom}>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => router.replace("/login")}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color={Theme.textSecondary}
          />
          <Text style={styles.railLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DishCard = React.memo(
  ({ dish, width, cartQty, onPress, isPhone, isTablet, isLandscape }: any) => {
    const isSC = Number(dish.isServiceCharge) === 1 || dish.isServiceCharge === true;
    return (
      <Pressable
        style={({ pressed }: { pressed: boolean }) => [
          styles.card,
          { width, padding: isPhone ? 8 : isTablet ? 12 : 10 },
          isLandscape && !isTablet && { maxHeight: 135 },
          isSC && {
            borderWidth: 1.5,
            borderColor: Theme.dangerBorder,
            backgroundColor: Theme.dangerBg,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
        onPress={() => onPress(dish)}
      >
        {cartQty > 0 && (
          <View
            style={[
              styles.qtyBadge,
              isPhone
                ? { width: 22, height: 22, borderRadius: 11 }
                : isTablet
                  ? { width: 32, height: 32, borderRadius: 16 }
                  : null,
            ]}
          >
            <Text
              style={[
                styles.qtyBadgeText,
                isPhone ? { fontSize: 11 } : isTablet ? { fontSize: 15 } : null,
              ]}
            >
              {cartQty}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.dishImageWrap,
            isPhone
              ? { width: 48, height: 48, marginBottom: 4 }
              : isTablet
                ? {
                  width: 75,
                  height: 75,
                  marginBottom: 6,
                  borderRadius: 37.5,
                }
                : null,
          ]}
        >
          {dish.Image ? (
            <Image
              source={{ uri: `${IMAGE_BASE_URL}${dish.Image}` }}
              style={styles.dishImg}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.dishImg,
                {
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: Theme.bgMuted,
                },
              ]}
            >
              <Ionicons
                name="restaurant-outline"
                size={isPhone ? (isLandscape ? 16 : 24) : isTablet ? 48 : 40}
                color={Theme.textMuted}
              />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.dishName,
            isPhone
              ? { fontSize: 11, minHeight: 42, lineHeight: 14 }
              : isTablet
                ? { fontSize: 13, minHeight: 48, lineHeight: 16 }
                : null,
          ]}
          numberOfLines={3}
        >
          {dish.Name}
        </Text>
        <Text
          style={[
            styles.dishPrice,
            isPhone ? { fontSize: 12 } : isTablet ? { fontSize: 14 } : null,
          ]}
        >
          {(Number(dish.IsOpenItem) === 1 || dish.IsOpenItem === true || dish.IsOpenItem === 'true' || dish.IsOpenItem === '1') ? "Open Price" : `$${(dish.Price || 0).toFixed(2)}`}
        </Text>
        {(Number(dish.IsOpenItem) === 1 || dish.IsOpenItem === true || dish.IsOpenItem === 'true' || dish.IsOpenItem === '1') ? (
          <View style={{ backgroundColor: "#F59E0B22", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2, borderWidth: 1, borderColor: "#F59E0B44", alignSelf: "center" }}>
            <Text style={{ fontSize: 9, color: "#B45309", fontFamily: Fonts.bold }}>OPEN</Text>
          </View>
        ) : null}
      </Pressable>
    );
  },
);

// 🚀 PERFORMANCE OPTIMIZATION: Surgical Quantity Updates
// This wrapper ensures only the SPECIFIC dish card being updated re-renders.
const DishCardWrapper = React.memo(
  ({ item, width, isPhone, isTablet, isLandscape, onPress }: any) => {
    const currentContextId = useCartStore((state) => state.currentContextId);
    const dishId = item.DishId || item.id;

    // ⚡ SURGICAL SUBSCRIPTION: Only re-render if the quantity of THIS specific product changes
    const cartQty = useCartStore((state) => {
      if (!currentContextId) return 0;
      const qtyMap = state.cartQtyMap[currentContextId] || {};
      return qtyMap[dishId] || 0;
    });

    return (
      <DishCard
        dish={item}
        width={width}
        cartQty={cartQty}
        onPress={onPress}
        isPhone={isPhone}
        isTablet={isTablet}
        isLandscape={isLandscape}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      (prevProps.item.DishId || prevProps.item.id) === (nextProps.item.DishId || nextProps.item.id) &&
      prevProps.width === nextProps.width &&
      prevProps.isPhone === nextProps.isPhone &&
      prevProps.isTablet === nextProps.isTablet &&
      prevProps.isLandscape === nextProps.isLandscape
    );
  }
);

const DishGridSkeleton = ({ cardWidth, columns, gap, isPhone }: any) => {
  const items = Array.from({ length: columns * 4 });
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: gap,
        paddingBottom: 80,
      }}
    >
      {items.map((_, i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              width: cardWidth,
              padding: isPhone ? 8 : 12,
              borderStyle: "dashed",
            },
          ]}
        >
          <Skeleton
            circle
            width={isPhone ? 48 : 75}
            height={isPhone ? 48 : 75}
            style={{ marginBottom: 8 }}
          />
          <Skeleton width="80%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={14} />
        </View>
      ))}
    </View>
  );
};

const CategorySkeleton = () => (
  <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
    {[1, 2, 3, 4].map((i) => (
      <Skeleton key={i} width={100} height={36} borderRadius={12} />
    ))}
  </View>
);

const GroupSkeleton = () => (
  <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Skeleton key={i} width={80} height={38} borderRadius={full} />
    ))}
  </View>
);

// 🚀 PERFORMANCE OPTIMIZATION: Cart Badge Component
const CartBadge = React.memo(({ isPhone, isLandscape }: any) => {
  const currentContextId = useCartStore((state) => state.currentContextId);
  const count = useCartStore((state) => {
    if (!currentContextId) return 0;
    return (state.carts[currentContextId] || []).length;
  });

  if (count === 0) return null;

  return (
    <View
      style={[
        styles.cartBadge,
        isPhone &&
        isLandscape && { top: -4, right: -4, minWidth: 16, height: 16 },
      ]}
    >
      <Text
        style={[
          styles.cartBadgeText,
          isPhone && isLandscape && { fontSize: 9 },
        ]}
      >
        {count}
      </Text>
    </View>
  );
});

// --- SCREEN ---

export default function MenuScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const {
    kitchens,
    fetchMenu,
    fetchGroups,
    fetchDishes,
    allDishes,
    isLoading: menuLoading,
    modifierCache,
  } = useMenuStore();

  const [groups, setGroups] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [isLoadingDishes, setIsLoadingDishes] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [selectedKitchenId, setSelectedKitchenId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Track in-flight modifier fetches to prevent duplicate requests
  const fetchingModifiers = React.useRef<Set<string>>(new Set());

  // Modifier Modal State
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [showModifier, setShowModifier] = useState(false);

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitMembers, setSplitMembers] = useState<any[]>([]);
  const [selectedSplitDish, setSelectedSplitDish] = useState<any>(null);
  const [splitAmount, setSplitAmount] = useState("");
  const [songName, setSongName] = useState("");

  const [selectedDish, setSelectedDish] = useState<any | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [loadingModifiers, setLoadingModifiers] = useState(false);

  // Open Item modal state
  const [showOpenItemModal, setShowOpenItemModal] = useState(false);
  const [openItemDish, setOpenItemDish] = useState<any | null>(null);
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [openItemError, setOpenItemError] = useState("");

  // Custom Item Submodal (Screenshot Flow)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customMods, setCustomMods] = useState<any[]>([]);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(
    null,
  );
  const [showReprintOptions, setShowReprintOptions] = useState(false);
  const { showToast } = useToast();
  const user = useAuthStore((s: any) => s.user);
  const paymentSettings = usePaymentSettingsStore((s: any) => s.settings);

  const orderContext = useOrderContextStore((state) => state.currentOrder);

  // 🟢 OPTIMIZED SELECTORS: Removed cart subscription from main screen to prevent full-screen re-renders.
  const currentContextId = useCartStore((state) => state.currentContextId);
  const displayOrderId = useCartStore(
    (state) =>
      (orderContext?.tableId
        ? state.tableOrderIds[orderContext.tableId]
        : undefined) || null,
  );

  const enableKOT = useGeneralSettingsStore((s: any) => s.settings.enableKOT);
  const enableCheckoutBill = useGeneralSettingsStore(
    (s: any) => s.settings.enableCheckoutBill,
  );

  // 🟢 QUANTITY TRACKING: Handled surgically within DishCardWrapper to avoid O(N^2) re-renders

  // Removed activeOrder memo to avoid system-wide re-renders.
  // Access on-demand in handlers instead.

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isPhone = !isTablet;
  const [showCart, setShowCart] = useState(true);

  const toggleCart = () => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setShowCart((prev) => !prev);
  };

  const isFetchingCart = React.useRef(false);

  // Removed cartItemsCount dependency

  const insets = useSafeAreaInsets();
  const usableWidth = width - insets.left - insets.right;

  // Moved totals to handlers or CartSidebar.
  // MenuScreen no longer needs to calculate these on every render.

  const handleReprintKOT = async () => {
    const cart = useCartStore.getState().carts[currentContextId!] || [];
    if (!cart.length) {
      showToast({ type: "error", message: "Cart is empty" });
      return;
    }

    try {
      const cart = useCartStore.getState().carts[currentContextId!] || [];
      const kitchenGroups: Record<string, any[]> = {};
      cart
        .filter((i: any) => i.status !== "VOIDED")
        .forEach((item: any) => {
          const kCode = item.KitchenTypeCode || "0";
          if (!kitchenGroups[kCode]) kitchenGroups[kCode] = [];
          kitchenGroups[kCode].push(item);
        });

      for (const [kCode, items] of Object.entries(kitchenGroups)) {
        const kName =
          items[0].KitchenTypeName || (kCode === "0" ? "KITCHEN" : kCode);
        const printerIp = items[0].PrinterIP;
        const kotData = {
          orderId: displayOrderId,
          orderNo: displayOrderId,
          tableNo:
            orderContext?.orderType === "DINE_IN"
              ? orderContext.tableNo
              : `TW-${orderContext?.takeawayNo}`,
          deviceNo: "1",
          waiterName: orderContext?.serverName || "Staff",
          items: items,
          kitchenName: kName,
        };
        if (enableKOT) {
          await UniversalPrinter.printKOT(
            kotData,
            "SYSTEM",
            "REPRINT",
            printerIp,
          );
        }
      }

      if (enableKOT) {
        showToast({
          type: "success",
          message: "KOT Reprinted",
          subtitle: "Tickets sent to kitchen",
        });
      } else {
        showToast({
          type: "info",
          message: "KOT Printing Disabled",
          subtitle: "Please enable it in General Settings",
        });
      }
      setShowReprintOptions(false);
    } catch (err) {
      console.error("Reprint KOT error:", err);
      showToast({ type: "error", message: "Reprint Failed" });
    }
  };

  const handleReprintBill = async () => {
    const cart = useCartStore.getState().carts[currentContextId!] || [];
    if (!cart.length) {
      showToast({ type: "error", message: "Cart is empty" });
      return;
    }

    if (!enableCheckoutBill) {
      showToast({
        type: "info",
        message: "Bill Printing Disabled",
        subtitle:
          "Checkout Bill printing is currently disabled in General Settings.",
      });
      setShowReprintOptions(false);
      return;
    }

    try {
      const cart = useCartStore.getState().carts[currentContextId!] || [];
      const discountInfo = useCartStore.getState().discounts[
        currentContextId!
      ] || { applied: false, type: "fixed", value: 0 };

      const subtotal = cart.reduce((sum: number, item: any) => {
        if (item.status === "VOIDED") return sum;
        return sum + (item.price || 0) * item.qty;
      }, 0);

      const discAmt = discountInfo.applied
        ? discountInfo.type === "percentage"
          ? (subtotal * discountInfo.value) / 100
          : discountInfo.value
        : 0;

      const gstAmt = subtotal * ((paymentSettings.gstPercentage || 0) / 100);
      const total = subtotal - discAmt + gstAmt;

      const saleData = {
        items: cart,
        total: total,
        subtotal: subtotal,
        discount: discountInfo,
        orderId: displayOrderId,
        tableNo: orderContext?.tableNo,
        waiterName: orderContext?.serverName,
        date: new Date(),
        isCheckout: true,
      };

      await UniversalPrinter.printCheckoutBill(
        saleData,
        user?.userId || "SYSTEM",
        {
          ...discountInfo,
          amount: discAmt,
        },
      );

      showToast({
        type: "success",
        message: "Bill Printing",
        subtitle: "Receipt sent to printer",
      });
      setShowReprintOptions(false);
    } catch (err) {
      console.error("Print Bill error:", err);
      showToast({ type: "error", message: "Printing Failed" });
    }
  };

  // Sidebar width should be more responsive
  const cartWidth = isTablet
    ? width > 1024
      ? 380
      : 330
    : isLandscape
      ? usableWidth * 0.38
      : width * 0.62;

  const mainWidth = showCart
    ? (isLandscape && !isTablet ? usableWidth : width) - cartWidth
    : (isLandscape && !isTablet ? usableWidth : width);

  const columns = isTablet
    ? isLandscape
      ? showCart
        ? (width > 1200 ? 5 : 3)
        : (width > 1200 ? 7 : 5)
      : showCart
        ? 2
        : 3
    : isLandscape
      ? showCart
        ? 2
        : 3
      : showCart
        ? 1
        : 2;

  const gap = isPhone ? (isLandscape ? 12 : 8) : 12;
  // Increase internal padding subtraction (24 -> 32) to ensure cards don't touch edges or sidebar
  const cardWidth = Math.floor(
    (mainWidth - (isPhone ? 32 : 40) - gap * (columns - 1)) / columns,
  );

  const renderTopBar = () => (
    <View
      style={[
        styles.topBar,
        isPhone && isLandscape && { marginBottom: 6, height: 40 },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.replace("/(tabs)/category")}
        style={[
          styles.backBtn,
          isPhone && isLandscape && { width: 36, height: 36, borderRadius: 8 },
        ]}
      >
        <Ionicons
          name="arrow-back"
          size={isPhone && isLandscape ? 20 : 24}
          color={Theme.textPrimary}
        />
      </TouchableOpacity>
      <View
        style={[
          styles.searchWrap,
          isPhone && isLandscape && { height: 36, flex: 0.8 },
        ]}
      >
        <Ionicons
          name="search"
          size={isPhone && isLandscape ? 16 : 20}
          color={Theme.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={[
            styles.searchInput,
            isPhone && isLandscape && { fontSize: 13 },
          ]}
          placeholder="Search items..."
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={16} color={Theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerRightActions}>
        <TouchableOpacity
          style={[
            styles.headerBillBtn,
            isPhone &&
            isLandscape && { width: 36, height: 36, borderRadius: 8 },
          ]}
          onPress={() => setShowReprintOptions(true)}
        >
          <Ionicons
            name="receipt-outline"
            size={isPhone && isLandscape ? 20 : 24}
            color={Theme.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.headerCartBtn,
            isPhone &&
            isLandscape && { width: 36, height: 36, borderRadius: 8 },
            showCart && { backgroundColor: Theme.primaryLight },
          ]}
          onPress={toggleCart}
        >
          <Ionicons
            name={showCart ? "cart" : "cart-outline"}
            size={isPhone && isLandscape ? 20 : 24}
            color={Theme.primary}
          />
          <CartBadge isPhone={isPhone} isLandscape={isLandscape} />
        </TouchableOpacity>

        <View style={styles.topActions} />
      </View>
    </View>
  );

  const renderCategoryNav = () => (
    <View
      style={[
        styles.categoryNavigation,
        isPhone && isLandscape && { marginBottom: 6 },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catScroll}
      >
        {kitchens.map((k: any) => (
          <TouchableOpacity
            key={k.CategoryId}
            style={[
              styles.catPill,
              selectedKitchenId === k.CategoryId && styles.catPillActive,
              isPhone && isLandscape && { height: 36, paddingHorizontal: 16 },
            ]}
            onPress={() => loadGroups(k.CategoryId)}
          >
            <Text
              style={[
                styles.catText,
                selectedKitchenId === k.CategoryId && styles.catTextActive,
                isPhone && isLandscape && { fontSize: 13 },
              ]}
            >
              {k.KitchenTypeName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View
        style={isPhone && isLandscape ? { marginTop: 12 } : { marginTop: 15 }}
      >
        {isInitialLoading ? (
          <GroupSkeleton />
        ) : groups.length === 0 ? (
          <View style={styles.emptyNavState}>
            <Text style={styles.emptyNavText}>No Dishgroup added</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupScroll}
          >
            {groups.map((g: any) => (
              <TouchableOpacity
                key={g.DishGroupId}
                style={[
                  styles.groupPill,
                  selectedGroup === g.DishGroupId && styles.groupPillActive,
                  isPhone &&
                  isLandscape && { height: 36, paddingHorizontal: 14 },
                ]}
                onPress={() => loadDishes(g.DishGroupId)}
              >
                <Text
                  style={[
                    styles.groupText,
                    selectedGroup === g.DishGroupId && styles.groupTextActive,
                    isPhone && isLandscape && { fontSize: 12 },
                  ]}
                >
                  {g.DishGroupName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const dismissKeyboard = () => Keyboard.dismiss();

  useEffect(() => {
    const newId = getContextId(orderContext);
    setCurrentContext(newId);
  }, [orderContext]);

  useEffect(() => {
    const initMenu = async () => {
      setIsInitialLoading(true);
      await fetchMenu();
      const currentKitchens = useMenuStore.getState().kitchens;
      if (currentKitchens.length > 0) {
        await loadGroups(currentKitchens[0].CategoryId);
      }
      setIsInitialLoading(false);
    };
    initMenu();
  }, []);

  const loadGroups = async (kitchenId: string) => {
    setSelectedKitchenId(kitchenId);
    const groupsData = await fetchGroups(kitchenId);
    setGroups(groupsData);
    if (groupsData.length > 0) {
      await loadDishes(groupsData[0].DishGroupId);
    }
  };

  const loadDishes = async (groupId: string) => {
    setSelectedGroup(groupId);
    setIsLoadingDishes(true);
    const dishesData = await fetchDishes(groupId);
    setItems(dishesData);
    setIsLoadingDishes(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const filteredItems = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return items;

    // Search across all dishes if query exists
    return allDishes.filter((d) => {
      const name = (d.Name || d.DishName || "").toLowerCase();
      const code = (d.DishCode || "").toLowerCase();
      const desc = (d.Description || "").toLowerCase();

      return (
        name.includes(query) || code.includes(query) || desc.includes(query)
      );
    });
  }, [debouncedSearch, items, allDishes]);

  const openModifiers = React.useCallback(
    async (dish: any) => {
      console.log("Dish Clicked", dish);
      try {
        const splitRes = await fetch(
          `${API_URL}/api/menu/checksplitdish/${dish.DishId}`
        );
        if (splitRes.ok) {
          const splitData = await splitRes.json();
          console.log("SplitData", splitData);
          if (splitData.IsGroupDish === true) {
            const res = await fetch(
              `${API_URL}/api/menu/splitdishes`
            );
            const data = await res.json();
            setSplitMembers(data);
            setSelectedSplitDish(dish);
            setShowSplitModal(true);
            return;
          }
        }
      } catch (err) {
        console.log("Split API Error", err);
      }

      const currentKitchen = kitchens.find(
        (k) => k.CategoryId === selectedKitchenId,
      );
      const currentKitchenName = currentKitchen?.KitchenTypeName || "KITCHEN";
      const currentKitchenCode =
        currentKitchen?.KitchenTypeCode || String(selectedKitchenId || "0");

      const addToCartSimple = (overridePrice?: number) => {
        addToCartGlobal({
          id: dish.DishId,
          name: dish.Name,
          price: overridePrice !== undefined ? overridePrice : (dish.Price || 0),
          categoryName: currentKitchenName,
          KitchenTypeName: dish.KitchenTypeName || currentKitchenName,
          PrinterIP: dish.PrinterIP,
          KitchenTypeCode: dish.KitchenTypeCode || currentKitchenCode,
          isServiceCharge: dish.isServiceCharge,
          IsOpenItem: dish.IsOpenItem,
        });
      };

      // OPEN ITEM: Prompt for custom price before doing anything else
      const isItOpenItem = Number(dish.IsOpenItem) === 1 || dish.IsOpenItem === true || dish.IsOpenItem === 'true' || dish.IsOpenItem === '1';
      if (isItOpenItem) {
        setOpenItemDish({
          ...dish,
          _kitchenName: currentKitchenName,
          _kitchenCode: currentKitchenCode,
        });
        setOpenItemPrice(dish.Price > 0 ? String(dish.Price) : "");
        setOpenItemError("");
        setShowOpenItemModal(true);
        return; // Wait for user to confirm price
      }

      // Prevent concurrent fetches for the same dish
      if (fetchingModifiers.current.has(dish.DishId)) return;
      fetchingModifiers.current.add(dish.DishId);

      const cachedData = modifierCache[dish.DishId];
      if (cachedData) {
        if (cachedData.length > 0) {
          setSelectedDish(dish);
          setSelectedModifierIds([]);
          setCustomMods([]);
          setModifiers(cachedData);
          setShowModifier(true);
        } else {
          addToCartSimple();
        }
        return;
      }

      // No need to set isAdding state for UI blocking
      setLoadingModifiers(true);
      setSelectedDish(dish);
      setSelectedModifierIds([]);
      setCustomMods([]);

      try {
        const res = await fetch(`${API_URL}/api/menu/modifiers/${dish.DishId}`);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          setModifiers(data);
          setShowModifier(true);
        } else {
          addToCartSimple();
        }
      } catch (err) {
        addToCartSimple();
      } finally {
        // Remove dishId from fetching set after fetch completes
        fetchingModifiers.current.delete(dish.DishId);
        setLoadingModifiers(false);
      }
    },
    [selectedKitchenId, kitchens, modifierCache],
  );

  const renderDishItem = React.useCallback(
    ({ item }: { item: any }) => {
      return (
        <DishCardWrapper
          item={item}
          width={cardWidth}
          onPress={openModifiers}
          isPhone={isPhone}
          isTablet={isTablet}
          isLandscape={isLandscape}
        />
      );
    },
    [cardWidth, openModifiers, isPhone, isTablet, isLandscape],
  );

  const toggleModifier = (mod: any) => {
    if (mod.ModifierName.toUpperCase() === "OPEN") {
      setShowCustomModal(true);
      return;
    }

    setSelectedModifierIds((prev) => {
      const next = prev.includes(mod.ModifierID)
        ? prev.filter((id) => id !== mod.ModifierID)
        : [...prev, mod.ModifierID];
      return next;
    });
  };

  const addCustomMod = () => {
    if (!customItemName) return;
    const newId = `custom-${Date.now()}`;
    const newMod = {
      ModifierID: newId,
      ModifierName: customItemName,
      Price: parseFloat(customItemPrice) || 0,
    };

    setCustomMods((prev) => [...prev, newMod]);
    setSelectedModifierIds((prev) => [...prev, newId]);

    setShowCustomModal(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const addWithModifiers = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedDish) {
      const allAvailable = [...modifiers, ...customMods];
      const selectedMods = allAvailable.filter((m) =>
        selectedModifierIds.includes(m.ModifierID),
      );

      const modsToAdd = selectedMods.map((m) => ({
        ModifierId: String(m.ModifierID || m.ModifierId || ""),
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
      }));

      const extra = modsToAdd.reduce((sum, m) => sum + (m.Price || 0), 0);
      const finalPrice = (selectedDish.Price || 0) + extra;

      const currentKitchen = kitchens.find(
        (k) => k.CategoryId === selectedKitchenId,
      );
      const currentKitchenName = currentKitchen?.KitchenTypeName || "Kitchen";
      const currentKitchenCode =
        currentKitchen?.KitchenTypeCode || selectedKitchenId;

      addToCartGlobal({
        id: selectedDish.DishId,
        name: selectedDish.Name,
        price: finalPrice,
        modifiers: modsToAdd as any,
        basePrice: selectedDish.Price || 0,
        categoryName: currentKitchenName, // Grouping by Kitchen Name
        KitchenTypeName: selectedDish.KitchenTypeName || currentKitchenName,
        PrinterIP: selectedDish.PrinterIP,
        KitchenTypeCode: selectedDish.KitchenTypeCode || currentKitchenCode,
        splitMembers: selectedDish.splitMembers || undefined,
        isServiceCharge: selectedDish.isServiceCharge,
      } as any);

    }
    setShowModifier(false);
  };

  // OPEN ITEM: Validate and add to cart at custom price
  const confirmOpenItemPrice = () => {
    const trimmed = openItemPrice.trim();
    if (!trimmed || trimmed === "") {
      setOpenItemError("Please enter a price.");
      return;
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0) {
      setOpenItemError("Enter a valid non-negative number.");
      return;
    }
    if (parsed === 0) {
      setOpenItemError("Price cannot be zero.");
      return;
    }

    const dish = openItemDish;
    if (!dish) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addToCartGlobal({
      id: dish.DishId,
      name: dish.Name,
      price: parsed,
      categoryName: dish._kitchenName,
      KitchenTypeName: dish.KitchenTypeName || dish._kitchenName,
      PrinterIP: dish.PrinterIP,
      KitchenTypeCode: dish.KitchenTypeCode || dish._kitchenCode,
      IsOpenItem: dish.IsOpenItem,
      isServiceCharge: dish.isServiceCharge,
    });

    // Reset
    setShowOpenItemModal(false);
    setOpenItemDish(null);
    setOpenItemPrice("");
    setOpenItemError("");
  };

  if (!orderContext) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        {isLandscape ? (
          <View style={styles.layout}>
            {/* DESKTOP LAYOUT - Full height sidebar */}
            <View style={[styles.main, { width: mainWidth }]}>
              {renderTopBar()}
              {renderCategoryNav()}
              <View style={styles.gridContainer}>
                {isLoadingDishes || isInitialLoading ? (
                  <DishGridSkeleton
                    cardWidth={cardWidth}
                    columns={columns}
                    gap={gap}
                    isPhone={isPhone}
                  />
                ) : (
                  <FlatList
                    data={filteredItems}
                    keyExtractor={(item, index) =>
                      item.DishId || `dish-${index}`
                    }
                    numColumns={columns}
                    key={columns}
                    renderItem={renderDishItem}
                    columnWrapperStyle={
                      columns > 1 ? { gap: gap, marginBottom: gap } : undefined
                    }
                    getItemLayout={(data, index) => ({
                      length: 150, // Fixed height estimate
                      offset: 150 * Math.floor(index / columns),
                      index,
                    })}
                    removeClippedSubviews={Platform.OS === "android"}
                    initialNumToRender={columns * 5}
                    maxToRenderPerBatch={columns * 3}
                    windowSize={5}
                    contentContainerStyle={[
                      styles.listPadding,
                      columns === 1 && { gap: gap },
                      filteredItems.length === 0 && {
                        flex: 1,
                        justifyContent: "center",
                      },
                    ]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      !isLoadingDishes && !isInitialLoading ? (
                        <View style={styles.emptyItemsState}>
                          <Ionicons
                            name="restaurant-outline"
                            size={64}
                            color={Theme.textMuted}
                          />
                          <Text style={styles.emptyItemsText}>
                            No dish items added
                          </Text>
                        </View>
                      ) : null
                    }
                  />
                )}
              </View>
            </View>
            {showCart && <CartSidebar width={cartWidth} />}
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
            {/* TAB/PHONE LAYOUT - Hawker Style */}
            <View style={{ padding: isPhone ? 10 : 20, paddingBottom: 0 }}>
              {renderTopBar()}
              {renderCategoryNav()}
            </View>

            <View style={[styles.layout, { flex: 1 }]}>
              <View
                style={[
                  styles.main,
                  {
                    width: mainWidth,
                    paddingTop: 0,
                    paddingHorizontal: isPhone ? 10 : 20,
                  },
                ]}
              >
                <View style={styles.gridContainer}>
                  {isLoadingDishes || isInitialLoading ? (
                    <DishGridSkeleton
                      cardWidth={cardWidth}
                      columns={columns}
                      gap={gap}
                      isPhone={isPhone}
                    />
                  ) : (
                    <FlatList
                      data={filteredItems}
                      keyExtractor={(item) => item.DishId}
                      numColumns={columns}
                      key={columns}
                      renderItem={renderDishItem}
                      columnWrapperStyle={
                        columns > 1
                          ? { gap: gap, marginBottom: gap }
                          : undefined
                      }
                      contentContainerStyle={[
                        styles.listPadding,
                        columns === 1 && { gap: gap },
                        filteredItems.length === 0 && {
                          flex: 1,
                          justifyContent: "center",
                        },
                      ]}
                      getItemLayout={(data, index) => ({
                        length: 150, // Fixed height estimate
                        offset: 150 * Math.floor(index / columns),
                        index,
                      })}
                      removeClippedSubviews={Platform.OS !== "web"}
                      initialNumToRender={columns * 5}
                      maxToRenderPerBatch={columns * 3}
                      windowSize={5}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        !isLoadingDishes && !isInitialLoading ? (
                          <View style={styles.emptyItemsState}>
                            <Ionicons
                              name="restaurant-outline"
                              size={64}
                              color={Theme.textMuted}
                            />
                            <Text style={styles.emptyItemsText}>
                              No dish items added
                            </Text>
                          </View>
                        ) : null
                      }
                    />
                  )}
                </View>
              </View>
              {showCart && <CartSidebar width={cartWidth} />}
            </View>
          </View>
        )}

        {showSplitModal && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { height: "80%" }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedSplitDish?.Name}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSplitModal(false)}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 15,
                }}
              >
                <Text
                  style={{
                    width: 100,
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                  }}
                >
                  Amount
                </Text>

                <TextInput
                  placeholder="Enter Amount"
                  value={splitAmount}
                  onChangeText={setSplitAmount}
                  keyboardType="numeric"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 45,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 15,
                }}
              >
                <Text
                  style={{
                    width: 100,
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                  }}
                >
                  Song Name
                </Text>

                <TextInput
                  placeholder="Enter Song Name"
                  value={songName}
                  onChangeText={setSongName}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 45,
                  }}
                />
              </View>

              {/* Scrollable List */}
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={true}
              >
                {splitMembers.map((item, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#eee",
                    }}
                  >
                    <Text>{item.Name}</Text>

                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...splitMembers];
                        updated[index].IsSelected =
                          !updated[index].IsSelected;
                        setSplitMembers(updated);
                      }}
                    >
                      <Ionicons
                        name={
                          item.IsSelected
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={22}
                        color="green"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              {/* Fixed Done Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: "#22c55e",
                  paddingVertical: 12,
                  borderRadius: 10,
                  marginTop: 15,
                  alignItems: "center",
                }}
                onPress={() => {
                  const selected = splitMembers.filter(
                    (x) => x.IsSelected
                  );

                  if (selected.length === 0) {
                    alert("Please select at least one member");
                    return;
                  }

                  const totalAmount = parseFloat(splitAmount || "0");

                  if (totalAmount <= 0) {
                    alert("Please enter amount");
                    return;
                  }

                  if (!songName.trim()) {
                    alert("Please enter song name");
                    return;
                  }

                  const shareAmount =
                    totalAmount / selected.length;

                  selected.forEach((member) => {
                    console.log({
                      id: member.DishId,
                      name: `${selectedSplitDish.Name} - ${member.Name}`,
                      songName: songName,
                      price: shareAmount,
                    });
                    addToCartGlobal({
                      id: member.DishId,
                      name: `${selectedSplitDish.Name} - ${member.Name}`,
                      songName: songName,
                      price: shareAmount,
                    } as any);
                  });

                  setShowSplitModal(false);
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "bold",
                    fontSize: 16,
                  }}
                >
                  DONE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* MODIFIER MODAL (Screenshot 1 Style) */}
        {showModifier && selectedDish && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Modifiers {selectedDish.Name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowModifier(false)}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {loadingModifiers ? (
                  <ActivityIndicator color={Theme.primary} size="large" />
                ) : (
                  <ScrollView
                    style={styles.modifierList}
                    showsVerticalScrollIndicator={false}
                  >
                    {modifiers.map((m) => (
                      <TouchableOpacity
                        key={m.ModifierID}
                        style={styles.modifierRow}
                        onPress={() => toggleModifier(m)}
                      >
                        <Text style={styles.modifierName}>
                          {m.ModifierName}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            selectedModifierIds.includes(m.ModifierID) &&
                            styles.checkboxActive,
                          ]}
                        >
                          {selectedModifierIds.includes(m.ModifierID) && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowModifier(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnAdd,
                    { backgroundColor: Theme.success },
                  ]}
                  onPress={addWithModifiers}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.modalBtnTextAdd}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ADD CUSTOM ITEM SUB-MODAL (Screenshot 2 Style) */}
            {showCustomModal && (
              <View
                style={[
                  styles.modalOverlay,
                  { zIndex: 2000, backgroundColor: "rgba(0,0,0,0.8)" },
                ]}
              >
                <View style={styles.customItemModal}>
                  <Text style={styles.customModalTitle}>Add Custom Item</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Item Name *</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter item name"
                      placeholderTextColor="#666"
                      value={customItemName}
                      onChangeText={setCustomItemName}
                      autoFocus
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Price (Optional)</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter price"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={customItemPrice}
                      onChangeText={setCustomItemPrice}
                    />
                  </View>

                  <View style={styles.customModalActions}>
                    <TouchableOpacity
                      style={styles.customBtnCancel}
                      onPress={() => setShowCustomModal(false)}
                    >
                      <Text style={styles.customBtnTextCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.customBtnAdd}
                      onPress={addCustomMod}
                    >
                      <Text style={styles.customBtnTextAdd}>Add Item</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
      <Modal transparent visible={showReprintOptions} animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowReprintOptions(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { maxWidth: 300 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Reprint</Text>
                  <TouchableOpacity
                    onPress={() => setShowReprintOptions(false)}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.reprintOption}
                  onPress={handleReprintKOT}
                >
                  <View
                    style={[
                      styles.reprintIcon,
                      { backgroundColor: Theme.primaryLight },
                    ]}
                  >
                    <Ionicons
                      name="print-outline"
                      size={20}
                      color={Theme.primary}
                    />
                  </View>
                  <Text style={styles.reprintText}>KOT Reprint</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.reprintOption}
                  onPress={handleReprintBill}
                >
                  <View
                    style={[
                      styles.reprintIcon,
                      { backgroundColor: Theme.successBg },
                    ]}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={20}
                      color={Theme.success}
                    />
                  </View>
                  <Text style={styles.reprintText}>Bill Reprint</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* OPEN ITEM PRICE MODAL */}
      <Modal
        transparent
        visible={showOpenItemModal}
        animationType="fade"
        onRequestClose={() => setShowOpenItemModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOpenItemModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.customItemModal}>
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <Text style={styles.customModalTitle}>Enter Price</Text>
                  <TouchableOpacity
                    onPress={() => setShowOpenItemModal(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={22} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Dish name */}
                <Text
                  style={{
                    fontFamily: Fonts.medium,
                    fontSize: 13,
                    color: Theme.textSecondary,
                    marginBottom: 16,
                  }}
                  numberOfLines={2}
                >
                  {openItemDish?.Name}
                </Text>

                {/* Price input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Custom Price *</Text>
                  <TextInput
                    style={[
                      styles.customInput,
                      openItemError
                        ? { borderColor: Theme.danger, borderWidth: 1.5 }
                        : {},
                    ]}
                    placeholder={
                      openItemDish?.Price > 0
                        ? `Default: ${openItemDish.Price}`
                        : "Enter price"
                    }
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                    value={openItemPrice}
                    onChangeText={(t) => {
                      setOpenItemPrice(t);
                      setOpenItemError("");
                    }}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={confirmOpenItemPrice}
                  />
                  {openItemError ? (
                    <Text
                      style={{
                        color: Theme.danger,
                        fontSize: 11,
                        fontFamily: Fonts.medium,
                        marginTop: 4,
                      }}
                    >
                      {openItemError}
                    </Text>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={styles.customModalActions}>
                  <TouchableOpacity
                    style={styles.customBtnCancel}
                    onPress={() => setShowOpenItemModal(false)}
                  >
                    <Text style={styles.customBtnTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.customBtnAdd}
                    onPress={confirmOpenItemPrice}
                  >
                    <Text style={styles.customBtnTextAdd}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const full = 999;
const styles = StyleSheet.create({
  reprintOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.bgMain,
    gap: 12,
  },
  reprintText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  reprintIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  layout: { flex: 1, flexDirection: "row" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  rail: {
    width: 90,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: Theme.border,
    alignItems: "center",
    paddingVertical: 20,
  },
  railTop: { flex: 1, gap: 20 },
  railItem: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  railItemActive: { backgroundColor: Theme.bgMain },
  railLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  railLabelActive: { color: Theme.primary },
  railBottom: { gap: 20, alignItems: "center" },
  logoutBtn: { alignItems: "center" },
  main: {
    flex: 1,
    padding: 12,
    ...Platform.select({
      web: {
        transitionProperty: "width",
        transitionDuration: "0.3s",
        transitionTimingFunction: "ease-in-out",
      } as any,
    }),
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  searchWrap: {
    flex: 0.7,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    ...Theme.shadowSm,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textPrimary,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  categoryNavigation: { marginBottom: 15 },
  catScroll: { gap: 10 },
  catPill: {
    paddingHorizontal: 20,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  catPillActive: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primary,
    borderWidth: 1.5,
    ...Theme.shadowSm,
  },
  catText: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.textSecondary },
  catTextActive: { color: Theme.primary },
  groupScroll: { gap: 8 },
  groupPill: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: full,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  groupPillActive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  groupText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  groupTextActive: { color: Theme.textPrimary, fontFamily: Fonts.bold },
  gridContainer: { flex: 1 },
  listPadding: { paddingBottom: 80 },
  card: {
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  qtyBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Theme.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#fff",
    ...Theme.shadowSm,
  },
  qtyBadgeText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  dishImageWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: Theme.bgMain,
  },
  dishImg: { width: "100%", height: "100%" },
  dishName: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    minHeight: 36,
    lineHeight: 18,
  },
  dishPrice: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginTop: 4,
  },
  headerCartBtn: {
    width: 48,
    height: 48,
    backgroundColor: Theme.bgMain,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    position: "relative",
  },
  headerBillBtn: {
    width: 48,
    height: 48,
    backgroundColor: Theme.bgMain,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: Theme.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  title: { fontSize: 24, fontFamily: Fonts.black },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    width: "85%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  modalClose: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 18,
  },
  modalBody: { flexShrink: 1 },
  modifierList: { borderTopWidth: 1, borderTopColor: Theme.border },
  modifierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.bgMain,
  },
  modifierName: {
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: { backgroundColor: Theme.primary },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  modalBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  modalBtnAdd: {
    flex: 1.5,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.success,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    ...Theme.shadowSm,
  },
  modalBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },

  /* Submodal Styling (Screenshot 2) */
  customItemModal: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  customModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.bold,
    marginBottom: 8,
  },
  customInput: {
    height: 52,
    backgroundColor: Theme.bgMain,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.medium,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  customModalActions: { flexDirection: "row", gap: 12, marginTop: 10 },
  customBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  customBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  customBtnAdd: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  customBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },

  emptyNavState: {
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  emptyNavText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  emptyItemsState: {
    flex: 1,
    height: 300,
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
  },
  emptyItemsText: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
});
