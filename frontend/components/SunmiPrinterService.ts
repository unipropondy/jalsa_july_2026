// components/SunmiPrinterService.ts - PERFECT DESIGN MATCHING YOUR PREVIEW ✅

import { Platform } from "react-native";
import { API_URL } from "../constants/Config";
import { formatToSingaporeTime } from "../utils/timezoneHelper";

// ✅ Guarded imports for native module to prevent crashes on non-Android platforms
let SunmiModule: any = null;
if (Platform.OS === "android") {
  try {
    SunmiModule = require("sunmi-printer-expo");
  } catch (e) {
    console.log("Sunmi module load failed:", e);
  }
}

class SunmiPrinterService {
  static async init(): Promise<boolean> {
    if (Platform.OS !== "android") {
      console.log("Not Android - cannot use Sunmi printer");
      return false;
    }

    try {
      if (!SunmiModule) return false;
      await SunmiModule.initPrinter();
      console.log("✅ Sunmi printer initialized");
      return true;
    } catch (error) {
      console.log("❌ Printer init failed:", error);
      return false;
    }
  }

  // Convert any image URL to Base64
  private static async urlToBase64(url: string): Promise<string> {
    console.log("🔄 Converting URL to Base64:", url);
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        let base64 = reader.result as string;
        if (base64.includes(",")) {
          base64 = base64.split(",")[1];
        }
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Print logos (thermal printers can't do side-by-side, so print one after another)
  private static async printLogos(companySettings: any): Promise<void> {
    const hasCompanyLogo =
      companySettings.showCompanyLogo && companySettings.companyLogo;
    const hasHalalLogo =
      companySettings.showHalalLogo && companySettings.halalLogo;

    // Print company logo
    if (hasCompanyLogo) {
      try {
        let logoUrl = companySettings.companyLogo;
        if (logoUrl && !logoUrl.startsWith("http")) {
          // Use API_URL as primary, fallback to production if needed
          logoUrl = logoUrl.startsWith("/")
            ? `${API_URL}${logoUrl}`
            : `${API_URL}/${logoUrl}`;
        }
        const base64Image = await this.urlToBase64(logoUrl);
        await SunmiModule.printImageBase64(base64Image);
        await SunmiModule.lineWrap(1);
        console.log("✅ Company logo printed");
      } catch (e) {
        console.log("❌ Company logo failed:", e);
        // Secondary fallback to production URL if API_URL fails
        try {
          let prodUrl = companySettings.companyLogo;
          if (prodUrl && !prodUrl.startsWith("http")) {
            prodUrl = prodUrl.startsWith("/")
              ? `${API_URL}${prodUrl}`
              : `${API_URL}/${prodUrl}`;
            const base64Image = await this.urlToBase64(prodUrl);
            await SunmiModule.printImageBase64(base64Image);
            await SunmiModule.lineWrap(1);
          }
        } catch (e2) {}
      }
    }

    // Print halal logo
    if (hasHalalLogo) {
      try {
        let halalUrl = companySettings.halalLogo;
        if (halalUrl && !halalUrl.startsWith("http")) {
          halalUrl = halalUrl.startsWith("/")
            ? `${API_URL}${halalUrl}`
            : `${API_URL}/${halalUrl}`;
        }
        const base64Image = await this.urlToBase64(halalUrl);
        await SunmiModule.printImageBase64(base64Image);
        await SunmiModule.lineWrap(1);
        console.log("✅ Halal logo printed");
      } catch (e) {
        console.log("❌ Halal logo failed:", e);
        try {
          let prodUrl = companySettings.halalLogo;
          if (prodUrl && !prodUrl.startsWith("http")) {
            prodUrl = prodUrl.startsWith("/")
              ? `${API_URL}${prodUrl}`
              : `${API_URL}/${prodUrl}`;
            const base64Image = await this.urlToBase64(prodUrl);
            await SunmiModule.printImageBase64(base64Image);
            await SunmiModule.lineWrap(1);
          }
        } catch (e2) {}
      }
    }
  }

  // Center text (full width 32 chars)
  private static async center(text: any): Promise<void> {
    if (!SunmiModule) return;
    const maxWidth = 32;
    let displayText = String(text || "");
    if (displayText.length > maxWidth) {
      displayText = displayText.substring(0, maxWidth - 3) + "...";
    }
    const padding = Math.max(
      0,
      Math.floor((maxWidth - displayText.length) / 2),
    );
    const centeredText = " ".repeat(padding) + displayText;
    await SunmiModule.printText(centeredText + "\n");
  }

  // Left aligned
  private static async left(text: any): Promise<void> {
    if (!SunmiModule) return;
    await SunmiModule.printText(String(text || "") + "\n");
  }

  // Divider line (full width 32 chars)
  private static async divider(char: string = "-"): Promise<void> {
    if (!SunmiModule) return;
    await SunmiModule.printText(char.repeat(32) + "\n");
  }

  // Double divider
  private static async doubleDivider(char: string = "="): Promise<void> {
    if (!SunmiModule) return;
    await SunmiModule.printText(char.repeat(32) + "\n");
  }

  // Two columns (for totals)
  private static async twoCols(left: any, right: any): Promise<void> {
    if (!SunmiModule) return;
    const cleanLeft = String(left || "");
    const cleanRight = String(right || "");
    const totalWidth = 32;
    const spaceCount = totalWidth - cleanLeft.length - cleanRight.length;
    if (spaceCount > 0) {
      await SunmiModule.printText(cleanLeft + " ".repeat(spaceCount) + cleanRight + "\n");
    } else {
      // If it doesn't fit in one line, print left first, then right on next line right-aligned
      await SunmiModule.printText(cleanLeft + "\n");
      await SunmiModule.printText(cleanRight.padStart(totalWidth, " ") + "\n");
    }
  }

  // Four columns for items (ITEM, QTY, PRICE, TOTAL)
  private static async itemRow(
    name: any,
    qty: any,
    price: any,
    total: any,
  ): Promise<void> {
    if (!SunmiModule) return;
    const cleanName = String(name || "");
    const cleanQty = String(qty || "");
    const cleanPrice = String(price || "");
    const cleanTotal = String(total || "");

    const nameWidth = 12;
    const qtyWidth = 3;
    const priceWidth = 7;
    const totalWidth = 10;

    let line = cleanName.substring(0, nameWidth).padEnd(nameWidth, " ");
    line += cleanQty.padStart(qtyWidth, " ");
    line += cleanPrice.padStart(priceWidth, " ");
    line += cleanTotal.padStart(totalWidth, " ");
    await SunmiModule.printText(line + "\n");
  }

  // Item header
  private static async itemHeader(): Promise<void> {
    if (!SunmiModule) return;
    let line = "ITEM".padEnd(12, " ");
    line += "QTY".padStart(3, " ");
    line += "PRICE".padStart(7, " ");
    line += "TOTAL".padStart(10, " ");
    await SunmiModule.printText(line + "\n");
  }

  static async printReceipt(
    saleData: any,
    companySettings: any,
  ): Promise<boolean> {
    try {
      if (!SunmiModule) {
        const initialized = await this.init();
        if (!initialized) return false;
      }

      const symbol = companySettings.currencySymbol || "$";

      // ============ HEADER SECTION ============
      await this.doubleDivider("=");
      await SunmiModule.lineWrap(1);

      if (saleData.isCheckout) {
        await this.center("CHECKOUT BILL");
        await this.center("PAYMENT PENDING");
        await this.doubleDivider("=");
        await SunmiModule.lineWrap(1);
      }

      // Print logos
      await this.printLogos(companySettings);

      // Company Name - Large and Bold
      await this.center(companySettings.name || "YOUR STORE");
      await SunmiModule.lineWrap(1);

      // Address
      if (companySettings.address) {
        const addressLines = companySettings.address.split("\n");
        for (const line of addressLines) {
          if (line.trim()) {
            await this.center(line.trim());
          }
        }
      }

      // Phone
      if (companySettings.phone) {
        await this.center(`📞 ${companySettings.phone}`);
      }

      // Email
      if (companySettings.email) {
        await this.center(`📧 ${companySettings.email}`);
      }

      // GST Number
      if (companySettings.gstNo) {
        await this.center(`GST: ${companySettings.gstNo}`);
      }

      await this.doubleDivider("=");
      await SunmiModule.lineWrap(1);

      // ============ BILL DETAILS ============
      const saleDate = saleData.originalDate ? new Date(saleData.originalDate) : 
                       saleData.date ? new Date(saleData.date) : 
                       new Date();
      const dateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: 'numeric' }).format(saleDate);
      const timeStr = formatToSingaporeTime(saleDate);

      await this.left(`INVOICE NO: ${saleData.invoiceNumber || saleData.id}`);
      if (saleData.tableNo) {
        await this.left(`TABLE NO: ${saleData.tableNo}`);
      }
      await this.left(`DATE: ${dateStr} ${timeStr}`);
      await this.left(
        `WAITER: ${saleData.waiterName || saleData.cashier || companySettings.cashierName || "Staff"}`,
      );
      await this.divider("-");

      // ============ ITEMS SECTION ============
      await this.itemHeader();
      await this.divider("-");

      // Items loop
      const printItems = (saleData.items || []).filter(
        (i: any) => i.status !== "VOIDED",
      );
      const activeItems = (saleData.items || []).filter((i: any) => i.status !== "VOIDED" && i.statusCode !== 0);
      const allItemsHaveSC = activeItems.length > 0 && activeItems.every((item: any) => Number(item.isServiceCharge) === 1 || item.isServiceCharge === true);

      for (const item of printItems) {
        const itemName = (
          item.name ||
          item.DishName ||
          item.ProductName ||
          ""
        ).substring(0, 12);
        const qtyNum =
          parseInt(String(item.qty || item.quantity || item.Quantity || 1)) ||
          1;
        const qty = qtyNum.toString();

        const priceNum =
          parseFloat(String(item.price || item.Price || item.Cost || 0)) || 0;
        const price = `${symbol}${priceNum.toFixed(2)}`;

        const totalNum = priceNum * qtyNum;
        const total = `${symbol}${totalNum.toFixed(2)}`;

        await this.itemRow(itemName, qty, price, total);

        // Print full name if truncated
        if ((item.name || "").length > 12) {
          await this.left(`   ${item.name}`);
        }

        const songName = item.songName || item.SongName || "";
        if (songName) {
          await this.left(`   🎵 ${songName}`);
        }

        const isSC = Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;
        if (isSC && !allItemsHaveSC) {
          await this.left(`    [Service Charge ${companySettings.serviceChargePercentage}%]`);
        }

        // Print modifiers if they have a positive amount/price
        if (item.modifiers && Array.isArray(item.modifiers)) {
          for (const m of item.modifiers) {
            const mName = (m.ModifierName || m.name || "").trim();
            const mAmt = parseFloat(String(m.Amount ?? m.Price ?? m.amount ?? m.price ?? 0)) || 0;
            if (mAmt > 0) {
              await this.twoCols(`   + ${mName}`, `${symbol}${(mAmt * qtyNum).toFixed(2)}`);
            }
          }
        }

        // ✅ Print Item Discount
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        if (discAmt > 0) {
          const discType = item.discountType || "percentage";
          const discStr =
            discType === "percentage"
              ? `-${discAmt}%`
              : `-${symbol}${discAmt.toFixed(2)}`;
          await this.left(`    Discount: ${discStr}`);
        }
      }

      await this.divider("-");

      // ============ SUBTOTAL & DISCOUNT ============
      // Calculate item discounts and gross total
      let grossTotal = 0;
      let totalItemDiscount = 0;
      (saleData.items || []).forEach((item: any) => {
        if (item.status === "VOIDED") return;
        const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
        const baseTotal = (item.price || 0) * qtyNum;
        let itemDiscount = 0;
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        const discType = item.discountType || "percentage";
        if (discAmt > 0) {
          if (discType === "percentage") {
            itemDiscount = baseTotal * (discAmt / 100);
          } else {
            itemDiscount = discAmt * qtyNum;
          }
        }
        grossTotal += baseTotal;
        totalItemDiscount += itemDiscount;
      });

      const orderDiscount =
        parseFloat(String(saleData.discountAmount || 0)) || 0;
      const hasAnyDiscount = totalItemDiscount > 0 || orderDiscount > 0;
      let currentSubtotal = grossTotal;

      await this.twoCols("Sub Total:", `${symbol}${grossTotal.toFixed(2)}`);

      if (totalItemDiscount > 0) {
        await this.twoCols(
          "Item Discounts:",
          `-${symbol}${totalItemDiscount.toFixed(2)}`,
        );
        currentSubtotal -= totalItemDiscount;
      }

      if (orderDiscount > 0) {
        const discLabel =
          saleData.discountType === "percentage"
            ? `Discount (${saleData.discountValue}%):`
            : "Discount:";
        await this.twoCols(discLabel, `-${symbol}${orderDiscount.toFixed(2)}`);
        currentSubtotal -= orderDiscount;
      }

      if (hasAnyDiscount) {
        await this.divider("-");
        const netLabel = "Net Amount:";
        await this.twoCols(netLabel, `${symbol}${currentSubtotal.toFixed(2)}`);
      }
      await this.divider("-");

      // ============ SERVICE CHARGE & GST ============
      let finalTotal =
        saleData.total || saleData.totalAmount || currentSubtotal;
      const gstRate = companySettings.gstPercentage || 0;
      const scPercentage = companySettings.serviceChargePercentage || 0;
      const savedSC = saleData.serviceCharge != null ? parseFloat(String(saleData.serviceCharge)) : null;
      
      let serviceChargeAmount = 0;
      if (savedSC !== null) {
        serviceChargeAmount = savedSC;
      } else {
        let scEligibleSubtotal = 0;
        (saleData.items || []).forEach((item: any) => {
          if (item.status === "VOIDED") return;
          const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
          const baseTotal = (item.price || 0) * qtyNum;
          let itemDiscount = 0;
          const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
          const discType = item.discountType || "percentage";
          if (discAmt > 0) {
            if (discType === "percentage") {
              itemDiscount = baseTotal * (discAmt / 100);
            } else {
              itemDiscount = discAmt * qtyNum;
            }
          }
          const itemSubtotal = baseTotal - itemDiscount;
          const isSC = Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;
          if (isSC) {
            scEligibleSubtotal += itemSubtotal;
          }
        });
        let scEligibleNet = scEligibleSubtotal;
        if (grossTotal > 0 && orderDiscount > 0) {
          const subtotalPostItemDisc = grossTotal - totalItemDiscount;
          if (subtotalPostItemDisc > 0) {
            const proportion = scEligibleSubtotal / subtotalPostItemDisc;
            scEligibleNet = Math.max(0, scEligibleSubtotal - proportion * orderDiscount);
          }
        }
        serviceChargeAmount = scEligibleNet * (scPercentage / 100);
      }
      const hasSC = serviceChargeAmount > 0;
      const effectiveSCPercentage = serviceChargeAmount > 0 && currentSubtotal > 0
        ? Math.round((serviceChargeAmount / currentSubtotal) * 100)
        : scPercentage;
      const taxableAmount = currentSubtotal + serviceChargeAmount;
      const gstAmountRaw = gstRate > 0 ? taxableAmount * (gstRate / 100) : 0;
      const gstAmount = Math.round(gstAmountRaw * 100) / 100;
      
      if (finalTotal === 0) {
        finalTotal = taxableAmount + gstAmount;
      }
      
      const printedRoundOff = saleData.roundOff && saleData.roundOff !== 0
        ? parseFloat((finalTotal - (taxableAmount + gstAmount)).toFixed(2))
        : 0;

      if (!hasAnyDiscount) {
        await this.twoCols("Sub Total:", `${symbol}${currentSubtotal.toFixed(2)}`);
      }

      if (hasSC) {
        await this.twoCols(
          allItemsHaveSC ? "Service Charge:" : "Item Service Charge:",
          `${symbol}${serviceChargeAmount.toFixed(2)}`,
        );
      }

      if (gstRate > 0) {
        await this.twoCols(
          `GST (${gstRate}%):`,
          `${symbol}${gstAmount.toFixed(2)}`,
        );
        await this.divider("-");
      }

      // ============ ROUND OFF ============
      if (printedRoundOff && printedRoundOff !== 0) {
        const roLabel = printedRoundOff > 0 ? "+Round Off:" : "Round Off:";
        await this.twoCols(roLabel, `${symbol}${printedRoundOff.toFixed(2)}`);
        await this.divider("-");
      }

      // ============ GRAND TOTAL ============
      await this.twoCols("GRAND TOTAL:", `${symbol}${finalTotal.toFixed(2)}`);
      await this.doubleDivider("=");

      // ============ PAYMENT ============
      if (saleData.isCheckout) {
        await this.center("PAYMENT STATUS: PENDING");
      } else {
        await this.twoCols("PAYMENT:", saleData.paymentMethod || "Cash");

        if (saleData.cashPaid && saleData.cashPaid > 0) {
          await this.twoCols("PAID:", `${symbol}${saleData.cashPaid.toFixed(2)}`);
          if (saleData.change && saleData.change > 0) {
            await this.twoCols(
              "CHANGE:",
              `${symbol}${saleData.change.toFixed(2)}`,
            );
          }
        }
      }

      await SunmiModule.lineWrap(1);

      // ============ FOOTER ============
      if (saleData.isCheckout) {
        await this.center("PLEASE PAY AT THE COUNTER");
      } else {
        await this.center("THANK YOU! COME AGAIN!");
      }
      await SunmiModule.lineWrap(1);
      await this.center("SMART-POS BY UNIPROSG");

      if (companySettings.gstPercentage > 0) {
        await this.center(
          `* Prices include ${companySettings.gstPercentage}% GST`,
        );
      }

      await SunmiModule.lineWrap(3);
      await SunmiModule.cutPaper();

      return true;
    } catch (error) {
      console.log("❌ Print error:", error);
      return false;
    }
  }

