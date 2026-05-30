// =============================================================================
// orcamentos.js — Orçamentos mensais por categoria
// =============================================================================
// Depende de: utils.js, storage.js
// =============================================================================

/**
 * Inicializa o select de meses e renderiza os orçamentos do mês atual.
 * Chamado ao entrar na aba Orçamento.
 */
function carregarOrcamentos() {
  const select = document.getElementById('orcamento-mes-select');
  const hoje   = new Date();

  select.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const opt = document.createElement('option');
    opt.value       = `${i}-${hoje.getFullYear()}`;
    opt.textContent = `${mesesNomes[i]} ${hoje.getFullYear()}`;
    if (i === hoje.getMonth()) opt.selected = true;
    select.appendChild(opt);
  }

  renderOrcamentos();
}

/**
 * Renderiza a lista de orçamentos do mês selecionado no select,
 * com barra de progresso e alertas de estouro.
 */
/**
 * Renderiza a lista de orçamentos e o resumo no header.
 */
function renderOrcamentos() {
  const select = document.getElementById('orcamento-mes-select');
  const [mes, ano] = select.value.split('-').map(Number);
  const hoje = new Date();
  const isMesAtual = (mes === hoje.getMonth() && ano === hoje.getFullYear());

  const gastosReais   = _calcularGastosOrcamento(mes, ano);
  const orcsFiltrados = orcamentos.filter(o => o.mes === mes && o.ano === ano);
  const container     = document.getElementById('orcamentos-list');

  // ── Resumo no header ────────────────────────────────────────────
  const totalLimite  = orcsFiltrados.reduce((s, o) => s + o.limite, 0);
  const totalGasto   = orcsFiltrados.reduce((s, o) => s + (gastosReais[o.categoria] || 0), 0);
  const estourados   = orcsFiltrados.filter(o => (gastosReais[o.categoria] || 0) >= o.limite).length;
  const orcResumo    = document.getElementById('orc-resumo');
  if (orcResumo) {
    const pctTotal = totalLimite > 0 ? (totalGasto / totalLimite * 100) : 0;
    orcResumo.innerHTML = `
      <div class="orc-resumo-card">
        <div class="orc-resumo-label">Gasto</div>
        <div class="orc-resumo-valor ${pctTotal >= 90 ? 'alerta' : 'ok'}">${formatMoney(totalGasto)}</div>
      </div>
      <div class="orc-resumo-card">
        <div class="orc-resumo-label">Limite total</div>
        <div class="orc-resumo-valor">${formatMoney(totalLimite)}</div>
      </div>
      <div class="orc-resumo-card">
        <div class="orc-resumo-label">Estourados</div>
        <div class="orc-resumo-valor ${estourados > 0 ? 'alerta' : 'ok'}">${estourados} / ${orcsFiltrados.length}</div>
      </div>`;
  }

  // ── Lista vazia ─────────────────────────────────────────────────
  if (orcsFiltrados.length === 0) {
    container.innerHTML = `
      <div class="empty-state-modern">
        <div class="icon">🎯</div>
        <div class="title">Nenhum orçamento definido</div>
        <div class="subtitle">Defina limites por categoria para controlar seus gastos</div>
      </div>`;
    return;
  }

  // ── Cards de orçamento ──────────────────────────────────────────
  container.innerHTML = '';

  // Ordena: estourados primeiro, depois por % utilizado
  const ordenados = [...orcsFiltrados].sort((a, b) => {
    const pa = (gastosReais[a.categoria] || 0) / a.limite;
    const pb = (gastosReais[b.categoria] || 0) / b.limite;
    return pb - pa;
  });

  for (const o of ordenados) {
    const gasto   = gastosReais[o.categoria] || 0;
    const pct     = Math.min((gasto / o.limite) * 100, 100);
    const restante = o.limite - gasto;

    let status = 'safe';
    if (pct >= 100)     status = 'danger';
    else if (pct >= 80) status = 'warning';

    const cor = getCategoriaColor(o.categoria);

    let alertaHTML = '';
    if (isMesAtual && pct >= 100) {
      alertaHTML = `<div class="orc-item-alerta danger">🔴 Limite estourado em ${formatMoney(Math.abs(restante))}</div>`;
    } else if (isMesAtual && pct >= 80) {
      alertaHTML = `<div class="orc-item-alerta warning">⚠️ Restam ${formatMoney(restante)} (${(100-pct).toFixed(0)}%)</div>`;
    }

    container.insertAdjacentHTML('beforeend', `
      <div class="orc-item">
        <div class="orc-item-header">
          <div class="orc-item-cat">
            <div class="orc-item-dot" style="background:${cor};"></div>
            <div class="orc-item-nome">${escapeHtml(o.categoria)}</div>
          </div>
          <div class="orc-item-acoes">
            <button class="orc-item-btn" onclick="editarOrcamento('${o.id}')" aria-label="Editar">✏️</button>
            <button class="orc-item-btn" onclick="excluirOrcamento('${o.id}')" aria-label="Excluir">🗑️</button>
          </div>
        </div>
        <div class="orc-item-valores">
          <span class="orc-item-gasto">${formatMoney(gasto)}</span>
          <span class="orc-item-limite">de ${formatMoney(o.limite)}</span>
        </div>
        <div class="orc-barra-bg">
          <div class="orc-barra-fill ${status}" style="width:${pct}%;"></div>
        </div>
        <div class="orc-item-footer">
          <span class="orc-item-pct ${status}">${pct.toFixed(1)}% utilizado</span>
          ${restante > 0 ? `<span class="orc-item-restante">sobram ${formatMoney(restante)}</span>` : ''}
        </div>
        ${alertaHTML}
      </div>`);
  }
}


