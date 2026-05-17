# FinanÇezas v8.5 — Estrutura Multi-arquivo

## Estrutura de pastas

```
financezas/
├── index.html              # HTML puro: estrutura + importações
├── css/
│   └── main.css            # Todo o CSS (design tokens + componentes)
└── js/
    ├── utils.js            # Funções auxiliares (formatação, datas, DOM)
    ├── storage.js          # Estado global + persistência (localStorage)
    ├── recorrencias.js     # Lógica e renderização de recorrências
    ├── dashboard.js        # Dashboard, gráficos, métricas, histórico
    ├── cartoes.js          # Cartões, faturas, compras parceladas
    ├── transacoes.js       # Modal e CRUD de receitas/despesas
    ├── orcamentos.js       # Orçamento por categoria
    ├── configuracoes.js    # Categorias, dark mode, backup/restore
    ├── exportacoes.js      # Exportação Excel, PDF, JSON
    └── app.js              # Inicialização, navegação, event listeners
```

## Ordem de carregamento dos scripts

A ordem no `index.html` é importante por conta das dependências:

1. `utils.js` — sem dependências
2. `storage.js` — depende de `utils.js`
3. `recorrencias.js` — depende de `utils.js` e `storage.js`
4. `dashboard.js` — depende de todos os anteriores
5. `cartoes.js` — depende de `utils.js` e `storage.js`
6. `transacoes.js` — depende de todos os anteriores
7. `orcamentos.js` — depende de `utils.js` e `storage.js`
8. `configuracoes.js` — depende de todos os anteriores
9. `exportacoes.js` — depende de `utils.js` e `storage.js`
10. `app.js` — depende de tudo (inicialização)

## Próximas melhorias planejadas

### Etapa 2 — Formatação e comentários ✅ (parcial)
- `utils.js`, `storage.js` e `recorrencias.js` já estão formatados e documentados com JSDoc.
- Pendente: `dashboard.js`, `cartoes.js`, `transacoes.js`, `orcamentos.js`, `configuracoes.js`, `exportacoes.js`, `app.js`.

### Etapa 3 — Substituir prompt()/confirm() por modais próprios
Funções que ainda usam `prompt()` / `confirm()`:
- `editarRecorrencia()` — edição via 3 prompts
- `editarMeta()` — edição via 2 prompts
- `adicionarReservaRapida()` / `sacarReserva()` — valor via prompt
- `excluirItem()`, `excluirCompra()`, `excluirCartaoPorId()`, `excluirOrcamento()` — confirmação via confirm()
- `editarCategoriaPadrao()`, `editarCategoriaPersonalizada()` — edição via prompt

A estratégia recomendada é criar um sistema de modal genérico:
```js
// Exemplo de uso futuro
confirmarAcao({
  titulo: 'Excluir transação?',
  mensagem: 'Esta ação não pode ser desfeita.',
  onConfirm: () => { /* ... */ }
});
```

## Como usar

Abra `index.html` em um servidor local (não abre diretamente por `file://`
em alguns navegadores por restrições de CORS nos `<script src>`).

Opções rápidas:
```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Instale a extensão "Live Server" e clique em "Open with Live Server"
```
