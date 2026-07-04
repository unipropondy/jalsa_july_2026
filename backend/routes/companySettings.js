const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { getCompanySettings, invalidateCache } = require("../utils/settingsCache");


// 🔹 GET Settings
router.get("/:id", async (req, res) => {
  try {
    const settings = await getCompanySettings();
    if (settings) {
      res.json({ success: true, settings });
    } else {
      res.status(404).json({ success: false, message: "Settings not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST Settings (Upsert)
router.post("/:id", async (req, res) => {
  try {
    const s = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("CompanyName", sql.NVarChar, s.CompanyName || "My Restaurant")
      .input("Address", sql.NVarChar, s.Address || "")
      .input("GSTNo", sql.NVarChar, s.GSTNo || "")
      .input("GSTPercentage", sql.Decimal(18, 2), s.GSTPercentage !== undefined && s.GSTPercentage !== null ? s.GSTPercentage : 0)
      .input("Phone", sql.NVarChar, s.Phone || "")
      .input("Email", sql.NVarChar, s.Email || "")
      .input("CashierName", sql.NVarChar, s.CashierName || "")
      .input("Currency", sql.NVarChar, s.Currency || "SGD")
      .input("CurrencySymbol", sql.NVarChar, s.CurrencySymbol || "$")
      .input("CompanyLogoUrl", sql.NVarChar(sql.MAX), s.CompanyLogoUrl || "")
      .input("HalalLogoUrl", sql.NVarChar(sql.MAX), s.HalalLogoUrl || "")
      .input("PrinterIP", sql.NVarChar, s.PrinterIP || "")
      .input("ShowCompanyLogo", sql.Bit, s.ShowCompanyLogo ? 1 : 0)
      .input("ShowHalalLogo", sql.Bit, s.ShowHalalLogo ? 1 : 0)
      .input("TaxMode", sql.NVarChar, s.TaxMode || 'exclusive')
      .input("WaiterRequired", sql.Bit, s.WaiterRequired !== undefined && s.WaiterRequired !== null ? s.WaiterRequired : 0)
      .input("HoldOvertimeMinutes", sql.Int, s.HoldOvertimeMinutes !== undefined && s.HoldOvertimeMinutes !== null ? s.HoldOvertimeMinutes : 30)
      .input("ServiceChargePercentage", sql.Decimal(18, 2), s.ServiceChargePercentage !== undefined && s.ServiceChargePercentage !== null ? s.ServiceChargePercentage : 0)
      .query(`
        IF EXISTS (SELECT 1 FROM CompanySettings WHERE Id = '1')
        BEGIN
          UPDATE CompanySettings SET
            CompanyName = @CompanyName,
            Address = @Address,
            GSTNo = @GSTNo,
            GSTPercentage = @GSTPercentage,
            Phone = @Phone,
            Email = @Email,
            CashierName = @CashierName,
            Currency = @Currency,
            CurrencySymbol = @CurrencySymbol,
            CompanyLogoUrl = @CompanyLogoUrl,
            HalalLogoUrl = @HalalLogoUrl,
            PrinterIP = @PrinterIP,
            ShowCompanyLogo = @ShowCompanyLogo,
            ShowHalalLogo = @ShowHalalLogo,
            TaxMode = @TaxMode,
            WaiterRequired = @WaiterRequired,
            HoldOvertimeMinutes = @HoldOvertimeMinutes,
            ServiceChargePercentage = @ServiceChargePercentage,
            UpdatedOn = GETDATE()
          WHERE Id = '1'
        END
        ELSE
        BEGIN
          INSERT INTO CompanySettings (Id, CompanyName, Address, GSTNo, GSTPercentage, Phone, Email, CashierName, Currency, CurrencySymbol, CompanyLogoUrl, HalalLogoUrl, PrinterIP, ShowCompanyLogo, ShowHalalLogo, TaxMode, WaiterRequired, HoldOvertimeMinutes, ServiceChargePercentage, UpdatedOn)
          VALUES ('1', @CompanyName, @Address, @GSTNo, @GSTPercentage, @Phone, @Email, @CashierName, @Currency, @CurrencySymbol, @CompanyLogoUrl, @HalalLogoUrl, @PrinterIP, @ShowCompanyLogo, @ShowHalalLogo, @TaxMode, @WaiterRequired, @HoldOvertimeMinutes, @ServiceChargePercentage, GETDATE())
        END
      `);

    // Synchronize to PrintMaster (Receipt Printer where PrinterType = 1)
    if (s.PrinterIP) {
      await pool.request()
        .input("ip", sql.NVarChar, s.PrinterIP)
        .query("UPDATE PrintMaster SET PrinterPath = @ip, PrinterIP = @ip WHERE PrinterType = 1");
    }

    invalidateCache();
    res.json({ success: true, message: "Settings saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE Settings
router.delete("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .query("DELETE FROM CompanySettings WHERE Id = '1'");
    invalidateCache();
    res.json({ success: true, message: "Settings deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
