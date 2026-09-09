require('dotenv').config();
const express = require('express');

const requiredEnvs = ['PORT', 'DATABASE_URL'];
for (const env of requiredEnvs) {
    if (!process.env[env]) {
        console.error(`FATAL ERROR: Environment variable ${env} is missing.`);
        process.exit(1); 
    }
}

const app = express();
app.use(express.json());

const healthRoute = require('./routes/health');
app.use('/health', healthRoute);


const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Service running on port ${PORT}`);
});
