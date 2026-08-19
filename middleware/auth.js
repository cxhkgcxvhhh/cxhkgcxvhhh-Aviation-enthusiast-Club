function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.is_admin) {
        return next();
    }
    res.status(403).send('Access Denied');
}

module.exports = {
    ensureAuthenticated,
    ensureAdmin
};