  static async printKOT(
    data: any,
    type: "NEW" | "ADDITIONAL" | "REPRINT" = "NEW",
  ): Promise<boolean> {
    try {
      if (!SunmiModule) {
        const initialized = await this.init();
        if (!initialized) return false;
      }

      const title =
        type === "REPRINT"
          ? "REPRINT"
          : type === "ADDITIONAL"
            ? "ADDITIONAL"
            : "NEW ORDER";
      const items = data.items || [];
      const tableNo = data.tableNo || "N/A";
      const orderNo = data.orderNo || data.orderId || "N/A";
      const waiter = data.waiterName || "Staff";
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit' }).format(now);
      const timeStr = formatToSingaporeTime(now, { hour: '2-digit', minute: '2-digit', hour12: false });
      const timestamp = `${dateStr} ${timeStr}`;

      const setSize = async (size: number) => {
        try {
          if (SunmiModule.setFontSize) await SunmiModule.setFontSize(size);
          else if (SunmiModule.setTextSize) await SunmiModule.setTextSize(size);
          else if (SunmiModule.updateFontSize)
            await SunmiModule.updateFontSize(size);
        } catch (e) {
          console.log("Font size not supported");
        }
      };

      // ============ HEADER (Large & Bold) ============
      await setSize(36);
      await this.left(title);
      await SunmiModule.lineWrap(1);

      await setSize(24);
      await this.left(timestamp);
      await SunmiModule.lineWrap(1);

      // ============ TABLE INFO (EXTREMELY LARGE) ============
      await this.doubleDivider("=");
      await setSize(48);
      await this.left(`TABLE: ${tableNo}`);
      await SunmiModule.lineWrap(1);

      await setSize(24);
      await this.left(`Order: #${orderNo}`);
      await this.left(`Waiter: ${waiter}`);
      await this.doubleDivider("=");

      // ============ ITEMS ============
      await SunmiModule.lineWrap(1);
      for (const item of items) {
        // Quantity & Item Name combined on a single line at size 36
        await setSize(36);
        await this.left(`[${item.qty || item.quantity || 1}] ${item.name}`);

        const songName = item.songName || item.SongName || "";
        if (songName) {
          await setSize(28);
          await this.left(`  🎵 ${songName}`);
          await SunmiModule.lineWrap(1);
        }

        const isTw = !!(
          item.isTakeaway ||
          item.IsTakeaway ||
          item.isTakeAway ||
          item.IsTakeAway
        );
        if (isTw) {
          await setSize(28);
          await this.left(`  - Takeaway`);
          await SunmiModule.lineWrap(1);
        }

        // Modifiers (Normal)
        if (item.modifiers && item.modifiers.length > 0) {
          await setSize(24);
          for (const mod of item.modifiers) {
            await this.left(`  + ${mod.ModifierName || mod.name}`);
            await SunmiModule.lineWrap(1);
          }
        }

        const noteText =
          item.note || item.notes || item.Remarks || item.remarks;
        if (noteText) {
          await setSize(28);
          await this.left(`  * NOTE: ${noteText}`);
          await SunmiModule.lineWrap(1);
        }

        await this.divider("-");
      }

      // Reset font size at the end
      await setSize(24);

      await SunmiModule.lineWrap(3);
      await SunmiModule.cutPaper();
      return true;
    } catch (err) {
      console.log("❌ Sunmi KOT Error:", err);
      return false;
    }
  }
}

export default SunmiPrinterService;
