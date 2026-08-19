const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');
const db = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 設定
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Passport 初始化
app.use(passport.initialize());
app.use(passport.session());

// 設定模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 路由
app.use('/auth', require('./routes/auth'));
app.use('/api/photos', require('./routes/photos'));

// 首頁
app.get('/', async (req, res) => {
    let pendingCount = 0;
    if (req.user && req.user.is_admin) {
        try {
            const [rows] = await db.execute("SELECT COUNT(*) as count FROM photos WHERE status = 'pending'");
            pendingCount = rows[0].count;
        } catch (e) {
            console.error(e);
        }
    }
    res.render('index', { user: req.user, pendingCount });
});

// 登入頁
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('login');
});

// 上載頁（必須登入）
app.get('/upload', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    res.render('upload', { user: req.user });
});

// 管理員審核頁
app.get('/admin', async (req, res) => {
    if (!req.isAuthenticated() || !req.user.is_admin) {
        return res.status(403).send('Access Denied');
    }
    res.render('admin', { user: req.user });
});

// 單張照片詳情頁
app.get('/photo/:id', async (req, res) => {
    try {
        const [photos] = await db.execute(`
            SELECT p.*, u.display_name, u.avatar_url 
            FROM photos p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ? AND p.status = 'approved'
        `, [req.params.id]);
        
        if (photos.length === 0) {
            return res.status(404).send('照片不存在或未審核');
        }
        
        res.render('photo-detail', { 
            user: req.user, 
            photo: photos[0] 
        });
    } catch (error) {
        res.status(500).send('載入失敗');
    }
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});