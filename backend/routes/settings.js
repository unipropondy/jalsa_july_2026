const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { getAppSettings, invalidateCache } = require("../utils/settingsCache");
const { syncKitchensToPrintMaster } = require("../config/init");

// 🔹 GET Settings
router.get("/", async (req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 UPDATE Settings
router.post("/update", async (req, res) => {
  try {
    const { upiId, shopName, qrCodeUrl, enableKOT, enableKDS, enableCheckoutBill, enableCheckoutFlow, enableDirectProcessToPay, customerSideDisplay } = req.body;
    const pool = await poolPromise;

    // Use an UPSERT logic (Update if exists, Insert if not)
    await pool.request()
      .input("UPI", sql.NVarChar, upiId || null)
      .input("Shop", sql.NVarChar, shopName || "My Restaurant")
      .input("QR", sql.NVarChar, qrCodeUrl || null)
      .input("EnableKOT", sql.Bit, enableKOT !== undefined ? enableKOT : 1)
      .input("EnableKDS", sql.Bit, enableKDS !== undefined ? enableKDS : 1)
      .input("EnableCheckoutBill", sql.Bit, enableCheckoutBill !== undefined ? enableCheckoutBill : 1)
      .input("EnableCheckoutFlow", sql.Bit, enableCheckoutFlow !== undefined ? enableCheckoutFlow : 1)
      .input("EnableDirectProcessToPay", sql.Bit, enableDirectProcessToPay !== undefined ? enableDirectProcessToPay : 0)
      .input("CustomerSideDisplay", sql.Bit, customerSideDisplay !== undefined ? customerSideDisplay : 1)
      .query(`
        IF EXISTS (SELECT 1 FROM AppSettings)
        BEGIN
          UPDATE AppSettings
          SET 
            UPI_ID = @UPI,
            ShopName = @Shop,
            PayNow_QR_Url = @QR,
            EnableKOT = @EnableKOT,
            EnableKDS = @EnableKDS,
            EnableCheckoutBill = @EnableCheckoutBill,
            EnableCheckoutFlow = @EnableCheckoutFlow,
            EnableDirectProcessToPay = @EnableDirectProcessToPay,
            CustomerSideDisplay = @CustomerSideDisplay,
            UpdatedOn = GETDATE()
        END
        ELSE
        BEGIN
          INSERT INTO AppSettings (UPI_ID, ShopName, PayNow_QR_Url, EnableKOT, EnableKDS, EnableCheckoutBill, EnableCheckoutFlow, EnableDirectProcessToPay, CustomerSideDisplay, UpdatedOn)
          VALUES (@UPI, @Shop, @QR, @EnableKOT, @EnableKDS, @EnableCheckoutBill, @EnableCheckoutFlow, @EnableDirectProcessToPay, @CustomerSideDisplay, GETDATE())
        END
      `);

    invalidateCache();
    res.json({ success: true, message: "Settings updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 GET Kitchen Printers
router.get("/kitchen-printers", async (req, res) => {
  try {
    const pool = await poolPromise;

    // 1. Self-healing check for Cashier Printer (PrinterType = 1)
    const cashierCheck = await pool.request()
      .query("SELECT COUNT(*) as count FROM PrintMaster WHERE PrinterType = 1 AND IsActive = 1");
    if (cashierCheck.recordset[0].count === 0) {
      console.log("🛠️ Inserting default Cashier Printer row into PrintMaster...");
      const compSettings = await pool.request().query("SELECT TOP 1 PrinterIP FROM CompanySettings");
      const defaultIP = compSettings.recordset[0]?.PrinterIP || "192.168.0.20";
      await pool.request()
        .input("ip", sql.NVarChar, defaultIP)
        .query(`
          INSERT INTO PrintMaster (PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, PrintSection, KitchenTypeName, KitchenTypeValue, IsActive, PrintCopy)
          VALUES (NEWID(), 'Receipt Printer', @ip, @ip, 1, 1, 'Receipt Print', 0, 1, 1)
        `);
    }

    // 2. Self-healing check for TakeAway Printer (PrinterType = 3)
    const takeawayCheck = await pool.request()
      .query("SELECT COUNT(*) as count FROM PrintMaster WHERE PrinterType = 3 AND IsActive = 1");
    if (takeawayCheck.recordset[0].count === 0) {
      console.log("🛠️ Inserting default TakeAway Printer row into PrintMaster...");
      await pool.request().query(`
        INSERT INTO PrintMaster (PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, PrintSection, KitchenTypeName, KitchenTypeValue, IsActive, PrintCopy)
        VALUES (NEWID(), 'TakeAway', '192.168.0.20', '192.168.0.20', 3, 1, 'TakeAway', 6, 1, 1)
      `);
    }

    // 3. Fetch active categories (matching menu.js kitchens endpoint structure)
    const activeCatsResult = await pool.request().query(`
      SELECT cm.CategoryId, cm.CategoryName AS KitchenTypeName, ckt.KitchenTypeCode
      FROM CategoryMaster cm
      LEFT JOIN CategoryKitchenType ckt ON cm.CategoryId = ckt.CategoryId
      WHERE cm.IsActive = 1
    `);
    const rawActiveCats = activeCatsResult.recordset;

    // Filter out TEST categories/kitchens (same as menuStore)
    const activeCats = rawActiveCats.filter(
      k => k.KitchenTypeName && !k.KitchenTypeName.toUpperCase().includes("TEST")
    );

    // 4. Fetch all active printers from PrintMaster
    const printersResult = await pool.request().query(`
      SELECT PrinterId, KitchenTypeValue, KitchenTypeName, PrinterPath, PrinterType 
      FROM PrintMaster 
      WHERE IsActive = 1
    `);
    const allPrinters = printersResult.recordset;

    const responsePrinters = [];

    // Add Cashier printer (PrinterType = 1)
    const cashierPrinter = allPrinters.find(p => p.PrinterType === 1);
    if (cashierPrinter) responsePrinters.push(cashierPrinter);

    // Add TakeAway printer (PrinterType = 3)
    const takeawayPrinter = allPrinters.find(p => p.PrinterType === 3);
    if (takeawayPrinter) responsePrinters.push(takeawayPrinter);

    // Map active categories to kitchen printers (PrinterType = 2)
    const seenCodes = new Set();
    for (const cat of activeCats) {
      // Default to code 2 (Indian) if no KitchenTypeCode is mapped in ckt (same as dishes query default)
      const code = parseInt(cat.KitchenTypeCode || '2');

      // Deduplicate on KitchenTypeValue so each printer code only has one configuration input
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);

      const match = allPrinters.find(p => p.PrinterType === 2 && p.KitchenTypeValue === code);
      if (match) {
        responsePrinters.push({
          PrinterId: match.PrinterId,
          KitchenTypeValue: code,
          KitchenTypeName: cat.KitchenTypeName,
          PrinterPath: match.PrinterPath,
          PrinterType: 2
        });
      } else {
        // Virtual record for missing printer
        responsePrinters.push({
          PrinterId: null, // Indicates it needs to be inserted on save
          KitchenTypeValue: code,
          KitchenTypeName: cat.KitchenTypeName,
          PrinterPath: "",
          PrinterType: 2
        });
      }
    }

    res.json(responsePrinters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 UPDATE Kitchen Printers
router.post("/kitchen-printers/update", async (req, res) => {
  try {
    const { printers } = req.body; // Array of { id, ip, type, name, printerId }
    const pool = await poolPromise;

    for (const printer of printers) {
      const targetId = printer.printerId || printer.id;
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetId));

      const printerIp = printer.ip || "";

      if (isGuid) {
        // Existing printer: update path and name
        await pool.request()
          .input("printerId", sql.UniqueIdentifier, targetId)
          .input("ip", sql.NVarChar, printerIp)
          .input("name", sql.NVarChar, printer.name || "Kitchen Printer")
          .query(`
            UPDATE PrintMaster 
            SET PrinterPath = @ip, PrinterIP = @ip, KitchenTypeName = @name, PrinterName = @name 
            WHERE PrinterId = @printerId
          `);
      } else if (printer.type === 2) {
        // New/Virtual kitchen printer: insert it!
        await pool.request()
          .input("name", sql.NVarChar, printer.name || "Kitchen Printer")
          .input("ip", sql.NVarChar, printerIp || "192.168.0.20")
          .input("code", sql.Int, parseInt(printer.id))
          .query(`
            INSERT INTO PrintMaster (
              PrinterId, PrinterName, PrinterPath, PrinterIP, 
              PrinterType, PrintSection, KitchenTypeName, 
              KitchenTypeValue, IsActive, PrintCopy
            )
            VALUES (
              NEWID(), @name, @ip, @ip, 
              2, 1, @name, 
              @code, 1, 1
            )
          `);
      } else {
        // Cashier or Takeaway fallback by type
        await pool.request()
          .input("ip", sql.NVarChar, printerIp)
          .input("type", sql.Int, printer.type)
          .query("UPDATE PrintMaster SET PrinterPath = @ip, PrinterIP = @ip WHERE PrinterType = @type");
      }

      // Sync to CompanySettings table if it's the Cashier printer
      if (printer.type === 1 || parseInt(printer.id) === 0) {
        await pool.request()
          .input("ip", sql.NVarChar, printerIp)
          .query("UPDATE CompanySettings SET PrinterIP = @ip");
      }
    }

    res.json({ success: true, message: "Printers updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 ADD Kitchen Printer
router.post("/kitchen-printers/add", async (req, res) => {
  try {
    const { name, ip } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("name", sql.NVarChar, name)
      .input("ip", sql.NVarChar, ip)
      .query(`
        DECLARE @nextVal INT = (SELECT ISNULL(MAX(KitchenTypeValue), 0) + 1 FROM PrintMaster);
        INSERT INTO PrintMaster (
          PrinterId, PrinterName, PrinterPath, PrinterIP, 
          PrinterType, PrintSection, KitchenTypeName, 
          KitchenTypeValue, IsActive, PrintCopy
        )
        VALUES (
          NEWID(), @name, @ip, @ip, 
          2, 1, @name, 
          @nextVal, 1, 1
        )
      `);

    res.json({ success: true, message: "Kitchen printer added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE Kitchen Printer (Soft Delete)
router.post("/kitchen-printers/delete", async (req, res) => {
  try {
    const { id } = req.body; // KitchenTypeValue
    const pool = await poolPromise;

    await pool.request()
      .input("id", sql.Int, id)
      .query("UPDATE PrintMaster SET IsActive = 0 WHERE KitchenTypeValue = @id");

    res.json({ success: true, message: "Kitchen printer deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 ON-DEMAND Kitchen Sync (trigger immediately after adding kitchen from backoffice)
router.post("/sync-kitchens", async (req, res) => {
  try {
    const pool = await poolPromise;
    await syncKitchensToPrintMaster(pool);
    res.json({ success: true, message: "Kitchen sync completed. New kitchens auto-added to PrintMaster." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 SAVE Global Date to dateentry
router.post("/save-date", async (req, res) => {
  try {
    const { startDate, username } = req.body;
    const pool = await poolPromise;

    // Ensure table columns can hold UUIDs (36 chars) instead of small varchars
    try {
      await pool.request().query(`
        ALTER TABLE dateentry ALTER COLUMN username VARCHAR(100);
        ALTER TABLE dateentry ALTER COLUMN Createdby VARCHAR(100);
        ALTER TABLE dateentry ALTER COLUMN updateby VARCHAR(100);
      `);
    } catch (e) {
      // Ignore if it fails
    }

    await pool.request()
      .input("username", sql.VarChar(100), username || "admin")
      .input("startDate", sql.VarChar, startDate)
      .query(`
        IF EXISTS (SELECT 1 FROM dateentry)
        BEGIN
          UPDATE dateentry
          SET 
            StartDate = @startDate,
            username = @username,
            updateby = @username,
            updatedate = GETDATE()
        END
        ELSE
        BEGIN
          INSERT INTO dateentry (DateEntryId, username, StartDate, Createdby, CreatedDate)
          VALUES (NEWID(), @username, @startDate, @username, GETDATE())
        END
      `);

    res.json({ success: true, message: "Date saved successfully" });
  } catch (err) {
    console.error("Save date error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 GET Global Date from dateentry
router.get("/get-date", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TOP 1 StartDate FROM dateentry ORDER BY CreatedDate DESC");
    if (result.recordset.length > 0) {
      res.json({ date: result.recordset[0].StartDate });
    } else {
      res.json({ date: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE Global Date from dateentry (Dayend Operation)
router.post("/delete-date", async (req, res) => {
  try {
    const pool = await poolPromise;

    // As requested: just unconditionally update the DateEntry to the next day
    const queryStr = "UPDATE DateEntry SET StartDate = CAST(GETDATE() + 1 AS DATE)";

    await pool.request().query(queryStr);

    res.json({ success: true, message: "Date entry updated successfully" });
  } catch (err) {
    console.error("Dayend Close error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
