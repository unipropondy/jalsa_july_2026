// frontend/src/components/UniversalPrinter.ts - COMPLETE WITH DISCOUNT SUPPORT ✅

import { format } from "date-fns";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import ThermalPrinter from "react-native-thermal-printer";
import { API_URL } from "../constants/Config";
import { formatToSingaporeDate, formatToSingaporeTime } from "../utils/timezoneHelper";
import BillPDFGenerator from "./BillPDFGenerator";
import { PrinterDetector } from "./PrinterDetector";
import SunmiPrinterService from "./SunmiPrinterService";

// Printer types
export type PrinterType =
  | "thermal"
  | "receipt"
  | "label"
  | "laser"
  | "bluetooth"
  | "network"
  | "usb"
  | "unknown";

interface PrinterInfo {
  type: PrinterType;
  name: string;
  address?: string;
  isDefault: boolean;
  paperSize?: "58mm" | "80mm" | "A4" | "label";
}

interface DiscountInfo {
  applied: boolean;
  type: "percentage" | "fixed";
  value: number;
  amount: number;
}

class UniversalPrinter {
  private static detectedPrinters: PrinterInfo[] = [];
  private static defaultPrinter: PrinterInfo | null = null;
  private static cachedPrinters: any = null;
  private static lastPrintersFetchTime: number = 0;

  static async detectAllPrinters(): Promise<PrinterInfo[]> {
    const printers: PrinterInfo[] = [];
    if (Platform.OS !== "android") return printers;

    try {
      // Android Print Service
      try {
        const hasPrintService = await this.checkAndroidPrintService();
        if (hasPrintService) {
          printers.push({
            type: "laser",
            name: "Android Print Service",
            isDefault: false,
            paperSize: "A4",
          });
        }
      } catch (e) {}

      this.detectedPrinters = printers;
      this.defaultPrinter =
        printers.find((p) => p.type === "thermal") || printers[0] || null;
      return printers;
    } catch (error) {
      return [];
    }
  }

  static async openCashDrawer(): Promise<boolean> {
    // Currently disabled to prevent crashes with uninstalled native modules
    // Use sunmi-printer-expo for this if supported in future
    console.log("Cash drawer opening requested");
    return false;
  }

  private static getPrintWidth(printer: PrinterInfo): number {
    switch (printer.paperSize) {
      case "58mm":
        return 164;
      case "80mm":
        return 226;
      case "A4":
        return 612;
      case "label":
        return 300;
      default:
        return 226;
    }
  }

