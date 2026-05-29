const express = require('express');
// body-parser absorvido pelo express
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');

// Rotas modulares
const exportRoutes = require('./routes/exportRoutes');

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
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.render('login'));

app.get('/register', (req, res) => res.render('register'));

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
            if (match) return res.redirect('/dashboard');
        }
        res.render('login', { error: 'Usuário ou senha inválidos.' });
    } catch (err) {
        console.error('❌ [AUTH] Erro no login:', err.message);
        res.render('login', { error: 'Erro interno. Tente novamente.' });
    }
});

app.post('/register', async (req, res) => {
    const { username, password, confirm_password } = req.body;
    if (password !== confirm_password) {
        return res.render('register', { error: 'As senhas não coincidem.' });
    }
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        const finalHash = `${salt}:${hash}`;
        await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, finalHash]);
        res.render('register', { success: 'Conta criada com sucesso! Faça login para continuar.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.render('register', { error: 'Este nome de usuário já está em uso.' });
        } else {
            console.error('❌ [AUTH] Erro no cadastro:', err.message);
            res.render('register', { error: 'Erro interno. Tente novamente.' });
        }
    }
});

// Rota para adicionar itens (ingredientes/marmitas)
app.post('/add-item', async (req, res) => {
    const { name, category, price } = req.body;
    const redirectTo = req.query.from === 'marmitas' ? '/marmitas' : '/dashboard';
    try {
        await pool.query('INSERT INTO items (name, category, price) VALUES (?, ?, ?)', [name, category || null, price || 0]);
        res.redirect(redirectTo);
    } catch (err) {
        console.error('❌ [ITEMS] Erro ao cadastrar item:', err.message);
        res.status(500).send("Erro ao cadastrar item.");
    }
});

// Rota para atualizar uma marmita
app.post('/items/:id/update', async (req, res) => {
    const { name, category, price } = req.body;
    const { id } = req.params;
    try {
        await pool.query(
            'UPDATE items SET name = ?, category = ?, price = ? WHERE id = ?',
            [name, category || null, price || 0, id]
        );
        console.log(`✅ [ITEMS] Marmita #${id} atualizada.`);
        res.redirect('/marmitas');
    } catch (err) {
        console.error('❌ [ITEMS] Erro ao atualizar item:', err.message);
        res.status(500).send("Erro ao atualizar item.");
    }
});

// Rota para excluir uma marmita
app.post('/items/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM items WHERE id = ?', [id]);
        console.log(`🗑️ [ITEMS] Marmita #${id} excluída.`);
        res.redirect('/marmitas');
    } catch (err) {
        console.error('❌ [ITEMS] Erro ao excluir item:', err.message);
        res.status(500).send("Erro ao excluir item.");
    }
});

// Rota POST /orders — registra uma venda associando cliente à marmita
app.post('/orders', async (req, res) => {
    const { customer_name, item_id } = req.body;
    if (!customer_name || !item_id) {
        return res.status(400).send("Nome do cliente e marmita são obrigatórios.");
    }
    try {
        await pool.query(
            'INSERT INTO orders (customer_name, item_id, status) VALUES (?, ?, ?)',
            [customer_name.trim(), parseInt(item_id), 'Aberto']
        );
        console.log(`✅ [ORDERS] Pedido criado: ${customer_name} → item #${item_id}`);
        res.redirect('/dashboard');
    } catch (err) {
        console.error('❌ [ORDERS] Erro ao criar pedido:', err.message);
        res.status(500).send("Erro ao registrar pedido.");
    }
});

// Rota POST /orders/:id/advance — avança o status do pedido no Kanban
app.post('/orders/:id/advance', async (req, res) => {
    const statusFlow = ['Aberto', 'Cozinha', 'Entrega', 'Entregue'];
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send("Pedido não encontrado.");
        }
        const currentIndex = statusFlow.indexOf(rows[0].status);
        if (currentIndex === -1 || currentIndex >= statusFlow.length - 1) {
            return res.status(400).send("Pedido já está no status final.");
        }
        const nextStatus = statusFlow[currentIndex + 1];
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, id]);
        console.log(`🔄 [KANBAN] Pedido #${id}: ${rows[0].status} → ${nextStatus}`);
        res.redirect('/dashboard');
    } catch (err) {
        console.error('❌ [KANBAN] Erro ao avançar status:', err.message);
        res.status(500).send("Erro ao atualizar status.");
    }
});

// Rota PUT /orders/:id/status — atualiza status livremente (drag-and-drop)
app.put('/orders/:id/status', async (req, res) => {
    const validStatuses = ['Aberto', 'Cozinha', 'Entrega', 'Entregue'];
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
    }
    try {
        const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }
        console.log(`🔄 [KANBAN-DND] Pedido #${id} → ${status}`);
        res.json({ success: true, id, status });
    } catch (err) {
        console.error('❌ [KANBAN-DND] Erro:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
});

app.get('/dashboard', async (req, res) => {
    const [items] = await pool.query('SELECT * FROM items');
    const [orders] = await pool.query(
        `SELECT orders.id, orders.customer_name, orders.status, orders.created_at,
                items.name AS item_name, items.category, items.price
         FROM orders
         JOIN items ON orders.item_id = items.id
         ORDER BY orders.created_at DESC`
    );
    res.render('dashboard', { items, orders, page: 'dashboard' });
});

app.get('/marmitas', async (req, res) => {
    const [items] = await pool.query('SELECT * FROM items ORDER BY id DESC');
    res.render('marmitas', { items, page: 'marmitas' });
});

connectWithRetry().then(() => {
    // Compartilha o pool com as rotas modulares
    app.set('pool', pool);

    // Monta rotas modulares
    app.use('/admin', exportRoutes);

    app.listen(3000, () => console.log('🚀 MARMITATECH PRO ONLINE NA PORTA 3000'));
});
