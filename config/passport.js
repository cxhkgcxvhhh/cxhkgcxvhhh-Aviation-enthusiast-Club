const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');

const ADMIN_EMAIL = 'cxhkgcxvhhh@gmail.com';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const [users] = await db.execute('SELECT * FROM users WHERE google_id = ?', [profile.id]);
        
        if (users.length > 0) {
            await db.execute('UPDATE users SET display_name = ?, avatar_url = ?, email = ? WHERE google_id = ?',
                [profile.displayName, profile.photos[0].value, email, profile.id]);
            const [updated] = await db.execute('SELECT * FROM users WHERE google_id = ?', [profile.id]);
            return done(null, updated[0]);
        } else {
            const isAdmin = (email === ADMIN_EMAIL) ? 1 : 0;
            const [result] = await db.execute(
                'INSERT INTO users (google_id, email, display_name, avatar_url, is_admin) VALUES (?, ?, ?, ?, ?)',
                [profile.id, email, profile.displayName, profile.photos[0].value, isAdmin]
            );
            const [newUser] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
            return done(null, newUser[0]);
        }
    } catch (err) { return done(err, null); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        done(null, users[0] || null);
    } catch (err) { done(err, null); }
});

module.exports = passport;