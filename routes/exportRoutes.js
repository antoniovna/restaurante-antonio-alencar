const express = require('express');
const router = express.Router();

/**
 * GET /admin/export
 * Gera e exporta um arquivo CSV com o histórico de vendas (orders + items).
 * O CSV usa separador ";" e encoding UTF-8 com BOM para compatibilidade com Excel PT-BR.
 */
router.get('/export', async (req, res) => {
    try {
        const pool = req.app.get('pool');

        const [rows] = await pool.query(
            `SELECT orders.id        AS pedido_id,
                    orders.customer_name AS cliente,
                    items.name           AS marmita,
                    items.category       AS categoria,
                    items.price          AS valor,
                    orders.status        AS status,
                    orders.created_at    AS data
             FROM orders
             JOIN items ON orders.item_id = items.id
             ORDER BY orders.created_at DESC`
        );

        // Cabeçalho CSV
        const header = ['Pedido', 'Cliente', 'Marmita', 'Categoria', 'Valor (R$)', 'Status', 'Data'];

        // Monta linhas CSV — usa ";" como separador (padrão Excel BR)
        const csvLines = rows.map(row => {
            const data = new Date(row.data);
            const dataFormatada = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
            const valor = row.valor ? Number(row.valor).toFixed(2).replace('.', ',') : '0,00';
            return [
                row.pedido_id,
                `"${(row.cliente || '').replace(/"/g, '""')}"`,
                `"${(row.marmita || '').replace(/"/g, '""')}"`,
                `"${(row.categoria || '').replace(/"/g, '""')}"`,
                valor,
                `"${row.status}"`,
                `"${dataFormatada}"`
            ].join(';');
        });

        // BOM UTF-8 para Excel reconhecer acentos corretamente
        const BOM = '\uFEFF';
        const csvContent = BOM + header.join(';') + '\n' + csvLines.join('\n') + '\n';

        // Gera nome do arquivo com data atual
        const hoje = new Date().toISOString().slice(0, 10);
        const filename = `relatorio-vendas-${hoje}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);

        console.log(`📊 [EXPORT] Relatório CSV exportado com ${rows.length} registros.`);
    } catch (err) {
        console.error('❌ [EXPORT] Erro ao exportar CSV:', err.message);
        res.status(500).send('Erro ao gerar relatório.');
    }
});

module.exports = router;
