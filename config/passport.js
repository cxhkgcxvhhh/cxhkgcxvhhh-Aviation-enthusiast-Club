const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE google_id = ?',
            [profile.id]
        );

        if (rows.length > 0) {
            return done(null, rows[0]);
        }

        const [result] = await db.execute(
            'INSERT INTO users (google_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?)',
            [
                profile.id,
                profile.emails[0].value,
                profile.displayName,
                profile.photos[0].value
            ]
        );

        const [newUser] = await db.execute(
            'SELECT * FROM users WHERE id = ?',
            [result.insertId]
        );

        return done(null, newUser[0]);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        done(null, rows[0]);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;