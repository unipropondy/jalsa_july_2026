const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

// 🚀 PERFORMANCE CACHE
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

function getCached(key) {
  const item = cache.get(key);
  if (item && (Date.now() - item.time < CACHE_TTL)) {
    console.log(`⚡ [MenuCache] Cache HIT: ${key}`);
    return item.data;
  }
  console.log(`⚡ [MenuCache] Cache MISS: ${key}`);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
  console.log(`⚡ [MenuCache] Cache STORED: ${key}`);
}

/* ================= KITCHENS / CATEGORIES ================= */
router.get("/kitchens", async (req, res) => {
  try {
    const cached = getCached("kitchens");
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT cm.CategoryId, cm.CategoryName AS KitchenTypeName, ckt.KitchenTypeCode
      FROM CategoryMaster cm
      LEFT JOIN CategoryKitchenType ckt ON cm.CategoryId = ckt.CategoryId
      WHERE cm.IsActive = 1
    `);
    setCache("kitchens", result.recordset);
    res.json(result.recordset);
  } catch (err) {
    console.error("KITCHEN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dishgroups/:CategoryId", async (req, res) => {
  try {
    const categoryId = req.params.CategoryId;
    const cacheKey = `dishgroups_${categoryId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("CategoryId", categoryId).query(`
        SELECT DISTINCT
              a.DishGroupId,
              a.DishGroupName
          FROM DishGroupMaster a
          LEFT JOIN DishGroupKitchentype dkt
              ON a.DishGroupId = dkt.DishGroupId
          LEFT JOIN CategoryMaster cm
              ON cm.CategoryId = @CategoryId
          WHERE a.IsActive = 1
          AND (
                a.CategoryId = @CategoryId
                OR dkt.KitchenTypeName = cm.CategoryName
          )
      `);
    setCache(cacheKey, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= DISHES ================= */
router.get("/dishes/all", async (req, res) => {
  try {
    const cacheKey = "dishes_all";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        d.DishId, d.Name, d.DishGroupId, d.currentcost AS Price,
        d.DishCode, d.Description,
        d.Imageid AS Image, CASE WHEN d.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage,
        ISNULL(d.IsOpenItem, 0) AS IsOpenItem,
        ISNULL(d.isServiceCharge, 0) AS isServiceCharge,
        ISNULL(ckt.KitchenTypeCode, '2') as KitchenTypeCode,
        ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
        pm.PrinterPath AS PrinterIP
      FROM DishMaster d
      LEFT JOIN DishGroupMaster dgm ON d.DishGroupId = dgm.DishGroupId
      LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
      LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn 
        FROM PrintMaster WHERE IsActive = 1 AND PrinterType = 2
      ) pm ON CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue AND pm.rn = 1
      WHERE d.IsActive = 1 ORDER BY d.Name ASC
    `);
    setCache(cacheKey, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/dishes/group/:DishGroupId", async (req, res) => {
  try {
    const dishGroupId = req.params.DishGroupId;
    const cacheKey = `dishes_group_${dishGroupId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("DishGroupId", dishGroupId).query(`
      SELECT DISTINCT
              d.DishId,
              d.Name,
              d.DishGroupId,
              d.currentcost AS Price,
              d.DishCode,
              d.Description,
              d.Imageid AS Image,
              CASE WHEN d.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage,
              ISNULL(d.isServiceCharge, 0) AS isServiceCharge,
              ISNULL(d.IsOpenItem, 0) AS IsOpenItem,
              ISNULL(ckt.KitchenTypeCode, '2') AS KitchenTypeCode,
              ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') AS KitchenTypeName,
              pm.PrinterPath AS PrinterIP
          FROM DishMaster d
 
          LEFT JOIN DishGroupMaster dgm
              ON d.DishGroupId = dgm.DishGroupId
 
          LEFT JOIN CategoryMaster cat
              ON dgm.CategoryId = cat.CategoryId
 
          LEFT JOIN CategoryKitchenType ckt
              ON dgm.CategoryId = ckt.CategoryId
 
          LEFT JOIN DishGroupMapping dmap
              ON d.DishId = dmap.DishId
 
          LEFT JOIN (
              SELECT *,
                    ROW_NUMBER() OVER(
                        PARTITION BY KitchenTypeValue
                        ORDER BY PrinterId
                    ) AS rn
              FROM PrintMaster
              WHERE IsActive = 1
                AND PrinterType = 2
          ) pm
          ON CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue
          AND pm.rn = 1
 
          WHERE d.IsActive = 1
          AND (
                d.DishGroupId = @DishGroupId
                OR dmap.DishGroupId = @DishGroupId
              )
 
          ORDER BY d.Name ASC
      `);
    setCache(cacheKey, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= IMAGES ================= */
class LRUImageCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.estimatedMemoryBytes = 0;
  }

  has(key) {
    const exists = this.cache.has(key);
    return exists;
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }
    this.hits++;
    const value = this.cache.get(key);
    // Move key to the end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      const oldVal = this.cache.get(key);
      this.estimatedMemoryBytes -= oldVal.length || 0;
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first item in insertion order)
      const oldestKey = this.cache.keys().next().value;
      const oldestValue = this.cache.get(oldestKey);
      this.estimatedMemoryBytes -= oldestValue.length || 0;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, value);
    this.estimatedMemoryBytes += value.length || 0;
  }

  clear() {
    this.cache.clear();
    this.estimatedMemoryBytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(2) + "%" : "0.00%";
    const missRate = totalRequests > 0 ? ((this.misses / totalRequests) * 100).toFixed(2) + "%" : "0.00%";

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      estimatedMemoryMb: (this.estimatedMemoryBytes / 1024 / 1024).toFixed(2) + " MB",
      hits: this.hits,
      misses: this.misses,
      hitRate,
      missRate
    };
  }
}

const imageCache = new LRUImageCache(100);
router.imageCache = imageCache;

router.get("/image/:imageId", async (req, res) => {
  try {
    const imageId = req.params.imageId;

    // Serve from cache if available
    const cachedBuffer = imageCache.get(imageId);
    if (cachedBuffer) {
      console.log(`⚡ [ImageCache] Cache HIT: ${imageId}`);
      res.set("Cache-Control", "public, max-age=86400");
      return res.type("image/jpeg").send(cachedBuffer);
    }

    console.log(`⚡ [ImageCache] Cache MISS: ${imageId}`);
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Imageid", imageId)
      .query(`SELECT ImageData FROM ImageList WHERE Imageid = @Imageid`);

    if (result.recordset.length > 0 && result.recordset[0].ImageData) {
      const buffer = result.recordset[0].ImageData;
      imageCache.set(imageId, buffer);
      res.set("Cache-Control", "public, max-age=86400");
      res.type("image/jpeg").send(buffer);
    } else {
      res.status(404).send("Image not found");
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MODIFIERS ================= */
router.get("/modifiers/:dishId", async (req, res) => {
  try {
    const cacheKey = `modifiers_${req.params.dishId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool.request().input("dishId", req.params.dishId)
      .query(`
        SELECT dm.DishId, dm.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName, 0 AS Price
        FROM DishModifier dm 
        INNER JOIN ModifierMaster m ON dm.ModifierId = m.ModifierId
        WHERE dm.DishId = @dishId ORDER BY m.ModifierName ASC
      `);
    setCache(cacheKey, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/modifiers/group/:DishGroupId", async (req, res) => {
  try {
    const cacheKey = `modifiers_group_${req.params.DishGroupId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const pool = await poolPromise;
    const result = await pool.request().input("DishGroupId", req.params.DishGroupId)
      .query(`
        SELECT dm.DishId, dm.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName, 0 AS Price
        FROM DishModifier dm 
        INNER JOIN ModifierMaster m ON dm.ModifierId = m.ModifierId
        INNER JOIN DishMaster d ON dm.DishId = d.DishId
        WHERE d.DishGroupId = @DishGroupId ORDER BY m.ModifierName ASC
      `);
    setCache(cacheKey, result.recordset);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/checksplitdish/:DishId", async (req, res) => {
  try {

    const pool = await poolPromise;

    const result = await pool.request()
      .input("DishId", req.params.DishId)
      .query(`
        SELECT
          DishId,
          ISNULL(IsSplitDish,0) AS IsSplitDish,
            ISNULL(IsGroupDish,0) AS IsGroupDish
        FROM DishMaster
        WHERE DishId = @DishId
      `);

    res.json(result.recordset[0]);

  } catch (err) {
    console.log(err);
    res.status(500).send(err.message);
  }
});

router.get("/splitdishes", async (req, res) => {
  try {

    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
        DishId,
        Name,
        CurrentCost as Price,
        songName
      FROM DishMaster
      WHERE IsSplitDish = 1
      AND IsActive = 1
      AND ISNULL(IsGroupDish,0) =0
      ORDER BY Name
    `);

    res.json(result.recordset);

  } catch (err) {
    console.log(err);
    res.status(500).send(err.message);
  }
});

router.post("/clear-cache", (req, res) => {
  cache.clear();
  console.log("⚡ [MenuCache] Cache INVALIDATION: All menu cache cleared");
  imageCache.clear();
  console.log("⚡ [ImageCache] Cache INVALIDATION: All image cache cleared");
  res.json({ success: true, message: "Menu and image cache cleared successfully" });
});

module.exports = router;
