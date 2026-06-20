const express = require('express');
const router = express.Router();

router.post('/tenant', (req, res) => res.json({ success: true, message: 'Not implemented' }));

module.exports = router;
