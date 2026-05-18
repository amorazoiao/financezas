// =============================================================================
// configuracoes.js — Configurações, categorias, tema e backup/restore
// =============================================================================
// Depende de: utils.js, storage.js
// =============================================================================

// ---------- Modal de configurações ----------

/**
 * Abre o modal de configurações e inicializa a aba de categorias.
 */
function openSettings() {
  categoriaSearchTerm = '';
  const si = document.getElementById('categorias-search');
  if (si) si.value = '';

  renderCategoriasManager();
  document.getElementById('modal-config').style.display = 'flex';
}

/**
 * Alterna entre as abas de configuração (Categorias, Dados, Sobre).
 * @param {'categorias'|'dados'|'sobre'} nomeDaAba
 */
function switchConfigTab(nomeDaAba) {
  document.querySelectorAll('.config-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.config-content').forEach(c => {
    c.classList.remove('active');
    c.style.display = 'none';
  });

  const tabBtn = document.querySelector(`.config-tab[onclick*="${nomeDaAba}"]`);
  if (tabBtn) tabBtn.classList.add('active');

  const tabContent = document.getElementById(`config-tab-${nomeDaAba}`);
  if (tabContent) { tabContent.classList.add('active'); tabContent.style.display = 'block'; }
}

// ---------- Gerenciador de categorias ----------

/**
 * Exibe ou oculta o formulário de nova categoria.
 */
function toggleAddCategoriaForm() {
  const form  = document.getElementById('add-categoria-form');
  const botao = document.getElementById('btn-add-categoria');

  if (form.classList.contains('show')) {
    form.classList.remove('show');
    botao.style.display = 'flex';
    document.getElementById('nova-categoria-nome').value = '';
  } else {
    form.classList.add('show');
    botao.style.display = 'none';
    setTimeout(() => document.getElementById('nova-categoria-nome').focus(), 300);
  }
}

/**
 * Atualiza o termo de busca e re-renderiza a lista de categorias.
 */
function filtrarCategorias() {
  categoriaSearchTerm = document.getElementById('categorias-search').value.toLowerCase().trim();
  renderCategoriasManager();
}

/**
 * Renderiza a lista completa de categorias (padrão + personalizadas)
 * de receitas e despesas, com filtro de busca aplicado.
 */
function renderCategoriasManager() {
  const listaReceitas = document.getElementById('categorias-receitas-list');
  const listaDespesas = document.getElementById('categorias-despesas-list');

  if (listaReceitas) {
    listaReceitas.innerHTML = '';
    let count = 0;

    for (const cat of categoriasReceitaPadrao) {
      if (categoriaSearchTerm && !cat.toLowerCase().includes(categoriaSearchTerm)) continue;
      listaReceitas.innerHTML += _renderItemCategoria(cat, 'receita', 'padrao');
      count++;
    }
    for (const cat of categoriasPersonalizadas.filter(c => c.tipo === 'receita')) {
      if (categoriaSearchTerm && !cat.nome.toLowerCase().includes(categoriaSearchTerm)) continue;
      listaReceitas.innerHTML += _renderItemCategoriaPersonalizada(cat);
      count++;
    }

    document.getElementById('count-receitas').textContent = count;
  }

  if (listaDespesas) {
    listaDespesas.innerHTML = '';
    let count = 0;

    for (const cat of categoriasDespesaPadrao) {
      if (categoriaSearchTerm && !cat.toLowerCase().includes(categoriaSearchTerm)) continue;
      listaDespesas.innerHTML += _renderItemCategoria(cat, 'despesa', 'padrao');
      count++;
    }
    for (const cat of categoriasPersonalizadas.filter(c => c.tipo === 'despesa')) {
      if (categoriaSearchTerm && !cat.nome.toLowerCase().includes(categoriaSearchTerm)) continue;
      listaDespesas.innerHTML += _renderItemCategoriaPersonalizada(cat);
      count++;
    }

    document.getElementById('count-despesas').textContent = count;
  }
}

/** @private Gera HTML de um item de categoria padrão. */
function _renderItemCategoria(nome, tipo, badge) {
  const isOutros  = nome === 'Outros';
  const botaoExcluir = isOutros
    ? ''
    : `<button class="categoria-btn delete" onclick="removerCategoriaPadrao('${tipo}','${escapeHtml(nome)}')">🗑️</button>`;

  return `
    <div class="categoria-item">
      <div class="categoria-dot ${tipo}"></div>
      <div class="categoria-info">
        <div class="categoria-nome">${escapeHtml(nome)}</div>
        <span class="categoria-badge ${badge}">Padrão</span>
      </div>
      <div class="categoria-actions">
        <button class="categoria-btn edit" onclick="editarCategoriaPadrao('${tipo}','${escapeHtml(nome)}')">✏️</button>
        ${botaoExcluir}
      </div>
    </div>`;
}

