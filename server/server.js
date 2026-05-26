const express = require('express');
const path = require('path');

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Dynamic route to serve environment variables safely to the frontend browser
app.get('/env.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    
    // We only expose public keys. Never expose service role keys.
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_ANON_KEY || '';
    
    res.send(`
        window.SUPABASE_URL = "${url}";
        window.SUPABASE_ANON_KEY = "${key}";
    `);
});

// Serve static assets (CSS, JS, Images) from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve the main application index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback route: serve index.html for all other routes to allow SPA routing
// and support redirects (such as Supabase password reset email verification redirects)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running perfectly on http://localhost:${PORT}`);
});