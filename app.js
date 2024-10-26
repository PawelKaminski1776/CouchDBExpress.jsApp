const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const PouchDB = require('pouchdb');
require('dotenv').config();

PouchDB.plugin(require('pouchdb-find'));

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const db = new PouchDB('laptop-prices');

app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';

        const mangoQuery = {
            selector: searchTerm
                ? { Product: { $regex: `${searchTerm}` } }
                : {},
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
    try {
        const doc = req.body;

        if (doc._id) {
            const existingDoc = await db.get(doc._id);
            await db.put({
                ...existingDoc,  
                ...doc           
            });
        } else {
            await db.post(doc);
        }

        res.redirect('/');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/delete/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const doc = await db.get(id);
        await db.remove(doc);
        res.redirect('/');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/sync', async (req, res) => {
    const remoteCouch = `http://${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}@localhost:5984/laptop-prices`;
    const remoteDB = new PouchDB(remoteCouch);
    
    try {
        await db.sync(remoteDB);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