/**
 * Abre o modal de criação de orçamento para categorias ainda sem orçamento no mês.
 */
function abrirModalOrcamento() {
  const select = document.getElementById('orcamento-mes-select');
  const [mes, ano] = select.value.split('-').map(Number);

  // Filtra categorias que já têm orçamento neste mês
  const categoriasUsadas   = orcamentos.filter(o => o.mes === mes && o.ano === ano).map(o => o.categoria);
  const categoriasDisponiveis = getCategoriasDespesa().filter(c => !categoriasUsadas.includes(c));

  if (categoriasDisponiveis.length === 0) {
    showToast('Todas as categorias já têm orçamento!', true);
    return;
  }

  const catSelect = document.getElementById('orcamento-categoria');
  catSelect.innerHTML = '<option value="">Selecione</option>';
  categoriasDisponiveis.forEach(c => catSelect.add(new Option(c, c)));

  document.getElementById('orcamento-limite').value    = '';
  document.getElementById('orcamento-editar-id').value = '';
  document.getElementById('modal-orcamento').style.display = 'flex';

  setTimeout(() => {
    const li = document.getElementById('orcamento-limite');
    if (li && !li.value) li.value = '0,00';
    setupMoneyInputs();
  }, 50);
}

/**
 * Salva um orçamento novo ou atualiza o limite de um existente.
 */
function salvarOrcamento() {
  const select = document.getElementById('orcamento-mes-select');
  const [mes, ano] = select.value.split('-').map(Number);

  const categoria = document.getElementById('orcamento-categoria').value;
  const limite    = currencyToNumber(document.getElementById('orcamento-limite').value);
  const id        = document.getElementById('orcamento-editar-id').value;

  if (!categoria)                      { showToast('Selecione uma categoria', true); return; }
  if (isNaN(limite) || limite <= 0)    { showToast('Limite inválido', true); return; }

  if (id) {
    const idx = orcamentos.findIndex(o => o.id === id);
    if (idx !== -1) orcamentos[idx] = { ...orcamentos[idx], limite };
    showToast('Orçamento atualizado!');
  } else {
    orcamentos.push({ id: gerarId('orc'), categoria, limite, mes, ano });
    showToast('Orçamento criado!');
  }

  salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
  renderOrcamentos();
  fecharModal('modal-orcamento');
}

/**
 * Abre o modal de edição de um orçamento existente, preenchendo categoria e limite.
 * @param {string} id
 */
function editarOrcamento(id) {
  const o = orcamentos.find(o => o.id === id);
  if (!o) return;

  // Popula o select de categorias (para exibição, não para edição de categoria)
  const catSelect = document.getElementById('orcamento-categoria');
  catSelect.innerHTML = `<option value="${o.categoria}">${o.categoria}</option>`;

  document.getElementById('orcamento-limite').value    = formatBRL(valorParaInput(o.limite));
  document.getElementById('orcamento-editar-id').value = o.id;
  document.getElementById('modal-orcamento').style.display = 'flex';

  // Sincroniza _digits para evitar bug de valor anterior
  setTimeout(() => setupMoneyInputs(), 50);
}

/**
 * Remove um orçamento.
 * @param {string} id
 */
function excluirOrcamento(id) {
  const o = orcamentos.find(x => x.id === id);
  if (!o) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir orçamento de "${o.categoria}"?`,
    mensagem: 'O limite definido para esta categoria será removido.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    orcamentos = orcamentos.filter(x => x.id !== id);
    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    renderOrcamentos();
    showToast('Removido!');
  });
}

// ---------- Helper privado ----------

/**
 * Calcula o total gasto por categoria em um mês/ano,
 * somando despesas à vista e parcelas de cartão.
 * @private
 * @param {number} mes
 * @param {number} ano
 * @returns {Object.<string, number>}
 */
function _calcularGastosOrcamento(mes, ano) {
  const gastos = {};

  for (const l of lancamentos) {
    const d = parseLocalDate(l.data);
    if (l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano) {
      gastos[l.categoria] = (gastos[l.categoria] || 0) + Math.abs(l.valor);
    }
  }

  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    if (!cartao) continue;
    for (let i = 0; i < compra.parcelas; i++) {
      const venc = getDataVencimentoParcela(compra, cartao, i);
      if (venc.getMonth() === mes && venc.getFullYear() === ano && i >= compra.parcelasPagas) {
        gastos[compra.categoria] = (gastos[compra.categoria] || 0) + compra.valorParcela;
      }
    }
  }

  return gastos;
}
