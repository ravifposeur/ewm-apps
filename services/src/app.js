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
const eventsRoute = require('./routes/events');
const { errorHandler } = require('./problem');

app.use('/health', healthRoute);
app.use('/v1/events', eventsRoute);
app.use('/events', eventsRoute);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Service running on port ${PORT}`);
    });
}

module.exports = app;
