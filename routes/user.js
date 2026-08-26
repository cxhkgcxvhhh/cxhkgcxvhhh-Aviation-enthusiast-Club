const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/profile', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '請先登入' });
    try {
        const [users] = await db.execute('SELECT id, display_name, email, avatar_url, is_admin FROM users WHERE id = ?', [req.user.id]);
        const [photos] = await db.execute(`
            SELECT p.*, 
            (SELECT COUNT(*) FROM likes WHERE photo_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments WHERE photo_id = p.id) as comment_count
            FROM photos p WHERE p.user_id = ? ORDER BY p.created_at DESC
        `, [req.user.id]);
        const [stats] = await db.execute(`
            SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
            FROM photos WHERE user_id = ?
        `, [req.user.id]);
        res.json({ user: users[0], photos, stats: stats[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, display_name, avatar_url FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) return res.status(404).json({ error: '用戶不存在' });
        const [photos] = await db.execute(`
            SELECT p.*, (SELECT COUNT(*) FROM likes WHERE photo_id = p.id) as like_count
            FROM photos p WHERE p.user_id = ? AND p.status = 'approved' ORDER BY p.created_at DESC
        `, [req.params.id]);
        res.json({ user: users[0], photos });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;