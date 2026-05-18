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
function renderOrcamentos() {
  const select = document.getElementById('orcamento-mes-select');
  const [mes, ano] = select.value.split('-').map(Number);
  const hoje = new Date();
  const isMesAtual = (mes === hoje.getMonth() && ano === hoje.getFullYear());

  const gastosReais = _calcularGastosOrcamento(mes, ano);
  const orcsFiltrados = orcamentos.filter(o => o.mes === mes && o.ano === ano);
  const container = document.getElementById('orcamentos-list');

  if (orcsFiltrados.length === 0) {
    container.innerHTML = `
      <div class="empty-state-modern">
        <div class="icon">🎯</div>
        <div class="title">Nenhum orçamento definido</div>
      </div>`;
    return;
  }

  container.innerHTML = '';

  for (const o of orcsFiltrados) {
    const gasto      = gastosReais[o.categoria] || 0;
    const percentual = (gasto / o.limite) * 100;

    let statusClass = 'safe';
    if (percentual >= 100)     statusClass = 'danger';
    else if (percentual >= 80) statusClass = 'warning';

    const alertaHTML = isMesAtual && percentual >= 80
      ? `<div style="margin-top:var(--margin-sm); font-size:var(--font-sm); color:${percentual >= 100 ? 'var(--danger)' : 'var(--warning)'};">
           ⚠️ ${percentual >= 100 ? 'Limite estourado!' : `Atenção: restam ${formatMoney(o.limite - gasto)}`}
         </div>`
      : '';

    container.innerHTML += `
      <div class="orcamento-item">
        <div class="orcamento-info">
          <span><strong>${escapeHtml(o.categoria)}</strong></span>
          <span>${formatMoney(gasto)} / ${formatMoney(o.limite)}</span>
        </div>
        <div class="orcamento-bar-bg">
          <div class="orcamento-bar-fill ${statusClass}" style="width:${Math.min(percentual, 100)}%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:var(--margin-xs);">
          <span style="font-size:var(--font-sm);">${percentual.toFixed(1)}% utilizado</span>
          <div>
            <button onclick="editarOrcamento('${o.id}')" style="background:none; border:none; cursor:pointer;">✏️</button>
            <button onclick="excluirOrcamento('${o.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;">🗑️</button>
          </div>
        </div>
        ${alertaHTML}
      </div>`;
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

  salvarTudo();
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

  document.getElementById('orcamento-limite').value    = formatBRL(o.limite.toString());
  document.getElementById('orcamento-editar-id').value = o.id;
  document.getElementById('modal-orcamento').style.display = 'flex';
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
    salvarTudo();
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
