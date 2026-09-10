const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    // Return 200 tanpa mengecek koneksi database
    res.status(200).json({ status: 'ok' });
});

module.exports = router;
