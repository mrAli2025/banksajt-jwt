import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from './db.js';
import { validateAmount, validateWithdrawal } from './src/validateAmount.js';

const app = express();
const port = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET måste vara minst 32 byte');
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware: kräver en giltig Bearer-token och sätter req.userId
function requireAuth(req, res, next) {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Ogiltig eller saknad token' });
    }

    const token = authHeader.slice('Bearer '.length);

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'banken',
            audience: 'banken-api',
        });
    } catch (err) {
        return res.status(401).json({ error: 'Ogiltig eller utgången token' });
    }

    if (typeof payload !== 'object' || payload === null || typeof payload.sub !== 'string') {
        return res.status(401).json({ error: 'Ogiltig token' });
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ error: 'Ogiltig token' });
    }

    req.userId = userId;
    next();
}

// Hjälpfunktion: hämta konto för ett verifierat användar-id
async function getAccountByUserId(userId) {
    const [accountRows] = await pool.query(
        'SELECT * FROM accounts WHERE userId = ?',
        [userId]
    );

    if (accountRows.length === 0) {
        return { error: 'account' };
    }

    return { account: accountRows[0] };
}

// Skapa användare
app.post('/users', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await pool.query(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, passwordHash]
        );

        const userId = result.insertId;

        await pool.query(
            'INSERT INTO accounts (userId, amount) VALUES (?, 0)',
            [userId]
        );

        res.status(201).json({ id: userId, username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    }
});

// Logga in
app.post('/sessions', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(401).json({ error: 'Fel användarnamn eller lösenord' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Fel användarnamn eller lösenord' });
        }

        const user = rows[0];
        const passwordIsCorrect = await bcrypt.compare(password, user.password);

        if (!passwordIsCorrect) {
            return res.status(401).json({ error: 'Fel användarnamn eller lösenord' });
        }

        const token = jwt.sign({ sub: String(user.id) }, JWT_SECRET, {
            algorithm: 'HS256',
            issuer: 'banken',
            audience: 'banken-api',
            expiresIn: '15m',
        });

        res.status(200).json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    }
});

// Visa saldo
app.post('/me/accounts', requireAuth, async (req, res) => {
    try {
        const result = await getAccountByUserId(req.userId);

        if (result.error === 'account') {
            return res.status(404).json({ error: 'Konto hittades inte' });
        }

        res.status(200).json({ amount: result.account.amount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    }
});

// Sätt in pengar
app.post('/me/accounts/transactions', requireAuth, async (req, res) => {
    const { amount } = req.body;

    if (!validateAmount(amount)) {
        return res.status(400).json({ error: 'Ogiltigt belopp' });
    }

    let connection;

    try {
        const result = await getAccountByUserId(req.userId);

        if (result.error === 'account') {
            return res.status(404).json({ error: 'Konto hittades inte' });
        }

        const account = result.account;
        const newAmount = account.amount + amount;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            'UPDATE accounts SET amount = ? WHERE id = ?',
            [newAmount, account.id]
        );

        await connection.query(
            'INSERT INTO transactions (accountId, type, amount) VALUES (?, ?, ?)',
            [account.id, 'deposit', amount]
        );

        await connection.commit();

        res.status(200).json({ amount: newAmount });
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Ta ut pengar
app.post('/me/accounts/withdrawals', requireAuth, async (req, res) => {
    const { amount } = req.body;

    let connection;

    try {
        const result = await getAccountByUserId(req.userId);

        if (result.error === 'account') {
            return res.status(404).json({ error: 'Konto hittades inte' });
        }

        const account = result.account;

        if (!validateWithdrawal(amount, account.amount)) {
            return res.status(400).json({ error: 'Ogiltigt uttag eller otillräckligt saldo' });
        }

        const newAmount = account.amount - amount;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            'UPDATE accounts SET amount = ? WHERE id = ?',
            [newAmount, account.id]
        );

        await connection.query(
            'INSERT INTO transactions (accountId, type, amount) VALUES (?, ?, ?)',
            [account.id, 'withdrawal', amount]
        );

        await connection.commit();

        res.status(200).json({ amount: newAmount });
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Hämta transaktionshistorik
app.post('/me/transactions', requireAuth, async (req, res) => {
    try {
        const result = await getAccountByUserId(req.userId);

        if (result.error === 'account') {
            return res.status(404).json({ error: 'Konto hittades inte' });
        }

        const [transactions] = await pool.query(
            'SELECT id, type, amount, created_at FROM transactions WHERE accountId = ? ORDER BY created_at DESC, id DESC',
            [result.account.id]
        );

        res.status(200).json({ transactions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Något gick fel' });
    }
});

// Starta servern
app.listen(port, () => {
    console.log(`Bankens backend körs på http://localhost:${port}`);
});