require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Create MySQL connection pool
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Root@1116',
    database: process.env.DB_NAME || 'hostel_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
};

const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

// Verification state
let connectionStatus = {
    online: false,
    database: dbConfig.database,
    tableVerified: false,
    lastChecked: null,
    error: null,
    roomCount: 0
};

// Initialize and verify database & table schema
async function verifyAndInitializeDb() {
    try {
        // First test raw connection to MySQL server
        const [rows] = await promisePool.query('SELECT 1 + 1 AS test');
        connectionStatus.online = true;
        connectionStatus.error = null;

        // Verify or create schema
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS rooms (
                room_id INT AUTO_INCREMENT PRIMARY KEY,
                room_no VARCHAR(50) NOT NULL UNIQUE,
                block_name VARCHAR(100) NOT NULL,
                room_capacity INT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'Available'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await promisePool.query(createTableSql);

        // Check columns
        const [columns] = await promisePool.query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'rooms'
        `, [dbConfig.database]);

        const requiredCols = ['room_id', 'room_no', 'block_name', 'room_capacity', 'status'];
        const existingColNames = columns.map(c => c.COLUMN_NAME.toLowerCase());
        const allPresent = requiredCols.every(rc => existingColNames.includes(rc));

        connectionStatus.tableVerified = allPresent;

        // Count rooms
        const [countResult] = await promisePool.query('SELECT COUNT(*) AS total FROM rooms');
        connectionStatus.roomCount = countResult[0].total;

        // Seed sample data if empty
        if (connectionStatus.roomCount === 0) {
            const seedSql = `
                INSERT INTO rooms (room_no, block_name, room_capacity, status) VALUES
                ('BH-101', "Boys' Hostel (Block A)", 2, 'Available'),
                ('BH-102', "Boys' Hostel (Block A)", 3, 'Occupied'),
                ('BH-201', "Boys' Hostel (Block B)", 2, 'Available'),
                ('GH-101', "Girls' Hostel (Block C)", 2, 'Available'),
                ('GH-102', "Girls' Hostel (Block C)", 4, 'Occupied'),
                ('GH-201', "Girls' Hostel (Block D)", 2, 'Available'),
                ('PR-301', 'Premium Deluxe Suite', 1, 'Available'),
                ('PR-302', 'Premium Executive Room', 1, 'Under Maintenance'),
                ('SR-105', 'Shared Standard Block', 4, 'Available'),
                ('SR-106', 'Shared Standard Block', 3, 'Available');
            `;
            await promisePool.query(seedSql);
            const [newCount] = await promisePool.query('SELECT COUNT(*) AS total FROM rooms');
            connectionStatus.roomCount = newCount[0].total;
        }

        connectionStatus.lastChecked = new Date().toISOString();
        console.log(`[MySQL Success] Connected to database '${dbConfig.database}'. Schema verified. Total rooms: ${connectionStatus.roomCount}`);
    } catch (err) {
        connectionStatus.online = false;
        connectionStatus.tableVerified = false;
        connectionStatus.error = err.message;
        connectionStatus.lastChecked = new Date().toISOString();
        console.error('[MySQL Offline/Error]', err.message);
    }
}

// Initial DB check
verifyAndInitializeDb();

// ------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------

// 1. Connection Status API
app.get('/api/status', async (req, res) => {
    try {
        const [result] = await promisePool.query('SELECT 1 AS live');
        const [countResult] = await promisePool.query('SELECT COUNT(*) AS total FROM rooms');
        connectionStatus.online = true;
        connectionStatus.error = null;
        connectionStatus.tableVerified = true;
        connectionStatus.roomCount = countResult[0].total;
        connectionStatus.lastChecked = new Date().toISOString();
    } catch (err) {
        connectionStatus.online = false;
        connectionStatus.tableVerified = false;
        connectionStatus.error = err.message;
        connectionStatus.lastChecked = new Date().toISOString();
    }
    res.json(connectionStatus);
});

// 2. View Available / Vacant Rooms
// NOTE: Defined BEFORE /rooms/:id so "available" is not treated as an ID parameter
app.get('/rooms/available', async (req, res) => {
    try {
        const sql = `
            SELECT * FROM rooms 
            WHERE LOWER(status) IN ('available', 'vacant')
            ORDER BY block_name ASC, room_no ASC
        `;
        const [rows] = await promisePool.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve available rooms', details: err.message });
    }
});

// 3. View All Rooms (with optional filtering)
app.get('/rooms', async (req, res) => {
    try {
        const { block, status, search } = req.query;
        let sql = 'SELECT * FROM rooms WHERE 1=1';
        const params = [];

        if (block && block !== 'All') {
            sql += ' AND block_name LIKE ?';
            params.push(`%${block}%`);
        }

        if (status && status !== 'All') {
            sql += ' AND status = ?';
            params.push(status);
        }

        if (search) {
            sql += ' AND (room_no LIKE ? OR block_name LIKE ? OR status LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        sql += ' ORDER BY room_id ASC';

        const [rows] = await promisePool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Database query error', details: err.message });
    }
});

// 4. Search / Get Single Room by ID or Room Number
app.get('/rooms/:id', async (req, res) => {
    try {
        const identifier = req.params.id;
        const isNumeric = /^\d+$/.test(identifier);

        let sql = 'SELECT * FROM rooms WHERE room_id = ? OR room_no = ?';
        let params = [identifier, identifier];

        const [rows] = await promisePool.query(sql, params);

        if (rows.length === 0) {
            return res.status(404).json({ error: `Room with identifier '${identifier}' not found.` });
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error searching for room', details: err.message });
    }
});

// 5. Insert New Room
app.post('/rooms', async (req, res) => {
    try {
        const { room_no, block_name, room_capacity, status } = req.body;

        // Validation
        if (!room_no || !block_name || room_capacity === undefined || !status) {
            return res.status(400).json({ error: 'All fields (room_no, block_name, room_capacity, status) are required.' });
        }

        const capacity = parseInt(room_capacity, 10);
        if (isNaN(capacity) || capacity <= 0) {
            return res.status(400).json({ error: 'Room capacity must be a positive integer.' });
        }

        // Check if room_no already exists
        const [existing] = await promisePool.query('SELECT room_id FROM rooms WHERE room_no = ?', [room_no.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: `Room number '${room_no.trim()}' already exists. Please choose a unique room number.` });
        }

        const insertSql = `
            INSERT INTO rooms (room_no, block_name, room_capacity, status)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await promisePool.query(insertSql, [
            room_no.trim(),
            block_name.trim(),
            capacity,
            status.trim()
        ]);

        res.status(201).json({
            message: 'Room inserted successfully',
            room_id: result.insertId,
            room: {
                room_id: result.insertId,
                room_no: room_no.trim(),
                block_name: block_name.trim(),
                room_capacity: capacity,
                status: status.trim()
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to insert room', details: err.message });
    }
});

// 6. Update Room
app.put('/rooms/:id', async (req, res) => {
    try {
        const identifier = req.params.id;
        const { room_no, block_name, room_capacity, status } = req.body;

        if (!room_no || !block_name || room_capacity === undefined || !status) {
            return res.status(400).json({ error: 'All fields (room_no, block_name, room_capacity, status) are required.' });
        }

        const capacity = parseInt(room_capacity, 10);
        if (isNaN(capacity) || capacity <= 0) {
            return res.status(400).json({ error: 'Room capacity must be a positive number.' });
        }

        // Find room by id or room_no
        const [found] = await promisePool.query('SELECT * FROM rooms WHERE room_id = ? OR room_no = ?', [identifier, identifier]);
        if (found.length === 0) {
            return res.status(404).json({ error: `Room '${identifier}' not found.` });
        }

        const currentId = found[0].room_id;

        // Check duplicate room_no on different room
        const [conflict] = await promisePool.query('SELECT room_id FROM rooms WHERE room_no = ? AND room_id != ?', [room_no.trim(), currentId]);
        if (conflict.length > 0) {
            return res.status(409).json({ error: `Another room already uses room number '${room_no.trim()}'.` });
        }

        const updateSql = `
            UPDATE rooms 
            SET room_no = ?, block_name = ?, room_capacity = ?, status = ?
            WHERE room_id = ?
        `;
        const [result] = await promisePool.query(updateSql, [
            room_no.trim(),
            block_name.trim(),
            capacity,
            status.trim(),
            currentId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room could not be updated or no changes were made.' });
        }

        res.json({
            message: 'Room updated successfully',
            room: {
                room_id: currentId,
                room_no: room_no.trim(),
                block_name: block_name.trim(),
                room_capacity: capacity,
                status: status.trim()
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update room', details: err.message });
    }
});

// 7. Delete Room
app.delete('/rooms/:id', async (req, res) => {
    try {
        const identifier = req.params.id;

        const [found] = await promisePool.query('SELECT * FROM rooms WHERE room_id = ? OR room_no = ?', [identifier, identifier]);
        if (found.length === 0) {
            return res.status(404).json({ error: `Room '${identifier}' not found for deletion.` });
        }

        const targetId = found[0].room_id;
        const [result] = await promisePool.query('DELETE FROM rooms WHERE room_id = ?', [targetId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found to delete.' });
        }

        res.json({
            message: `Room #${found[0].room_no} (ID: ${targetId}) deleted successfully.`,
            deletedRoom: found[0]
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete room', details: err.message });
    }
});

// Backward compatibility: listOne.html
app.get('/listOne.html', (req, res) => {
    res.redirect('/search.html');
});

// Fallback index
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Parthu Reddy's Hostel Management System`);
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`====================================================`);
});
