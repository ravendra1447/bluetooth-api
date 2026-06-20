const db = require('../config/db');

exports.payOutstanding = async (req, res) => {
    try {
        const { billId, amount, paymentMethod, transactionId } = req.body;

        const [billRows] = await db.query(
            `SELECT * FROM bills WHERE id=?`,
            [billId]
        );

        if (billRows.length === 0) {
            return res.json({ success: false, message: 'Bill Not Found' });
        }

        const bill = billRows[0];

        const paidAmount = Number(bill.paidAmount || 0) + Number(amount);
        const outstanding = Number(bill.amount) + Number(bill.previousDue) - paidAmount;

        let status = 'pending';
        if (outstanding <= 0) {
            status = 'paid';
        }

        await db.query(
            `UPDATE bills SET paidAmount=?, outstanding=?, status=? WHERE id=?`,
            [paidAmount, outstanding, status, billId]
        );

        await db.query(
            `INSERT INTO payments(billId, amount, paymentMethod, transactionId, status) VALUES(?, ?, ?, ?, ?)`,
            [billId, amount, paymentMethod, transactionId, 'success']
        );

        res.json({
            success: true,
            paidAmount,
            outstanding,
            status
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
}
