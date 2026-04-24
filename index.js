const express = require('express');
// body-parser absorvido pelo express
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');

const app = express();

const dbConfig = {
    host: process.env.DB_HOST || 'db',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASS || 'password',
    database: process.env.DB_NAME || 'marmitadb'
};

let pool;

async function connectWithRetry() {
    console.log('🔍 [INFRA] Tentando conectar ao MySQL...');
    for (let i = 1; i <= 10; i++) {
        try {
            pool = mysql.createPool(dbConfig);
            await pool.query('SELECT 1');
            console.log('✅ [DATABASE] Conectado ao MySQL com sucesso!');
            return;
        } catch (err) {
            console.log(`⚠️ [DATABASE] Tentativa ${i}/10 falhou. Aguardando...`);
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    process.exit(1);
}

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            let match = false;
            const passwordParts = rows[0].password.split(':');
            if (passwordParts.length === 2) {
                const [salt, key] = passwordParts;
                const hashedBuffer = crypto.scryptSync(password, salt, 64);
                const keyBuffer = Buffer.from(key, 'hex');
                match = hashedBuffer.length === keyBuffer.length && crypto.timingSafeEqual(hashedBuffer, keyBuffer);
            }
            if (match) res.redirect('/dashboard');
            else res.send('<h1>Login Inválido</h1><a href="/">Voltar</a>');
        } else {
            res.send('<h1>Login Inválido</h1><a href="/">Voltar</a>');
        }
    } catch (err) {
        res.status(500).send("Erro no banco.");
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        const finalHash = `${salt}:${hash}`;
        await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, finalHash]);
        res.send('<h1>Conta registrada com sucesso!</h1><a href="/">Ir para o Login</a>');
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') res.status(400).send("<h1>Usuário já existe.</h1><a href='/'>Voltar</a>");
        else res.status(500).send("Erro no servidor.");
    }
});

app.get('/dashboard', async (req, res) => {
    const [items] = await pool.query('SELECT * FROM items');
    const [orders] = await pool.query('SELECT * FROM orders');
    res.render('dashboard', { items, orders });
});

connectWithRetry().then(() => {
    app.listen(3000, () => console.log('🚀 MARMITATECH PRO ONLINE NA PORTA 3000'));
});
