const express = require('express');
const bodyParser = require('body-parser');
const PouchDB = require('pouchdb');
const axios = require('axios');
require('dotenv').config();

PouchDB.plugin(require('pouchdb-find'));

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let bearerToken = null;
let tokenExpiry = null;

async function fetchBearerToken() {
    const authUrl = `https://iam.cloud.ibm.com/identity/token`;
    const apiKey = process.env.CLOUDANT_API_KEY;

    const body = new URLSearchParams({
        'grant_type': 'urn:ibm:params:oauth:grant-type:apikey',
        'apikey': apiKey
    });

    try {
        const response = await axios.post(authUrl, body.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        bearerToken = response.data.access_token;
        tokenExpiry = Date.now() + response.data.expires_in * 1000;  // Set token expiry time
    } catch (err) {
        console.error("Error fetching bearer token:", err.response ? err.response.data : err.message);
    }
}

app.use(async (req, res, next) => {
    if (!bearerToken || Date.now() >= tokenExpiry) {
        await fetchBearerToken();
    }
    next();
});

function getDatabase() {
    return new PouchDB(`https://${process.env.CLOUDANT_HOST}/laptop-prices`, {
        fetch: (url, opts) => {
            opts.headers.set('Authorization', `Bearer ${bearerToken}`);
            return PouchDB.fetch(url, opts);
        }
    });
}

app.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';

        const mangoQuery = {
            selector: searchTerm ? { Product: { $regex: `${searchTerm}` } } : {},
            limit,
            skip
        };

        const response = await db.find(mangoQuery);
        const documents = response.docs;

        res.render('index.ejs', {
            documents,
            page,
            totalPages: Math.ceil(response.total_rows / limit),
            searchTerm
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/document', async (req, res) => {
    console.log(req.body);
    const db = getDatabase();
    const doc = req.body;
    try {
        if (doc._id) {
            const existingDoc = await db.get(doc._id);
            await db.put({ ...existingDoc, ...doc });
        } else {
            await db.post(doc);
        }

        res.redirect('/');
    } catch (err) {
        await db.post(doc);
        res.redirect('/');
    }
});

app.post('/delete/:id', async (req, res) => {
    const db = getDatabase();
    try {
        const id = req.params.id;
        const doc = await db.get(id);
        await db.remove(doc);
        res.redirect('/');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
