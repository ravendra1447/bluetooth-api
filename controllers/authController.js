const db = require('../config/db');

exports.login = async (req, res) => {
    try {
        const { phone, password } = req.body;
        const [rows] = await db.query(
            'SELECT * FROM users WHERE phone=?',
            [phone]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: 'User Not Found' });
        }

        const user = rows[0];

        if (user.password !== password) {
            return res.json({ success: false, message: 'Wrong Password' });
        }

        res.json({ success: true, user: user });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
}
