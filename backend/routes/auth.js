const express = require("express");
const router = express.Router();
const { poolPromise, sql } = require("../config/db");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "supersecureposjwttokensecretkey";

/* ================= AUTH - LOGIN ================= */
router.post("/login", async (req, res) => {
  const startTime = Date.now();
  console.log(`⏱️ [LOGIN] [${startTime}] Backend request received`);
  res.on('finish', () => {
    console.log(`⏱️ [LOGIN] [${Date.now()}] Response sent`);
  });
  try {
    const pool = await poolPromise;
    const poolTime = Date.now();
    console.log(`⏱️ [LOGIN] [${poolTime}] Pool acquired (took ${poolTime - startTime}ms)`);
    if (!pool) {
      return res.status(503).json({ success: false, message: "Database connection busy or unavailable." });
    }
    const { userName: rawUserName, password: rawPassword } = req.body;
    const userName = (rawUserName || "").trim();
    const password = (rawPassword || "").trim();

    if (!userName || !password) {
      return res.status(400).json({ success: false, message: "User ID and Password are required." });
    }

    // ✅ SPECIAL KDS LOGIN (HARDCODED)
    if (userName.toUpperCase() === "KDS" && password === "as786") {

      console.log(`[AUTH] KDS Special Login Successful`);
      const kdsToken = jwt.sign(
        { userId: "999", role: "KDS" },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      return res.json({
        success: true,
        token: kdsToken,
        user: {
          userId: "999",
          id: "999",
          userCode: "KDS",
          userName: "KDS",
          fullName: "Kitchen Display System",
          role: "KDS",
          roleName: "Kitchen Staff",
          userGroupId: 999
        }
      });
    }

    console.log(`[AUTH] Attempting login for UserName: "${userName}"`);

    const queryStartTime = Date.now();
    console.log(`⏱️ [LOGIN] [${queryStartTime}] First SQL query started`);
    const result = await pool.request()
      .input("UserName", userName)
      .query(`
        SELECT 
          u.UserId, u.UserCode, u.UserName, u.UserPassword, u.FullName,
          u.FirstName, u.LastName, u.IsDisabled, u.UserGroupid,
          g.UserGroupCode AS RoleCode, g.UserGroupName AS RoleName,
          g.isActive AS IsGroupActive
        FROM [dbo].[UserMaster] u
        LEFT JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
        WHERE u.UserName = @UserName
      `);
    const queryEndTime = Date.now();
    console.log(`⏱️ [LOGIN] [${queryEndTime}] First SQL query completed (took ${queryEndTime - queryStartTime}ms)`);


    if (result.recordset.length === 0) {
      console.log(`[AUTH] Login failed: UserName "${userName}" not found.`);
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    const user = result.recordset[0];

    // ✅ VALIDATE USER STATUS
    if (user.IsDisabled === true || user.IsDisabled === 1) {
      console.log(`[AUTH] Login failed: Account disabled for user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "Your account is disabled." });
    }

    // ✅ VALIDATE USER GROUP (STRICT CHECK)
    if (!user.UserGroupid || !user.RoleCode) {
      console.log(`[AUTH] Login failed: No valid group assigned to user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "User has no valid group assigned." });
    }

    if (user.IsGroupActive === false || user.IsGroupActive === 0) {
      console.log(`[AUTH] Login failed: User group is inactive for user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "Your user group is currently inactive." });
    }

    const dbPassword = (user.UserPassword || "").trim();
    let isValid = false;

    // Password Matching Strategy (Standard + Base64 + Hybrid)
    const parts = dbPassword.split("-");
    const candidates = [dbPassword, parts[0]].filter(c => c.length > 0);

    for (const cand of candidates) {
      if (cand === password) { isValid = true; break; }
      try {
        const decoded = Buffer.from(cand, "base64").toString("utf-8").trim();
        if (decoded === password) { isValid = true; break; }
      } catch (e) {}
    }

    if (!isValid) {
      console.log(`[AUTH] Login failed: Password mismatch for user "${user.UserName}".`);
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    // Update Last Login
    await pool.request()
      .input("UserId", user.UserId)
      .query("UPDATE [dbo].[UserMaster] SET LastLogInDate = GETDATE() WHERE UserId = @UserId");

    const finalUserId = String(user.UserId).trim();
    const roleCode = (user.RoleCode || "CASHIER").toUpperCase().trim();

    // 1. Generate Security Token (JWT)
    const token = jwt.sign(
      { userId: finalUserId, role: roleCode },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    console.log(`✅ Login Success: ${user.FullName} | Role: ${roleCode}`);

    return res.json({
      success: true,
      token,
      user: {
        userId: finalUserId,
        id: finalUserId,
        userCode: user.UserCode,
        userName: user.UserName,
        fullName: user.FullName || user.FirstName,
        role: roleCode, // ADMIN, CASHIER, WAITER, etc.
        roleName: user.RoleName,
        userGroupId: user.UserGroupid
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* ================= AUTH - VERIFY PASSWORD (ROLE-BASED) ================= */
router.post("/verify", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "Missing password" });
    }

    const pool = await poolPromise;
    const base64Password = Buffer.from(password).toString("base64");

    // Perform database-level search to avoid pulling all credentials into Express memory
    const result = await pool.request()
      .input("password", sql.VarChar, password)
      .input("base64Password", sql.VarChar, base64Password)
      .query(`
        SELECT TOP 1 u.UserId 
        FROM [dbo].[UserMaster] u
        INNER JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
        WHERE (u.IsDisabled IS NULL OR u.IsDisabled = 0)
          AND g.isActive = 1
          AND (
            u.UserPassword = @password
            OR u.UserPassword = @base64Password
            OR u.UserPassword LIKE @password + '-%'
            OR u.UserPassword LIKE @base64Password + '-%'
          )
      `);

    const isValid = result.recordset.length > 0;
    return res.json({ success: isValid });
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// 🚀 PERMISSIONS CACHE (5-minute TTL)
const permissionCache = new Map();
const PERM_CACHE_TTL = 5 * 60 * 1000;

/* ================= AUTH - PERMISSIONS ================= */
router.get("/permissions/:userGroupCode", async (req, res) => {
  try {
    const { userGroupCode } = req.params;
    const cacheKey = (userGroupCode || "").trim().toUpperCase();

    if (!cacheKey) {
      return res.status(400).json({ error: "Invalid user group code" });
    }

    // Check memory cache
    const cached = permissionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < PERM_CACHE_TTL)) {
      console.log(`⚡ [Permissions Cache] Hit for group: ${cacheKey}`);
      return res.json(cached.data);
    }

    console.log(`🔎 [Permissions Cache] Miss for group: ${cacheKey}. Fetching from DB...`);
    const pool = await poolPromise;
    const result = await pool.request()
      .input("UserGroupCode", cacheKey)
      .query(`
        SELECT 
          LTRIM(RTRIM(FormCode)) AS FormCode,
          LTRIM(RTRIM(AllowAdd))    AS AllowAdd,
          LTRIM(RTRIM(AllowUpdate)) AS AllowUpdate,
          LTRIM(RTRIM(AllowDelete)) AS AllowDelete,
          LTRIM(RTRIM(AllowRead))   AS AllowRead
        FROM [dbo].[UserPermission]
        WHERE UserGroupCode = @UserGroupCode
      `);

    const permMap = {};
    for (const row of result.recordset) {
      if (row.FormCode) {
        permMap[row.FormCode] = {
          canAdd:    row.AllowAdd    === "A",
          canUpdate: row.AllowUpdate === "U",
          canDelete: row.AllowDelete === "D",
          canRead:   row.AllowRead   === "R",
        };
      }
    }

    // Save to cache
    permissionCache.set(cacheKey, {
      data: permMap,
      timestamp: Date.now()
    });

    res.json(permMap);
  } catch (err) {
    console.error("PERMISSIONS FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
