import { socket } from "../constants/socket";

export interface SyncCartParams {
  orderContext: {
    tableId?: string;
    tableNo?: string;
    takeawayNo?: string;
    orderType: "DINE_IN" | "TAKEAWAY" | "MANUAL";
    section?: string;
    serverId?: number;
    serverName?: string;
  };
  cart: any[];
  discountInfo: {
    applied: boolean;
    type: "percentage" | "fixed";
    value: number;
    label?: string;
  } | null;
  gstPercentage: number;
  roundOff: number;
  active: boolean;
  orderId?: string;
  paymentMethod?: string;
}

export interface PaymentSuccessParams {
  orderId: string;
  total: number;
  paid: number;
  change: number;
  method: string;
}

export const CustomerDisplaySync = {
  isPaymentActive: false,

  syncCart: (params: SyncCartParams) => {
    try {
      const { orderContext, cart, discountInfo, gstPercentage, roundOff, active, orderId, paymentMethod } = params;
      
      const currencySymbol = "$";
      const gstRate = (gstPercentage || 0) / 100;

      // 1. Calculate totals matching cashier formulas
      const { grossTotal, totalItemDiscount } = cart.reduce(
        (acc, item) => {
          const isVoided = item.status === "VOIDED" || item.StatusCode === 0 || item.statusCode === 0;
          if (isVoided) return acc;
          
          const baseTotal = (item.price || 0) * item.qty;
          let itemDiscount = 0;
          const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
          const discType = item.discountType || 'percentage';
          
          if (discAmt > 0) {
            if (discType === 'percentage') {
              itemDiscount = baseTotal * (discAmt / 100);
            } else {
              itemDiscount = discAmt * item.qty;
            }
          }

          return {
            grossTotal: acc.grossTotal + baseTotal,
            totalItemDiscount: acc.totalItemDiscount + itemDiscount,
          };
        },
        { grossTotal: 0, totalItemDiscount: 0 }
      );

      const subTotal = grossTotal - totalItemDiscount;

      const orderDiscountAmount = (() => {
        if (!discountInfo?.applied) return 0;
        if (discountInfo.type === "percentage") {
          return (subTotal * discountInfo.value) / 100;
        }
        return discountInfo.value;
      })();

      const gstAmount = (subTotal - orderDiscountAmount) * gstRate;
      const baseTotal = subTotal - orderDiscountAmount + gstAmount;
      const netTotal = Math.max(0, baseTotal + roundOff);

      // 2. Prepare clean items list for display
      const displayItems = cart.map(item => {
        const baseTotal = (item.price || 0) * item.qty;
        let itemDiscount = 0;
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        const discType = item.discountType || 'percentage';
        
        if (discAmt > 0) {
          if (discType === 'percentage') {
            itemDiscount = baseTotal * (discAmt / 100);
          } else {
            itemDiscount = discAmt * item.qty;
          }
        }
        const isVoided = item.status === "VOIDED" || item.StatusCode === 0 || item.statusCode === 0;

        return {
          lineItemId: item.lineItemId || item.id,
          name: item.name,
          qty: item.qty,
          price: item.price,
          originalPrice: item.price * item.qty,
          finalPrice: baseTotal - itemDiscount,
          discountAmount: itemDiscount,
          discountPercent: discType === 'percentage' ? discAmt : 0,
          isVoided,
          note: item.note || item.notes || "",
          modifiers: item.modifiers || [],
        };
      });

      // 3. Emit via Socket.io
      const payload = {
        active,
        paymentSuccess: false,
        orderId,
        tableNo: orderContext.orderType === "DINE_IN" ? orderContext.tableNo : `TW-${orderContext.takeawayNo}`,
        orderType: orderContext.orderType,
        section: orderContext.section || "",
        items: displayItems,
        grossTotal,
        itemDiscounts: totalItemDiscount,
        subTotal,
        orderDiscountAmount,
        gstAmount,
        roundOff,
        netTotal,
        waiterName: orderContext.serverName || "",
        paymentMethod,
      };

      console.log("🖥️ [CustomerDisplaySync] Emitting cart update for Table/Takeaway:", payload.tableNo);
      socket.emit("customer_display_sync", payload);
    } catch (err: any) {
      console.error("🖥️ [CustomerDisplaySync] Failed to sync cart:", err.message);
    }
  },

  syncIdle: () => {
    try {
      if (CustomerDisplaySync.isPaymentActive) {
        console.log("🖥️ [CustomerDisplaySync] syncIdle blocked because payment is active");
        return;
      }
      console.log("🖥️ [CustomerDisplaySync] Emitting idle attract loop");
      socket.emit("customer_display_sync", {
        active: false,
        paymentSuccess: false,
      });
    } catch (err: any) {
      console.error("🖥️ [CustomerDisplaySync] Failed to sync idle state:", err.message);
    }
  },

  syncPaymentSuccess: (params: PaymentSuccessParams) => {
    try {
      console.log("🖥️ [CustomerDisplaySync] Emitting payment success:", params.orderId);
      socket.emit("customer_display_sync", {
        active: true,
        paymentSuccess: true,
        orderId: params.orderId,
        netTotal: params.total,
        paid: params.paid,
        change: params.change,
        paymentMethod: params.method,
      });
    } catch (err: any) {
      console.error("🖥️ [CustomerDisplaySync] Failed to sync payment success:", err.message);
    }
  }
};
