const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const https = require('https');

// ========== 上傳設定 ==========
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/uploads/'); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('只接受圖片檔案'));
    }
});

// ========== 輔助函數：HTTP GET Promise 包裝 ==========
function httpGetJson(url, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { reject(new Error('JSON parse error')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// ========== 從 Callsign 推斷航空公司 ==========
function getAirlineFromCallsign(callsign) {
    if (!callsign) return '';
    const prefix = callsign.substring(0, 3).toUpperCase();
    const airlines = {
        'CPA': '國泰航空', 'CX': '國泰航空',
        'HKE': '香港快運', 'UO': '香港快運',
        'CRK': '香港航空', 'HX': '香港航空',
        'HDA': '港龍航空',
        'CAL': '中華航空', 'CI': '中華航空',
        'EVA': '長榮航空', 'BR': '長榮航空',
        'CES': '中國東方航空', 'MU': '中國東方航空',
        'CSN': '中國南方航空', 'CZ': '中國南方航空',
        'CCA': '中國國際航空', 'CA': '中國國際航空',
        'HVN': '越南航空',
        'JAL': '日本航空', 'JL': '日本航空',
        'ANA': '全日空', 'NH': '全日空',
        'KAL': '大韓航空', 'KE': '大韓航空',
        'AAR': '韓亞航空', 'OZ': '韓亞航空',
        'SIA': '新加坡航空', 'SQ': '新加坡航空',
        'MAS': '馬來西亞航空', 'MH': '馬來西亞航空',
        'THA': '泰國航空', 'TG': '泰國航空',
        'UAE': '阿聯酋航空', 'EK': '阿聯酋航空',
        'ETD': '阿提哈德航空', 'EY': '阿提哈德航空',
        'QTR': '卡塔爾航空', 'QR': '卡塔爾航空',
        'BAW': '英國航空', 'BA': '英國航空',
        'AAL': '美國航空', 'AA': '美國航空',
        'UAL': '聯合航空', 'UA': '聯合航空',
        'DAL': '達美航空', 'DL': '達美航空',
        'DLH': '漢莎航空', 'LH': '漢莎航空',
        'AFR': '法國航空', 'AF': '法國航空',
        'KLM': '荷蘭航空', 'KL': '荷蘭航空',
        'QFA': '澳洲航空', 'QF': '澳洲航空'
    };
    return airlines[prefix] || '';
}

// ========== ICAO 機型代碼轉常用名稱 ==========
function icaoToType(icaoType) {
    if (!icaoType) return '';
    const map = {
        'A20N': 'A320neo', 'A21N': 'A321neo', 'A19N': 'A319neo',
        'A320': 'A320', 'A321': 'A321', 'A319': 'A319',
        'A332': 'A330-200', 'A333': 'A330-300', 'A338': 'A330-800', 'A339': 'A330-900',
        'A359': 'A350-900', 'A35K': 'A350-1000',
        'A388': 'A380-800',
        'B38M': '737 MAX 8', 'B39M': '737 MAX 9', 'B3XM': '737 MAX 10',
        'B737': 'B737', 'B738': 'B737-800', 'B739': 'B737-900',
        'B744': 'B747-400', 'B748': 'B747-8',
        'B772': 'B777-200', 'B773': 'B777-300', 'B77W': 'B777-300ER',
        'B778': 'B777-8', 'B779': 'B777-9',
        'B788': 'B787-8', 'B789': 'B787-9', 'B78X': 'B787-10',
        'E190': 'E190', 'E195': 'E195', 'E290': 'E190-E2', 'E295': 'E195-E2',
        'A306': 'A300', 'A310': 'A310',
        'B762': 'B767-200', 'B763': 'B767-300', 'B764': 'B767-400',
        'MD11': 'MD-11', 'DC10': 'DC-10',
        'A124': 'An-124', 'A225': 'An-225',
        'C172': 'Cessna 172', 'C208': 'Cessna 208',
        'GLF5': 'Gulfstream G550', 'GLF6': 'Gulfstream G650',
        'CL60': 'Challenger 600', 'GLEX': 'Global Express'
    };
    return map[icaoType.toUpperCase()] || icaoType;
}

// ============================================
// 飛機註冊號自動搜尋（四重來源）
// ============================================
router.get('/lookup-aircraft/:reg', async (req, res) => {
    const reg = req.params.reg.toUpperCase().trim().replace(/\s+/g, '');
    if (!reg) return res.json({ success: false, message: '請輸入註冊號' });

    // 第一步：專用飛機資料庫
    try {
        const [dbResults] = await db.execute(
            'SELECT airline, aircraft_type, registration FROM aircraft_db WHERE registration = ? LIMIT 1',
            [reg]
        );
        if (dbResults.length > 0) {
            return res.json({
                success: true,
                source: 'database',
                aircraft: {
                    airline: dbResults[0].airline || '',
                    type: dbResults[0].aircraft_type || '',
                    registration: dbResults[0].registration
                }
            });
        }
    } catch (err) { console.error('資料庫搜尋錯誤:', err); }

    // 第二步：舊照片記錄
    try {
        const [localResults] = await db.execute(
            `SELECT DISTINCT airline, aircraft_type, registration 
             FROM photos 
             WHERE registration = ? AND airline IS NOT NULL AND aircraft_type IS NOT NULL
             LIMIT 1`, [reg]
        );
        if (localResults.length > 0) {
            return res.json({
                success: true,
                source: 'history',
                aircraft: {
                    airline: localResults[0].airline || '',
                    type: localResults[0].aircraft_type || '',
                    registration: localResults[0].registration
                }
            });
        }
    } catch (err) { console.error('歷史搜尋錯誤:', err); }

    // 第三步：adsbdb API（免費，唔使 Key）
    try {
        const adsbdbData = await httpGetJson(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(reg)}`);
        if (adsbdbData.response && adsbdbData.response.aircraft) {
            const ac = adsbdbData.response.aircraft;
            return res.json({
                success: true,
                source: 'adsbdb',
                aircraft: {
                    airline: ac.registered_owner || '',
                    type: ac.type || ac.icao_type || '',
                    registration: ac.registration || reg
                }
            });
        }
    } catch (err) { console.error('adsbdb 錯誤:', err.message); }

    // 第四步：adsb.lol API（免費，唔使 Key，live 飛機）
    const adsbLolUrls = [
        `https://api.adsb.lol/v2/aircraft?r=${encodeURIComponent(reg)}`,
        `https://api.adsb.lol/v2/aircraft?reg=${encodeURIComponent(reg)}`,
        `https://api.adsb.lol/v2/aircraft?registration=${encodeURIComponent(reg)}`
    ];
    
    for (const url of adsbLolUrls) {
        try {
            const data = await httpGetJson(url, 5000);
            if (data.ac && data.ac.length > 0) {
                const ac = data.ac[0];
                const airline = getAirlineFromCallsign(ac.flight);
                const type = icaoToType(ac.t);
                return res.json({
                    success: true,
                    source: 'adsb.lol',
                    aircraft: {
                        airline: airline,
                        type: type,
                        registration: ac.r || reg
                    }
                });
            }
        } catch (err) { continue; }
    }

    // 全部搵唔到
    res.json({ 
        success: false, 
        message: `資料庫暫時未有 ${reg} 的資料，請手動填寫，或聯絡管理員添加`,
        code: 'NOT_FOUND'
    });
});

// 獲取已批准照片（公開）
router.get('/', async (req, res) => {
    try {
        const [photos] = await db.execute(`  
            SELECT p.*, u.display_name, u.avatar_url,
            (SELECT COUNT(*) FROM likes WHERE photo_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments WHERE photo_id = p.id) as comment_count
            FROM photos p JOIN users u ON p.user_id = u.id 
            WHERE p.status = 'approved' ORDER BY p.created_at DESC
          `);
        res.json(photos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 獲取單張照片詳情
router.get('/:id', async (req, res) => {
    try {
        const [photos] = await db.execute(`  
            SELECT p.*, u.display_name, u.avatar_url,
            (SELECT COUNT(*) FROM likes WHERE photo_id = p.id) as like_count
            FROM photos p JOIN users u ON p.user_id = u.id 
            WHERE p.id = ? AND p.status = 'approved'
          `, [req.params.id]);
        if (photos.length === 0) return res.status(404).json({ error: '照片不存在' });
        const [comments] = await db.execute(`  
            SELECT c.*, u.display_name, u.avatar_url 
            FROM comments c JOIN users u ON c.user_id = u.id 
            WHERE c.photo_id = ? ORDER BY c.created_at DESC
          `, [req.params.id]);
        res.json({ photo: photos[0], comments });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 上傳照片（需登入）
router.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '請先登入' });
    try {
        const { title, description, airline, aircraft_type, registration, origin, destination, location, photo_date } = req.body;
        const imageUrl = '/uploads/' + req.file.filename;
        const [result] = await db.execute(
            `INSERT INTO photos (user_id, title, description, image_url, airline, aircraft_type, registration, origin, destination, location, photo_date, status)   
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, title, description, imageUrl, airline, aircraft_type, registration, origin, destination, location, photo_date]
        );
        res.json({ success: true, photoId: result.insertId, message: '照片上傳成功，等待審核' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 新增評論（需登入）
router.post('/:id/comments', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '請先登入' });
    try {
        const { content } = req.body;
        await db.execute('INSERT INTO comments (photo_id, user_id, content) VALUES (?, ?, ?)',
            [req.params.id, req.user.id, content]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 喜歡/取消喜歡（需登入）
router.post('/:id/like', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '請先登入' });
    try {
        const [existing] = await db.execute('SELECT * FROM likes WHERE photo_id = ? AND user_id = ?',
            [req.params.id, req.user.id]);
        if (existing.length > 0) {
            await db.execute('DELETE FROM likes WHERE photo_id = ? AND user_id = ?', [req.params.id, req.user.id]);
            res.json({ liked: false });
        } else {
            await db.execute('INSERT INTO likes (photo_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
            res.json({ liked: true });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 檢查是否已喜歡
router.get('/:id/like-status', async (req, res) => {
    if (!req.isAuthenticated()) return res.json({ liked: false });
    try {
        const [existing] = await db.execute('SELECT * FROM likes WHERE photo_id = ? AND user_id = ?',
            [req.params.id, req.user.id]);
        res.json({ liked: existing.length > 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;