  private static async isIpReachable(ip: string, port: number = 80, timeoutMs: number = 600): Promise<boolean> {
    if (!ip || ip.trim() === "") return false;
    const cleanIp = ip.trim();
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cleanIp);
    if (!isIp) return false;

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
      console.log(`🔌 [isIpReachable] Connected/Alive: ${cleanIp}`);
      return true;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        console.log(`🔌 [isIpReachable] Offline/Timeout on ${cleanIp}`);
        return false;
      }
      console.log(`🔌 [isIpReachable] Host responded (alive): ${cleanIp}`);
      return true;
    }
  }

  // ==================== SALES REPORT ====================
  static async printSalesReport(
    reportData: any,
    userId?: string | number,
    t?: any,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = this.generateSalesReportHTML(reportData, company);

      // ✅ Save as PDF (no preview)
      const { uri } = await Print.printToFileAsync({ html });
      console.log("📄 Sales report saved at:", uri);

      // ✅ Optionally share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }

      return true;
    } catch (error) {
      console.log("Sales report error:", error);
      return false;
    }
  }
  private static generateSalesReportHTML(data: any, company: any): string {
    const symbol = company.currencySymbol || "$";
    return `<!DOCTYPE html><html><head><style>
      body { font-family: monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
      .company-name { font-size: 24px; font-weight: bold; }
      .report-title { font-size: 20px; font-weight: bold; margin: 15px 0; text-align: center; }
      .section-title { font-size: 16px; font-weight: bold; margin: 15px 0 10px; background: #f0f0f0; padding: 5px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
      .amount { text-align: right; }
      .summary-box { display: inline-block; width: 30%; padding: 10px; margin: 5px; background: #f9f9f9; text-align: center; border-radius: 5px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "POS SYSTEM"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div><div class="report-title">SALES REPORT</div><div>Period: ${data.period || "Today"}</div></div>
      <div style="text-align:center"><div class="summary-box"><div>Total Sales</div><div style="font-size:24px">${data.summary?.totalSales || 0}</div></div>
      <div class="summary-box"><div>Total Items</div><div style="font-size:24px">${data.summary?.totalItems || 0}</div></div>
      <div class="summary-box"><div>Total Revenue</div><div style="font-size:24px">${symbol}${(data.summary?.totalRevenue || 0).toFixed(2)}</div></div></div>
      <div class="section-title">💳 PAYMENT BREAKDOWN</div>${this.generateTableFromObject(data.paymentBreakdown || {}, symbol)}</div>
      ${data.items && data.items.length > 0 ? `<div class="section-title">📋 ITEM WISE SALES</div>${this.generateItemsTable(data.items, symbol)}` : ""}
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  // ==================== CATEGORY REPORT ====================
  static async printCategoryReport(
    categories: any[],
    selectedCategory: string | null,
    categoryItems: any[],
    categoryTransactions: any[],
    userId?: string | number,
    t?: any,
    options?: any,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = selectedCategory
        ? this.generateCategoryDetailHTML(
            selectedCategory,
            categoryItems,
            categoryTransactions,
            company,
            options,
          )
        : this.generateAllCategoriesHTML(categories, company, options);

      // ✅ Save as PDF (no preview)
      const { uri } = await Print.printToFileAsync({ html });
      console.log("📄 Category report saved at:", uri);

      // ✅ Optionally share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }

      return true;
    } catch (error) {
      console.log("Category report error:", error);
      return false;
    }
  }
  private static generateCategoryDetailHTML(
    categoryName: string,
    items: any[],
    transactions: any[],
    company: any,
    options?: any,
  ): string {
    const symbol = company.currencySymbol || "$";
    const groupTransactions = (tx: any[]) => {
      const grouped: any = {};
      tx.forEach((t) => {
        if (!grouped[t.saleId])
          grouped[t.saleId] = {
            id: t.saleId,
            date: t.saleDate,
            items: [],
            total: 0,
          };
        grouped[t.saleId].items.push({
          name: t.name,
          quantity: t.quantity,
          price: t.price,
        });
        grouped[t.saleId].total += t.price * t.quantity;
      });
      return Object.values(grouped).sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .category-title { font-size: 22px; font-weight: bold; text-align: center; margin: 20px 0; }
      .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px; background: #f0f0f0; padding: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .transaction-card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 15px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "Store"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div></div>
      <div class="category-title">📦 ${categoryName}</div>
      <div style="display:flex;justify-content:space-around;margin:20px 0;padding:15px;background:#f9f9f9;border-radius:5px">
        <div><div>Total Items</div><div style="font-size:18px;font-weight:bold">${items.length}</div></div>
        <div><div>Quantity Sold</div><div style="font-size:18px;font-weight:bold">${items.reduce((s, i) => s + (i.quantity || 0), 0)}</div></div>
        <div><div>Total Revenue</div><div style="font-size:18px;font-weight:bold">${symbol}${items.reduce((s, i) => s + (i.revenue || 0), 0).toFixed(2)}</div></div>
      </div>
      <div class="section-title">📋 Items Sold</div>${this.generateItemsTable(items, symbol)}
      <div class="section-title">📄 Transaction History</div>${
        transactions.length
          ? groupTransactions(transactions)
              .map(
                (sale: any) =>
                  `<div class="transaction-card"><div><strong>#${sale.id}</strong> - ${symbol}${sale.total.toFixed(2)}</div><div>${new Date(sale.date).toLocaleString()}</div>${sale.items.map((item: any) => `<div>• ${item.name} x${item.quantity} - ${symbol}${(item.price * item.quantity).toFixed(2)}</div>`).join("")}</div>`,
              )
              .join("")
          : "<p>No transactions</p>"
      }
      <div class="footer"><p>End of Report</p></div>
    </body></html>`;
  }

  private static generateAllCategoriesHTML(
    categories: any[],
    company: any,
    options?: any,
  ): string {
    const symbol = company.currencySymbol || "$";
    const summary = options?.summary || {
      totalSales: 0,
      totalItems: 0,
      totalRevenue: 0,
      paymentBreakdown: {},
    };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .summary-section { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
      .category-card { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; padding: 15px; }
      .category-name { font-size: 18px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "Store"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div><div class="report-title">📊 CATEGORY WISE SALES</div></div>
      <div class="summary-section"><div><div>Total Sales</div><div>${summary.totalSales}</div></div><div><div>Total Items</div><div>${summary.totalItems}</div></div><div><div>Total Revenue</div><div>${symbol}${summary.totalRevenue.toFixed(2)}</div></div></div>
      <div><h3>💳 PAYMENT BREAKDOWN</h3>${Object.entries(
        summary.paymentBreakdown,
      )
        .map(
          ([m, a]) => `<div>${m}: ${symbol}${(a as number).toFixed(2)}</div>`,
        )
        .join("")}</div>
      ${categories.map((cat) => `<div class="category-card"><div class="category-name">${cat.name}</div><div>Revenue: ${symbol}${(cat.totalRevenue || 0).toFixed(2)} | Items: ${cat.totalQuantity || 0}</div>${this.generateItemsTable(cat.items || [], symbol)}</div>`).join("")}
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  private static generateItemsTable(items: any[], symbol: string): string {
    if (!items.length) return "<p>No items</p>";
    return `<table><thead><tr><th>Item</th><th class="amount">Qty</th><th class="amount">Price</th><th class="amount">Total</th></tr></thead><tbody>${items.map((i) => `<tr><td>${i.name}</td><td class="amount">${i.quantity || 0}</td><td class="amount">${symbol}${(i.price || 0).toFixed(2)}</td><td class="amount">${symbol}${(i.revenue || 0).toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }

  private static generateTableFromObject(
    obj: Record<string, any>,
    symbol: string,
  ): string {
    const entries = Object.entries(obj);
    if (!entries.length) return "<p>No data</p>";
    return `<table><tbody>${entries.map(([k, v]) => `<tr><td>${k}</td><td class="amount">${symbol}${(v as number).toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }

  // ==================== KOT PRINTING (80mm) ====================
  private static async logPrintJob(
    orderId: string,
    orderNo: string,
    type: "NEW" | "ADDITIONAL" | "REPRINT"
  ): Promise<void> {
    try {
      const baseUrl = API_URL;
      await fetch(`${baseUrl}/api/orders/log-print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderId && orderId.length > 30 ? orderId : null,
          orderNumber: orderNo,
          printType: 1, // KOT
          isEdit: type === "ADDITIONAL",
          isReprint: type === "REPRINT",
          isHold: false,
        }),
      });
      console.log("📝 Print job logged to PrintReport");
    } catch (logErr) {
      console.warn("Failed to log print to DB:", logErr);
    }
  }

  static async printKOT(
    orderData: any,
    userId?: string | number,
    type: "NEW" | "ADDITIONAL" | "REPRINT" = "NEW",
    printerIpOverride?: string,
  ): Promise<boolean> {
    // 🚀 NON-BLOCKING BACKGROUND EXECUTION: Run printing in the background to prevent UI lag on APK
    (async () => {
      try {
        const company = await BillPDFGenerator.loadSettings(userId);
        const html = this.generateKOTHTML(orderData, type);
        const targetIp = printerIpOverride || company.printerIp;

        // ✅ 1. Try Hardware Printer (WiFi or Bluetooth)
        let isReachable = false;
        const isIp = targetIp && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetIp.trim());
        if (isIp) {
          isReachable = await this.isIpReachable(targetIp);
        } else if (targetIp && targetIp.trim().length > 0) {
          isReachable = true;
        }

        if (isReachable) {
          try {
            const text = this.formatKOTThermalText(orderData, type);

            if (isIp) {
              console.log(`🌐 KOT WiFi print to: ${targetIp}`);
              const printPromise = ThermalPrinter.printTcp({
                ip: targetIp,
                port: 9100,
                payload: text,
                mmFeedPaper: 60,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("WiFi Timeout")), 1500),
              );
              await Promise.race([printPromise, timeoutPromise]);
            } else {
              console.log(`🔵 KOT Bluetooth print to: ${targetIp}`);
              const printPromise = ThermalPrinter.printBluetooth({
                macAddress: targetIp,
                payload: text,
                mmFeedPaper: 60,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("BT Timeout")), 3000),
              );
              await Promise.race([printPromise, timeoutPromise]);
            }
            await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
            return;
          } catch (printError) {
            console.warn("❌ Hardware KOT failed/timeout, falling back...");
          }
        }

        // ✅ 2. Try Sunmi direct print (Silent)
        const sunmiReady = await SunmiPrinterService.init().catch(() => false);
        if (sunmiReady) {
          try {
            const printPromise = SunmiPrinterService.printKOT(orderData, type);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Sunmi Timeout")), 2000),
            );
            const printed = await Promise.race([printPromise, timeoutPromise]);

            if (printed) {
              console.log("✅ KOT Printed with Sunmi - NO PREVIEW");
              await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
              return;
            }
          } catch (sunmiErr) {
            console.warn("❌ Sunmi KOT failed/timeout:", sunmiErr);
          }
        }

        // ✅ 3. Web Fallback (Bypass expo-print for better isolation)
        if (Platform.OS === "web") {
          try {
            const frame = document.createElement("iframe");
            frame.style.visibility = "hidden";
            frame.style.position = "fixed";
            frame.style.right = "0";
            frame.style.bottom = "0";
            frame.style.width = "0";
            frame.style.height = "0";
            document.body.appendChild(frame);

            const doc = frame.contentWindow?.document;
            if (doc) {
              doc.open();
              doc.write(html);
              doc.close();

              // Wait for internal content to load
              setTimeout(() => {
                frame.contentWindow?.focus();
                frame.contentWindow?.print();
                setTimeout(() => document.body.removeChild(frame), 1000);
              }, 500);
            }
            await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
            return;
          } catch (e) {
            console.error("Web KOT isolated print failed:", e);
          }
        }

        // ✅ 3. Mobile Fallback (Android/iOS)
        const { uri } = await Print.printToFileAsync({
          html,
          width: 226, // 80mm approximate
        });

        if (Platform.OS === "android" || Platform.OS === "ios") {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri);
          }
        }

        // ✅ 4. LOG TO DATABASE (Audit Trail)
        await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
      } catch (error) {
        console.log("KOT Print Error:", error);
      }
    })();

    return true;
  }

  private static generateKOTHTML(data: any, type: string): string {
    let title =
      type === "REPRINT"
        ? "REPRINT"
        : type === "ADDITIONAL"
          ? "ADDITIONAL"
          : "NEW ORDER";
    title = title.replace(/\s*KOT\s*/gi, "").trim();

    const items = data.items || [];
    const tableNo = data.tableNo || "N/A";
    const deviceNo = data.deviceNo || "1";
    const orderNo = data.orderNo || data.orderId || "N/A";
    const waiter = data.waiterName || "Staff";
    const kotDateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    const kotTimeStr = formatToSingaporeTime(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false });
    const timestamp = `${kotDateStr} ${kotTimeStr}`;
    const kitchenName = data.kitchenName || "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { 
            size: 80mm auto; 
            margin: 0; 
          }
          body { 
            font-family: 'Arial', sans-serif; 
            width: 80mm; 
            padding: 0; 
            margin: 0; 
            color: #000; 
            background: #fff;
          }
          .kot-container { 
            padding: 2mm 4mm; 
            width: 72mm;
          }
          
          .header-box { 
            background: #000 !important; 
            color: #fff !important; 
            padding: 4px 10px; 
            text-align: left; 
            font-weight: 900; 
            font-size: 32px; 
            display: inline-block;
            margin-bottom: 4px;
            text-transform: uppercase;
            -webkit-print-color-adjust: exact;
          }
          
          .timestamp {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 12px;
            color: #333;
          }
          
          .table-info {
            display: flex;
            justify-content: space-between;
            border-bottom: 3px dashed #000;
            padding: 4px 0;
            margin-bottom: 8px;
            font-size: 32px;
            font-weight: 900;
          }
          
          .headers {
            display: flex;
            border-bottom: 2px dashed #000;
            padding: 4px 0;
            font-size: 20px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .qty-head { width: 60px; margin-right: 10px; }
          
          .item-row {
            border-bottom: 2px solid #000;
            padding: 15px 0;
          }
          
          .item-main {
            display: flex;
            align-items: flex-start;
          }
          
          .item-qty {
            font-size: 48px;
            font-weight: 900;
            width: 60px;
            line-height: 1;
            margin-right: 10px;
          }
          
          .item-name {
            font-size: 36px;
            font-weight: 900;
            flex: 1;
            line-height: 1.1;
          }
          
          .modifier-list {
            margin-left: 70px;
            margin-top: 5px;
          }
          
          .modifier-item {
            font-size: 26px;
            font-weight: 900;
            display: block;
          }
          
          .remarks {
            margin-left: 70px;
            font-size: 22px;
            font-weight: 900;
            font-style: italic;
            margin-top: 6px;
          }
          
          .footer {
            margin-top: 15px;
            font-size: 18px;
            font-weight: 900;
            font-family: monospace;
          }
          
          .kitchen-name {
            text-align: center;
            font-size: 32px;
            font-weight: 900;
            margin-top: 25px;
            text-transform: uppercase;
            border: 3px solid #000;
            padding: 10px;
          }
          
          @media print {
            body { width: 80mm; }
            .header-box { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="kot-container">
          <div class="header-box">${title}</div>
          <div class="timestamp">${timestamp}</div>
          
          <div class="table-info">
            <span>Table:${tableNo}</span>
          </div>
          
          <div class="headers">
            <div class="qty-head">Qty</div>
            <div>Item</div>
          </div>

          <div class="item-list">
            ${items
              .map((item: any) => {
                const noteText =
                  item.note || item.notes || item.Remarks || item.remarks;
                return `
                <div class="item-row">
                  <div class="item-main">
                    <div class="item-qty">${item.quantity || item.qty || 1}</div>
                    <div class="item-name">
                      ${item.name}
                      ${item.songName || item.SongName ? `<div style="font-size: 20px; font-weight: normal; color: #555; margin-top: 4px;">🎵 ${item.songName || item.SongName}</div>` : ''}
                    </div>
                  </div>
                  ${
                    item.isTakeaway ||
                    item.IsTakeaway ||
                    item.isTakeAway ||
                    item.IsTakeAway
                      ? `
                    <div class="modifier-list">
                      <span class="modifier-item" style="font-weight: bold;">- Takeaway</span>
                    </div>
                  `
                      : ""
                  }
                  ${
                    item.modifiers && item.modifiers.length > 0
                      ? `
                    <div class="modifier-list">
                      ${item.modifiers
                        .map(
                          (m: any) => `
                        <span class="modifier-item">- ${m.name || m.ModifierName}</span>
                      `,
                        )
                        .join("")}
                    </div>
                  `
                      : ""
                  }
                  ${
                    noteText
                      ? `
                    <div class="remarks">
                      * NOTE: ${noteText}
                    </div>
                  `
                      : ""
                  }
                </div>
              `;
              })
              .join("")}
          </div>

          <div class="footer">
            Order By : ${waiter} #OR-${orderNo}
          </div>

          <div class="kitchen-name">${kitchenName}</div>
        </div>
      </body>
      </html>
    `;
  }

  private static formatKOTThermalText(data: any, type: string): string {
    const title =
      type === "REPRINT"
        ? "REPRINT"
        : type === "ADDITIONAL"
          ? "ADDITIONAL"
          : "NEW ORDER";
    const items = data.items || [];
    const tableNo = data.tableNo || "N/A";
    const waiter = data.waiterName || "Staff";
    const orderNo = data.orderNo || data.orderId || "";
    const kitchenName = data.kitchenName || "";

    let text = `[C]<B>${title}</B>\n`;
    const kotDateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
    const kotTimeStr = formatToSingaporeTime(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false });
    text += `[C]${kotDateStr} ${kotTimeStr}\n`;
    text += "[L]--------------------------------\n";

    // 🏠 Big centered table number
    text += `[C]<font size='big'>TABLE: ${tableNo}</font>\n`;
    text += "[L]--------------------------------\n";

    text += "[L]QTY  ITEM\n";
    text += "[L]--------------------------------\n";

    items.forEach((item: any) => {
      const qtyNum = item.quantity || item.qty || 1;
      const itemName = item.name || item.DishName || "";

      // 🚀 Square brackets [1] make quantity very clear and avoid alignment drift
      text += `[L]<font size='big'>[${qtyNum}] ${itemName}</font>\n`;

      const songName = item.songName || item.SongName || "";
      if (songName) {
        text += `[L]    🎵 ${songName}\n`;
      }

      const isTw = !!(
        item.isTakeaway ||
        item.IsTakeaway ||
        item.isTakeAway ||
        item.IsTakeAway
      );
      if (isTw) {
        text += `[L]    - Takeaway\n`;
      }

      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach((m: any) => {
          text += `[L]    + ${m.ModifierName || m.name}\n`;
        });
      }

      const noteText = item.note || item.notes || item.Remarks || item.remarks;
      if (noteText) {
        text += `[L]    * NOTE: ${noteText}\n`;
      }

      text += "[L]--------------------------------\n";
    });

    text += `[L]Order By: ${waiter}\n`;
    text += `[L]Order #: ${orderNo}\n`;

    if (kitchenName) {
      text += "[L]--------------------------------\n";
      text += `[C]<font size='big'><B>${kitchenName.toUpperCase()}</B></font>\n`;
    }

    text += "\n\n";
    return text;
  }

  // ==================== MAIN SMART PRINT WITH DISCOUNT ====================
  static async smartPrint(
    saleData: any,
    outletId?: string | number,
    t?: any,
    discountInfo?: DiscountInfo,
    preferredType?: PrinterType,
    isReprint: boolean = false,
  ): Promise<boolean> {
    // 🚀 NON-BLOCKING BACKGROUND EXECUTION: Run printing in the background to prevent UI lag on APK
    (async () => {
      try {
        const company = await BillPDFGenerator.loadSettings(outletId);

        // Load printer IPs dynamically from PrintMaster with caching
        let cashierIp = "";
        let takeawayIp = "";
        try {
          const now = Date.now();
          let printers = this.cachedPrinters;
          if (!printers || (now - this.lastPrintersFetchTime > 30000)) {
            const response = await fetch(
              `${API_URL}/api/settings/kitchen-printers`,
            );
            printers = await response.json();
            this.cachedPrinters = printers;
            this.lastPrintersFetchTime = now;
          }
          if (Array.isArray(printers)) {
            const cashierPrinter = printers.find((p) => p.PrinterType === 1);
            const takeawayPrinter = printers.find((p) => p.PrinterType === 3);
            cashierIp = cashierPrinter?.PrinterPath || "";
            takeawayIp = takeawayPrinter?.PrinterPath || "";
          }
        } catch (err) {
          console.warn("Failed to fetch printer IPs from PrintMaster:", err);
        }

        // Determine target printer IP based on order type (Dine-in vs Takeaway)
        const isTakeaway =
          !saleData.tableNo ||
          String(saleData.tableNo).trim() === "" ||
          String(saleData.tableNo).toUpperCase().startsWith("TW") ||
          String(saleData.tableNo).toUpperCase() === "TAKEAWAY" ||
          String(saleData.tableNo).toUpperCase() === "TAKE AWAY";

        let targetIp = "";
        if (isTakeaway) {
          targetIp = takeawayIp || cashierIp || company.printerIp || "";
        } else {
          targetIp = cashierIp || company.printerIp || "";
        }

        // ✅ 1. Try WiFi Printer with 3s Timeout
        let isReachable = false;
        if (targetIp && targetIp.trim().length > 0) {
          isReachable = await this.isIpReachable(targetIp);
        }

        if (isReachable) {
          console.log(
            `🌐 Trying WiFi (${isTakeaway ? "TakeAway" : "Cashier"}): ${targetIp}`,
          );
          try {
            const printPromise = this.printNetwork(
              saleData,
              outletId,
              {
                type: "network",
                address: targetIp,
              } as any,
              discountInfo,
            );

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("WiFi Timeout")), 1500),
            );
            const printed = await Promise.race([printPromise, timeoutPromise]);

            if (printed) return;
          } catch (err) {
            console.log("WiFi failed/timeout");
          }
        }

        // ✅ 2. Sunmi Detection with Timeout
        try {
          const detectorPromise = PrinterDetector.detectPrinter();
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Sunmi Timeout")), 2000),
          );
          const printerType = await Promise.race([
            detectorPromise,
            timeoutPromise,
          ]).catch(() => "none");

          if (printerType === "sunmi") {
            const printed = await this.printThermalReceipt(
              saleData,
              outletId,
              undefined,
              discountInfo,
            );
            if (printed) return;
          }
        } catch (e) {
          console.log("Sunmi failed/timeout");
        }

        // ✅ 3. Fallback to PDF/Web (Guaranteed)
        console.log("🔄 Fallback to PDF Preview");
        await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      } catch (error) {
        console.log("SmartPrint error:", error);
        await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      }
    })();

    return true;
  }

  /**
   * Print Checkout Bill (Guest Check)
   * Uses the same branding as the receipt but shows 'PAYMENT PENDING'
   */
  static async printCheckoutBill(
    saleData: any,
    outletId?: string | number,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      // ✅ FIX: Match the logic in PaymentSuccess by ensuring we have a valid ID
      const targetUserId = outletId || "1";
      const company = await BillPDFGenerator.loadSettings(targetUserId);

      // Set checkout flag for the template
      const enhancedSaleData = {
        ...saleData,
        isCheckout: true,
        // Ensure branding is present for the template
        shopName: company.name,
        shopAddress: company.address,
        shopPhone: company.phone,
        shopEmail: company.email,
        shopGst: company.gstNo,
      };

      // Use the standard smartPrint logic but with the checkout flag
      return await this.smartPrint(
        enhancedSaleData,
        targetUserId,
        undefined,
        discountInfo,
      );
    } catch (error: any) {
      console.error("❌ Checkout Print Error:", error);
      return false;
    }
  }

  // ==================== THERMAL PRINTING WITH DISCOUNT ====================
  private static async printThermalReceipt(
    saleData: any,
    userId?: string | number,
    printer?: PrinterInfo,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      // ✅ STEP 1: Try Sunmi direct print (NO preview)
      const sunmiReady = await SunmiPrinterService.init();
      if (sunmiReady) {
        const company = await BillPDFGenerator.loadSettings(userId);

        // ✅ Pass discount to saleData for Sunmi printer
        const enhancedSaleData = { ...saleData };
        if (discountInfo?.applied && discountInfo.amount > 0) {
          enhancedSaleData.discountAmount = discountInfo.amount;
          enhancedSaleData.discountType = discountInfo.type;
          enhancedSaleData.discountValue = discountInfo.value;
          enhancedSaleData.originalTotal = saleData.total + discountInfo.amount;
        }

        const printed = await SunmiPrinterService.printReceipt(
          enhancedSaleData,
          company,
        );
        if (printed) {
          console.log("✅ Printed with Sunmi printer - NO PREVIEW");
          return true;
        }
      }

      // ✅ STEP 2: If Sunmi fails, return false so smartPrint falls back to PDF dialog/share
      return false;
    } catch (error: any) {
      console.log("Thermal print error:", error);
      return false;
    }
  }
  // ==================== NETWORK PRINTING ====================
  private static async printNetwork(
    saleData: any,
    userId?: string | number,
    printer?: PrinterInfo,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const text = this.formatThermalTextWithDiscount(
        saleData,
        company,
        discountInfo,
      );
      const targetAddress = printer?.address || company.printerIp || "";

      if (!targetAddress) return false;

      const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetAddress);

      if (isIp) {
        await ThermalPrinter.printTcp({
          ip: targetAddress,
          port: 9100,
          payload: text,
          mmFeedPaper: 60,
        });
      } else {
        await ThermalPrinter.printBluetooth({
          macAddress: targetAddress,
          payload: text,
          mmFeedPaper: 60,
        });
      }
      return true;
    } catch (error: any) {
      console.log("❌ Network print error:", error);
      return false;
    }
  }

  private static formatTwoCols48(left: any, right: any): string {
    const cleanLeft = String(left || "");
    const cleanRight = String(right || "");
    const totalWidth = 48;
    const spaceCount = totalWidth - cleanLeft.length - cleanRight.length;
    if (spaceCount > 0) {
      return `[L]${cleanLeft}${" ".repeat(spaceCount)}${cleanRight}\n`;
    } else {
      return `[L]${cleanLeft}\n[L]${cleanRight.padStart(totalWidth, " ")}\n`;
    }
  }

  private static formatThermalTextWithDiscount(
    saleData: any,
    company: any,
    discountInfo?: DiscountInfo,
  ): string {
    const symbol = company.currencySymbol || "$";
    const isCheckout = !!saleData.isCheckout;

    // 📏 80mm standard is ~48 characters
    let text = "[C]================================================\n";
    if (isCheckout) {
      text += "[C]<font size='big'><B>CHECKOUT BILL</B></font>\n";
      text += "[C]<B>PAYMENT PENDING</B>\n";
    } else {
      text += "[C]<font size='big'><B>PAYMENT RECEIPT</B></font>\n";
    }
    text += "[C]================================================\n";

    // Header Info
    text += `[C]<B>${(company.name || "YOUR STORE").toUpperCase()}</B>\n`;
    if (company.address) text += `[C]${company.address}\n`;
    if (company.phone) text += `[C]Tel: ${company.phone}\n`;
    text += "[C]------------------------------------------------\n";

    const saleDate = saleData.originalDate ? new Date(saleData.originalDate) : 
                     saleData.date ? new Date(saleData.date) : 
                     new Date();

    text += `[L]Bill No: ${saleData.invoiceNumber || saleData.id || ""}\n`;
    if (saleData.tableNo) {
      text += `[L]<font size=\'big\'><B>TABLE: ${saleData.tableNo}</B></font>\n`;
    }
    const dateFormatted = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: 'numeric' }).format(saleDate);
    text += `[L]Date: ${dateFormatted} ${formatToSingaporeTime(saleDate)}\n`;
    text += `[L]Waiter: ${saleData.waiterName || "Staff"}\n`;
    text += "[L]------------------------------------------------\n";

    // Items Header
    text += "[L]ITEM                        QTY   PRICE    TOTAL\n";
    text += "[L]------------------------------------------------\n";

    const printItems = (saleData.items || []).filter(
      (i: any) => i.status !== "VOIDED",
    );
    const activeItems = (saleData.items || []).filter((i: any) => i.status !== "VOIDED" && i.statusCode !== 0);
    const allItemsHaveSC = activeItems.length > 0 && activeItems.every((item: any) => Number(item.isServiceCharge) === 1 || item.isServiceCharge === true);

    printItems.forEach((item: any) => {
      // 🛡️ Robust field mapping
      const name = (item.name || item.DishName || item.ProductName || "")
        .substring(0, 26)
        .padEnd(26);
      const qtyNum =
        parseInt(String(item.qty || item.quantity || item.Quantity || 1)) || 1;
      const qty = `[${qtyNum}]`.padStart(5);

      const priceNum =
        parseFloat(String(item.price || item.Price || item.Cost || 0)) || 0;
      const price = `${symbol}${priceNum.toFixed(2)}`.padStart(8);

      const totalNum = priceNum * qtyNum;
      const total = `${symbol}${totalNum.toFixed(2)}`.padStart(9);

      text += `[L]${name}${qty}${price}${total}\n`;

      const songName = item.songName || item.SongName || "";
      if (songName) {
        text += `[L]   🎵 ${songName}\n`;
      }

      // If name was truncated, print full name on next line
      if ((item.name || "").length > 26) {
        text += `[L]   ${item.name}\n`;
      }

      const isSC = Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;
      if (isSC && !allItemsHaveSC) {
        text += `[L]   [Service Charge ${company.serviceChargePercentage}%]\n`;
      }

      // Modifiers with positive pricing
      if (item.modifiers && Array.isArray(item.modifiers)) {
        item.modifiers.forEach((m: any) => {
          const mName = (m.ModifierName || m.name || "").trim();
          const mAmt = parseFloat(String(m.Amount ?? m.Price ?? m.amount ?? m.price ?? 0)) || 0;
          if (mAmt > 0) {
            const leftStr = `   + ${mName}`;
            const rightStr = `${symbol}${(mAmt * qtyNum).toFixed(2)}`;
            text += this.formatTwoCols48(leftStr, rightStr);
          }
        });
      }

      // Item Discount
      const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
      if (discAmt > 0) {
        const discType = item.discountType || "percentage";
        const discStr =
          discType === "percentage"
            ? `-${discAmt}%`
            : `-${symbol}${discAmt.toFixed(2)}`;
        text += `[L]      Discount: ${discStr}\n`;
      }
    });

    text += "[L]------------------------------------------------\n";

    // Totals
    // Calculate item-level discounts and gross total
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

    const finalDiscountInfo =
      discountInfo ||
      (saleData.discount
        ? {
            applied: true,
            type: saleData.discount.type || "percentage",
            value: saleData.discount.value || 0,
            amount: saleData.discount.amount || 0,
          }
        : saleData.discountAmount && saleData.discountAmount > 0
          ? {
              applied: true,
              type: saleData.discountType || "percentage",
              value: saleData.discountValue || 0,
              amount: saleData.discountAmount,
            }
          : null);

    const orderDiscount = finalDiscountInfo?.amount || 0;
    const hasAnyDiscount = totalItemDiscount > 0 || orderDiscount > 0;
    let currentSubtotal = grossTotal;

    text += this.formatTwoCols48("Sub Total:", `${symbol}${grossTotal.toFixed(2)}`);

    if (totalItemDiscount > 0) {
      text += this.formatTwoCols48("Item Discounts:", `-${symbol}${totalItemDiscount.toFixed(2)}`);
      currentSubtotal -= totalItemDiscount;
    }

    if (orderDiscount > 0) {
      const discLabel =
        finalDiscountInfo?.type === "percentage"
          ? `Discount (${finalDiscountInfo.value}%):`
          : "Discount:";
      text += this.formatTwoCols48(discLabel, `-${symbol}${orderDiscount.toFixed(2)}`);
      currentSubtotal -= orderDiscount;
    }

    if (hasAnyDiscount) {
      text += "[L]------------------------------------------------\n";
      const netLabel = "Net Amount:";
      text += this.formatTwoCols48(netLabel, `${symbol}${currentSubtotal.toFixed(2)}`);
    }

    let finalTotal = saleData.total || saleData.totalAmount || currentSubtotal;
    const hasGST = (company.gstPercentage || 0) > 0;
    const gstRate = company.gstPercentage || 0;
    const scPercentage = company.serviceChargePercentage || 0;
    // For reprints, use stored SC amount; otherwise calculate fresh
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
    const gstAmountRaw = hasGST ? taxableAmount * (gstRate / 100) : 0;
    const gstAmount = Math.round(gstAmountRaw * 100) / 100;
    
    if (finalTotal === 0) {
      finalTotal = taxableAmount + gstAmount;
    }
    
    const printedRoundOff = saleData.roundOff && saleData.roundOff !== 0
      ? parseFloat((finalTotal - (taxableAmount + gstAmount)).toFixed(2))
      : 0;

    if (!hasAnyDiscount) {
      text += this.formatTwoCols48("Sub Total:", `${symbol}${currentSubtotal.toFixed(2)}`);
    }

    if (hasSC) {
      text += this.formatTwoCols48(allItemsHaveSC ? "Service Charge:" : "Item Service Charge:", `${symbol}${serviceChargeAmount.toFixed(2)}`);
    }

    if (hasGST && gstAmount > 0) {
      text += this.formatTwoCols48(`GST (${gstRate}%):`, `${symbol}${gstAmount.toFixed(2)}`);
      text += "[L]------------------------------------------------\n";
    }

    if (printedRoundOff && printedRoundOff !== 0) {
      const roSign = printedRoundOff > 0 ? "+" : "";
      text += this.formatTwoCols48("Round Off:", `${roSign}${symbol}${printedRoundOff.toFixed(2)}`);
      text += "[L]------------------------------------------------\n";
    }

    // Payment Details
    if (saleData.payments && Array.isArray(saleData.payments) && saleData.payments.length > 0) {
      text += "[L]Payment Details:\n";
      saleData.payments.forEach((p: any) => {
        const modeLabel = `  ${String(p.payMode || p.payModeName || p.Remarks || "Payment")}`;
        const amountVal = `${symbol}${parseFloat(p.amount).toFixed(2)}`;
        text += this.formatTwoCols48(modeLabel, amountVal);
      });
      text += "[L]------------------------------------------------\n";
    } else {
      const methodLabel = `  ${String(saleData.paymentMethod || "Payment")}`;
      const amountVal = `${symbol}${parseFloat(finalTotal).toFixed(2)}`;
      text += this.formatTwoCols48(methodLabel, amountVal);
      text += "[L]------------------------------------------------\n";
    }

    text += `[R]<font size=\'big\'><B>TOTAL: ${symbol}${finalTotal.toFixed(2)}</B></font>\n`;
    text += "[C]================================================\n";
    text += "[C]<B>THANK YOU! COME AGAIN!</B>\n";
    text += "[C]SMART-POS BY UNIPROSG\n\n\n\n";

    return text;
  }

  // ==================== PDF FALLBACK WITH DISCOUNT ====================
  static async offerPDFFallback(
    saleData: any,
    userId?: string | number,
    t?: any,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    if (Platform.OS === "web") {
      // ✅ WEB: Fail-proof Iframe printing
      try {
        const company = await BillPDFGenerator.loadSettings(userId);
        const html = await BillPDFGenerator.generateHTML(
          saleData,
          userId,
          discountInfo,
          company,
        );
        const invoiceName = `Invoice_${saleData.invoiceNumber || saleData.id}`;

        // ✅ CRITICAL: Temporarily change main document title for the browser's Save dialog
        const originalTitle = document.title;
        document.title = invoiceName;

        let frame = document.getElementById(
          "print-iframe",
        ) as HTMLIFrameElement;
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "print-iframe";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }

        const doc = frame.contentWindow?.document || frame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          // Wait for images to load in the iframe
          frame.contentWindow?.addEventListener("load", () => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            // Restore title after print dialog closes
            setTimeout(() => {
              document.title = originalTitle;
            }, 1000);
          });

          // Fallback if load event doesn't fire
          setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            setTimeout(() => {
              document.title = originalTitle;
            }, 1000);
          }, 1000);
        }
        return true;
      } catch (err) {
        console.error("Web print error:", err);
        return false;
      }
    }

    // Native Silent PDF Fallback without Alert prompt
    try {
      console.log("Generating PDF fallback silently...");
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = await BillPDFGenerator.generateHTML(
        saleData,
        userId,
        discountInfo,
        company,
      );

      if (Platform.OS === "ios") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({
          html,
          width: 226,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      }
      return true;
    } catch (error) {
      console.error("PDF Fallback Error:", error);
      return false;
    }
  }

  // ==================== UTILITIES ====================
  private static async checkAndroidPrintService(): Promise<boolean> {
    return Platform.OS === "android";
  }

  static async testAllPrinters(): Promise<void> {
    const printers = await this.detectAllPrinters();
    let message = `📋 Found ${printers.length} printer(s):\n\n`;
    printers.forEach((p, i) => {
      message += `${i + 1}. ${p.name}\n   Type: ${p.type}\n   Paper: ${p.paperSize || "Unknown"}\n   Default: ${p.isDefault ? "✅" : "❌"}\n\n`;
    });
    Alert.alert("Printer Detection", message);
  }
}

export default UniversalPrinter;