/** @private Gera HTML de um item de categoria personalizada. */
function _renderItemCategoriaPersonalizada(cat) {
  return `
    <div class="categoria-item custom">
      <div class="categoria-dot custom"></div>
      <div class="categoria-info">
        <div class="categoria-nome">${escapeHtml(cat.nome)}</div>
        <span class="categoria-badge custom">Personalizada</span>
      </div>
      <div class="categoria-actions">
        <button class="categoria-btn edit"   onclick="editarCategoriaPersonalizada('${cat.id}')">✏️</button>
        <button class="categoria-btn delete" onclick="removerCategoriaPersonalizada('${cat.id}')">🗑️</button>
      </div>
    </div>`;
}

// ---------- CRUD de categorias ----------

/**
 * Abre um dialog (confirmar/perguntarTexto) com o modal de config fechado,
 * para evitar conflito entre os dois overlays.
 * Reabre o modal de config se o usuário cancelar.
 * @private
 * @param {Function} abrirDialog  — função que abre o dialog (ex: () => confirmar(...))
 */
function _dialogComConfigFechado(abrirDialog) {
  fecharModal('modal-config');
  setTimeout(abrirDialog, 150);
}

/**
 * Edita o nome de uma categoria padrão.
 * Atualiza todos os lançamentos e compras que usavam o nome antigo.
 * @param {'receita'|'despesa'} tipo
 * @param {string} nomeAtual
 */
function editarCategoriaPadrao(tipo, nomeAtual) {
  _dialogComConfigFechado(() => perguntarTexto({
    icone: '✏️',
    titulo: `Renomear "${nomeAtual}"`,
    label: 'Novo nome',
    valorInicial: nomeAtual,
    textoBotao: 'Renomear',
  }, novoNome => {
    if (novoNome === nomeAtual) return;
    const todas = [
      ...categoriasReceitaPadrao,
      ...categoriasDespesaPadrao,
      ...categoriasPersonalizadas.map(c => c.nome),
    ];
    if (todas.includes(novoNome)) { showToast('Já existe!', true); return; }
    if (tipo === 'receita') {
      const i = categoriasReceitaPadrao.indexOf(nomeAtual);
      if (i !== -1) categoriasReceitaPadrao[i] = novoNome;
    } else {
      const i = categoriasDespesaPadrao.indexOf(nomeAtual);
      if (i !== -1) categoriasDespesaPadrao[i] = novoNome;
    }
    _renomearCategoriaEmDados(nomeAtual, novoNome);
    showToast('Atualizada!');
  }));
}

/**
 * Remove uma categoria padrão (exceto 'Outros').
 * Lançamentos nessa categoria são migrados para 'Outros'.
 * @param {'receita'|'despesa'} tipo
 * @param {string} nome
 */
function removerCategoriaPadrao(tipo, nome) {
  if (nome === 'Outros') { showToast("'Outros' não pode ser removida", true); return; }
  _dialogComConfigFechado(() => confirmar({
    icone: '🗑️',
    titulo: `Remover "${nome}"?`,
    mensagem: 'Os lançamentos desta categoria serão movidos para "Outros".',
    textoBotao: 'Remover',
    perigo: true,
  }, () => {
    _migrarCategoriaParaOutros(nome);
    if (tipo === 'receita') categoriasReceitaPadrao = categoriasReceitaPadrao.filter(c => c !== nome);
    else                    categoriasDespesaPadrao  = categoriasDespesaPadrao.filter(c => c !== nome);
    _atualizarAposAlterarCategoria();
    showToast('Removida!');
  }));
}

/**
 * Adiciona uma nova categoria personalizada.
 */
function adicionarCategoria() {
  const nome = document.getElementById('nova-categoria-nome').value.trim();
  const tipo = document.getElementById('nova-categoria-tipo').value;

  if (!nome) { showToast('Digite um nome', true); return; }

  const todas = [
    ...categoriasReceitaPadrao,
    ...categoriasDespesaPadrao,
    ...categoriasPersonalizadas.map(c => c.nome),
  ];
  if (todas.includes(nome)) { showToast('Já existe!', true); return; }

  categoriasPersonalizadas.push({ id: gerarId('cat'), nome, tipo });
  document.getElementById('nova-categoria-nome').value = '';

  _atualizarAposAlterarCategoria();
  document.getElementById('add-categoria-form').classList.remove('show');
  document.getElementById('btn-add-categoria').style.display = 'flex';
  showToast(`"${nome}" adicionada!`);
}

/**
 * Edita o nome de uma categoria personalizada.
 * @param {string} id
 */
function editarCategoriaPersonalizada(id) {
  const c = categoriasPersonalizadas.find(x => x.id === id);
  if (!c) return;

  _dialogComConfigFechado(() => perguntarTexto({
    icone: '✏️',
    titulo: `Renomear "${c.nome}"`,
    label: 'Novo nome',
    valorInicial: c.nome,
    textoBotao: 'Renomear',
  }, novoNome => {
    const todas = [
      ...categoriasReceitaPadrao,
      ...categoriasDespesaPadrao,
      ...categoriasPersonalizadas.filter(x => x.id !== id).map(x => x.nome),
    ];
    if (todas.includes(novoNome)) { showToast('Já existe!', true); return; }
    const nomeAntigo = c.nome;
    c.nome = novoNome;
    _renomearCategoriaEmDados(nomeAntigo, c.nome);
    showToast('Atualizada!');
  }));
}

