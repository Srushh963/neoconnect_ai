const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files (CSS, JS, Images) from the same directory
app.use(express.static(__dirname));

// Route to serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running perfectly on http://localhost:${PORT}`);
});