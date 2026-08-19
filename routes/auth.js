const express = require('express');
const router = express.Router();
const passport = require('passport');

// Google 登入
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google 登入回調
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        res.redirect('/');
    }
);

// 登出
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// 取得登入用戶資料（API）
router.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            loggedIn: true,
            user: req.user
        });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;