/**
 * Remove uma categoria personalizada.
 * @param {string} id
 */
function removerCategoriaPersonalizada(id) {
  const c = categoriasPersonalizadas.find(x => x.id === id);
  if (!c) return;

  _dialogComConfigFechado(() => confirmar({
    icone: '🗑️',
    titulo: `Remover "${c.nome}"?`,
    mensagem: 'Os lançamentos desta categoria serão movidos para "Outros".',
    textoBotao: 'Remover',
    perigo: true,
  }, () => {
    _migrarCategoriaParaOutros(c.nome);
    categoriasPersonalizadas = categoriasPersonalizadas.filter(x => x.id !== id);
    _atualizarAposAlterarCategoria();
    showToast('Removida!');
  }));
}

// ---------- Selects de categoria ----------

/**
 * Atualiza todos os selects de categoria na UI após qualquer alteração.
 */
function atualizarSelectCategorias() {
  const receitas = getCategoriasReceita();
  const despesas = getCategoriasDespesa();

  // Select do modal de transação
  const tc = document.getElementById('transacao-cat');
  if (tc) {
    const isTipoReceita = document.getElementById('modal-titulo')?.innerHTML.includes('Receita');
    const cats = isTipoReceita ? receitas : despesas;
    tc.innerHTML = '';
    cats.forEach(c => tc.add(new Option(c, c)));
  }

  // Filtro de categorias no dashboard
  const fc = document.getElementById('filter-cat');
  if (fc) {
    fc.innerHTML = '<option value="all">📁 Todas</option>';
    [...receitas, ...despesas, 'Pagamento Fatura', 'Reserva']
      .forEach(c => fc.add(new Option(c, c)));
  }

  // Select de categoria no modal de compra
  const cc = document.getElementById('compra-categoria');
  if (cc) {
    cc.innerHTML = '<option value="">Selecione</option>';
    despesas.forEach(c => cc.add(new Option(c, c)));
  }
}

/** @alias atualizarSelectCategorias — Atalho chamado na inicialização. */
function initFilter() {
  atualizarSelectCategorias();
}

// ---------- Tema ----------

/**
 * Alterna entre modo claro e escuro, persistindo a preferência.
 */
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  localStorage.setItem('dark_mode_finance', document.body.classList.contains('dark'));
}

// Aplica dark mode salvo antes de renderizar a página
(function aplicarTemaInicial() {
  if (localStorage.getItem('dark_mode_finance') === 'true') {
    document.body.classList.add('dark');
  }
})();

// ---------- Resetar dados ----------

/**
 * Apaga todos os dados do aplicativo após confirmação.
 */
function resetAll() {
  // Fecha o modal de config primeiro para evitar conflito com o overlay do dialog
  fecharModal('modal-config');

  setTimeout(() => {
    confirmar({
      icone: '☠️',
      titulo: 'Resetar TODOS os dados?',
      mensagem: 'Lançamentos, cartões, metas e recorrências serão apagados permanentemente. Esta ação é irreversível.',
      textoBotao: 'Sim, apagar tudo',
      perigo: true,
    }, () => {
      lancamentos = [];
      compras = [];
      recorrencias = [];
      cartoes = [];
      reservaMetas = [];
      categoriasPersonalizadas = [];
      orcamentos = [];
      salvarTudo();
      renderTudo();
      showToast('Dados resetados!');
    });
  }, 150); // aguarda o modal-config fechar antes de abrir o dialog
}

// ---------- Helpers privados ----------

/**
 * Renomeia uma categoria em todos os lançamentos e compras.
 * @private
 */
function _renomearCategoriaEmDados(nomeAntigo, nomeNovo) {
  for (const l of lancamentos)  if (l.categoria === nomeAntigo) l.categoria = nomeNovo;
  for (const c of compras)      if (c.categoria === nomeAntigo) c.categoria = nomeNovo;
  salvarTudo();
  renderCategoriasManager();
  atualizarSelectCategorias();
  renderTudo();
}

/**
 * Move todos os lançamentos e compras de uma categoria para 'Outros'.
 * @private
 */
function _migrarCategoriaParaOutros(nome) {
  for (const l of lancamentos) if (l.categoria === nome) l.categoria = 'Outros';
  for (const c of compras)     if (c.categoria === nome) c.categoria = 'Outros';
}

/**
 * Salva, atualiza UI e re-renderiza após qualquer alteração de categoria.
 * @private
 */
function _atualizarAposAlterarCategoria() {
  salvarTudo();
  renderCategoriasManager();
  atualizarSelectCategorias();
  renderTudo();
}
