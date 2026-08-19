const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');

// 設定上傳
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只接受圖片檔案'), false);
        }
    }
});

// 取得已審核照片（公眾）
router.get('/', async (req, res) => {
    try {
        const [photos] = await db.execute(`
            SELECT p.*, u.display_name, u.avatar_url 
            FROM photos p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.status = 'approved' 
            ORDER BY p.created_at DESC
        `);

        // 如果用戶已登入，檢查佢有冇 like/fav
        if (req.isAuthenticated && req.isAuthenticated()) {
            const userId = req.user.id;
            for (let photo of photos) {
                const [likes] = await db.execute(
                    'SELECT id FROM likes WHERE photo_id = ? AND user_id = ?',
                    [photo.id, userId]
                );
                const [favs] = await db.execute(
                    'SELECT id FROM favorites WHERE photo_id = ? AND user_id = ?',
                    [photo.id, userId]
                );
                photo.user_liked = likes.length > 0;
                photo.user_favorited = favs.length > 0;
            }
        }
        
        res.json(photos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 上傳照片（必須登入）
router.post('/upload', ensureAuthenticated, upload.single('photo'), async (req, res) => {
    try {
        const { airline, destination, destination_code, aircraft_registration, flight_number, aircraft_model, engine_type } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: '請選擇照片' });
        }

        await db.execute(
            `INSERT INTO photos (user_id, photo_path, airline, destination, destination_code, aircraft_registration, flight_number, aircraft_model, engine_type, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, '/uploads/' + req.file.filename, airline, destination, destination_code, aircraft_registration, flight_number, aircraft_model || null, engine_type || null]
        );
        
        res.json({ success: true, message: '照片已上傳，等待審核' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取得待審核照片（管理員）
router.get('/pending', ensureAuthenticated, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: '無權限' });
        }
        const [photos] = await db.execute(`
            SELECT p.*, u.display_name, u.avatar_url, u.score
            FROM photos p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.status = 'pending' 
            ORDER BY p.created_at DESC
        `);
        res.json(photos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 審核照片（管理員）
router.post('/review/:id', ensureAuthenticated, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: '無權限' });
        }
        
        const { status, rejection_reason } = req.body;
        const photoId = req.params.id;
        
        const [photo] = await db.execute('SELECT * FROM photos WHERE id = ?', [photoId]);
        if (photo.length === 0) {
            return res.status(404).json({ error: '照片不存在' });
        }
        
        await db.execute(
            'UPDATE photos SET status = ?, rejection_reason = ? WHERE id = ?',
            [status, rejection_reason || null, photoId]
        );
        
        // 更新用戶分數
        const scoreChange = status === 'approved' ? 1 : -1;
        await db.execute(
            'UPDATE users SET score = score + ? WHERE id = ?',
            [scoreChange, photo[0].user_id]
        );
        
        res.json({ success: true, message: status === 'approved' ? '審核通過 (+1分)' : '審核拒絕 (-1分)' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 讚好
router.post('/:id/like', ensureAuthenticated, async (req, res) => {
    try {
        const photoId = req.params.id;
        const userId = req.user.id;
        
        await db.execute(
            'INSERT IGNORE INTO likes (photo_id, user_id) VALUES (?, ?)',
            [photoId, userId]
        );
        
        await db.execute(
            'UPDATE photos SET likes_count = likes_count + 1 WHERE id = ?',
            [photoId]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取消讚好
router.delete('/:id/like', ensureAuthenticated, async (req, res) => {
    try {
        const photoId = req.params.id;
        const userId = req.user.id;
        
        await db.execute(
            'DELETE FROM likes WHERE photo_id = ? AND user_id = ?',
            [photoId, userId]
        );
        
        await db.execute(
            'UPDATE photos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?',
            [photoId]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 收藏
router.post('/:id/favorite', ensureAuthenticated, async (req, res) => {
    try {
        const photoId = req.params.id;
        const userId = req.user.id;
        
        await db.execute(
            'INSERT IGNORE INTO favorites (photo_id, user_id) VALUES (?, ?)',
            [photoId, userId]
        );
        
        await db.execute(
            'UPDATE photos SET favorites_count = favorites_count + 1 WHERE id = ?',
            [photoId]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取消收藏
router.delete('/:id/favorite', ensureAuthenticated, async (req, res) => {
    try {
        const photoId = req.params.id;
        const userId = req.user.id;
        
        await db.execute(
            'DELETE FROM favorites WHERE photo_id = ? AND user_id = ?',
            [photoId, userId]
        );
        
        await db.execute(
            'UPDATE photos SET favorites_count = GREATEST(favorites_count - 1, 0) WHERE id = ?',
            [photoId]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 新增評論
router.post('/:id/comment', ensureAuthenticated, async (req, res) => {
    try {
        const photoId = req.params.id;
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            return res.status(400).json({ error: '評論內容不能為空' });
        }
        
        const [result] = await db.execute(
            'INSERT INTO comments (photo_id, user_id, content) VALUES (?, ?, ?)',
            [photoId, req.user.id, content.trim()]
        );
        
        res.json({ success: true, commentId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取得評論
router.get('/:id/comments', async (req, res) => {
    try {
        const photoId = req.params.id;
        const [comments] = await db.execute(`
            SELECT c.*, u.display_name, u.avatar_url 
            FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.photo_id = ? 
            ORDER BY c.created_at DESC
        `, [photoId]);
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 取得單張照片詳情（俾 photo-detail 頁面用）
router.get('/:id/detail', async (req, res) => {
    try {
        const [photos] = await db.execute(`
            SELECT p.*, u.display_name, u.avatar_url 
            FROM photos p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ? AND p.status = 'approved'
        `, [req.params.id]);
        
        if (photos.length === 0) {
            return res.status(404).json({ error: '照片不存在或未審核' });
        }
        
        const photo = photos[0];
        
        // 檢查用戶 like/fav 狀態
        if (req.isAuthenticated && req.isAuthenticated()) {
            const userId = req.user.id;
            const [likes] = await db.execute(
                'SELECT id FROM likes WHERE photo_id = ? AND user_id = ?',
                [photo.id, userId]
            );
            const [favs] = await db.execute(
                'SELECT id FROM favorites WHERE photo_id = ? AND user_id = ?',
                [photo.id, userId]
            );
            photo.user_liked = likes.length > 0;
            photo.user_favorited = favs.length > 0;
        }
        
        res.json(photo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;