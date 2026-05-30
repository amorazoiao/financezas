// =============================================================================
// transacoes.js — Modal de receitas/despesas, CRUD de lançamentos e reserva
// =============================================================================
// Depende de: utils.js, storage.js, recorrencias.js, dialogs.js
// =============================================================================

// ---------- Modal unificado de lançamento ----------

/** Tipo atual do modal: 'receita' | 'despesa' */
let _modalTipo = 'despesa';
/** Forma de pagamento atual: 'avista' | 'cartao' | 'recorrente' */
let _modalForma = 'avista';
/** Número de parcelas selecionado */
let _modalParcelas = 1;

/**
 * Ponto de entrada unificado — chamado pelo bottom sheet.
 * @param {'receita'|'despesa'} tipo
 */
function abrirNovoLancamento(tipo) {
  closeSheet('newSheet');
  abrirModalTransacao(tipo);
}

/**
 * Abre o modal unificado para nova transação ou receita.
 * @param {'receita'|'despesa'} tipo
 */
function abrirModalTransacao(tipo) {
  _modalTipo   = tipo;
  _modalForma  = 'avista';
  _modalParcelas = 1;

  const idInput   = document.getElementById('transacao-id');
  const dataInput = document.getElementById('transacao-data');
  const descInput = document.getElementById('transacao-desc');
  const valorInput = document.getElementById('transacao-valor');
  const catSelect  = document.getElementById('transacao-cat');
  const titulo     = document.getElementById('modal-titulo');

  if (idInput)    idInput.value   = '';
  if (dataInput)  dataInput.value = hojeLocal();
  if (descInput)  descInput.value = '';
  if (valorInput) valorInput.value = '';

  // Categorias conforme tipo
  if (catSelect) {
    catSelect.innerHTML = '';
    const cats = tipo === 'receita' ? getCategoriasReceita() : getCategoriasDespesa();
    cats.forEach(c => catSelect.add(new Option(c, c)));
  }

  if (titulo) titulo.textContent = tipo === 'receita' ? '💰 Nova Receita' : '💸 Nova Despesa';

  // Seletor de forma de pagamento: só para despesas
  const formaPagGrupo = document.getElementById('forma-pag-grupo');
  const receitaToggle = document.getElementById('receita-recorrencia-toggle');
  if (tipo === 'despesa') {
    if (formaPagGrupo) formaPagGrupo.style.display = 'block';
    if (receitaToggle) receitaToggle.style.display  = 'none';
    _aplicarFormaPagamento('avista'); // padrão: à vista
  } else {
    if (formaPagGrupo) formaPagGrupo.style.display = 'none';
    if (receitaToggle) receitaToggle.style.display  = 'flex';
    _esconderSecoesExtras();
  }

  // Resetar chips de forma de pagamento
  document.querySelectorAll('.forma-pag-chip').forEach(c => c.classList.remove('active'));
  const chipAvista = document.querySelector('.forma-pag-chip[data-forma="avista"]');
  if (chipAvista) chipAvista.classList.add('active');

  // Resetar chips de parcelas
  document.querySelectorAll('.parcela-chip').forEach(c => c.classList.remove('active'));
  const chip1x = document.querySelector('.parcela-chip[data-parc="1"]');
  if (chip1x) chip1x.classList.add('active');

  // Resetar recorrência
  _resetarPainelRecorrencia();

  // Popular cartões nos selects
  _popularSelectsCartao();

  const modal = document.getElementById('modal-transacao');
  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (valorInput && !valorInput.value) valorInput.value = '0,00';
    setupMoneyInputs();
    // Recalcula info de parcela ao digitar
    const vInput = document.getElementById('transacao-valor');
    if (vInput) {
      vInput.addEventListener('keyup', _atualizarInfoParcela);
      vInput.addEventListener('beforeinput', () => setTimeout(_atualizarInfoParcela, 10));
    }
  }, 50);
}

/**
 * Seleciona a forma de pagamento e mostra/oculta as seções correspondentes.
 * Chamado pelos chips de forma de pagamento.
 * @param {HTMLElement} chip
 */
function selecionarFormaPagamento(chip) {
  document.querySelectorAll('.forma-pag-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  _aplicarFormaPagamento(chip.dataset.forma);
}

/**
 * Aplica a lógica de exibição para cada forma de pagamento.
 * @private
 */
function _aplicarFormaPagamento(forma) {
  _modalForma = forma;
  const secCartao      = document.getElementById('secao-cartao');
  const secRecorrente  = document.getElementById('secao-recorrente');
  const btnSalvar      = document.getElementById('btn-salvar-transacao');

  secCartao?.style && (secCartao.style.display     = forma === 'cartao'     ? 'block' : 'none');
  secRecorrente?.style && (secRecorrente.style.display = forma === 'recorrente' ? 'block' : 'none');

  if (btnSalvar) {
    btnSalvar.textContent = forma === 'cartao'     ? 'Lançar no cartão' :
                            forma === 'recorrente' ? 'Criar recorrência' : 'Salvar';
  }

  // Atualizar info de parcela se cartão
  if (forma === 'cartao') _atualizarInfoParcela();
}

/** @private Oculta seções extras (para receita) */
function _esconderSecoesExtras() {
  document.getElementById('secao-cartao')?.style     && (document.getElementById('secao-cartao').style.display = 'none');
  document.getElementById('secao-recorrente')?.style && (document.getElementById('secao-recorrente').style.display = 'none');
}

/**
 * Seleciona número de parcelas no modal unificado.
 * @param {HTMLElement} chip
 */
function selecionarParcelas(chip) {
  document.querySelectorAll('.parcela-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  _modalParcelas = parseInt(chip.dataset.parc);
  _atualizarInfoParcela();
}

/** @private Calcula e exibe info da parcela */
function _atualizarInfoParcela() {
  const infoEl = document.getElementById('info-parcela');
  if (!infoEl) return;
  const valor = currencyToNumber(document.getElementById('transacao-valor')?.value || '0');
  if (valor > 0 && _modalParcelas > 1) {
    const valorParcela = (valor / _modalParcelas).toFixed(2);
    infoEl.style.display = 'block';
    infoEl.textContent = `💡 ${_modalParcelas}x de ${formatMoney(parseFloat(valorParcela))} — vencimento após fechamento`;
  } else {
    infoEl.style.display = 'none';
  }
}

/** @private Popular selects de cartão no modal unificado */
function _popularSelectsCartao() {
  ['transacao-cartao-sel', 'recorrencia-cartao'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = cartoes.length
      ? cartoes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')
      : '<option value="">Nenhum cartão cadastrado</option>';
  });
}

/**
 * Salva a transação do modal unificado roteando para a função correta.
 */
function salvarTransacaoUnificada() {
  const id = document.getElementById('transacao-id')?.value;

  // Edição: usar fluxo original
  if (id) { salvarTransacao(); return; }

  if (_modalTipo === 'receita') {
    salvarTransacao(); // receita sempre usa fluxo normal
    return;
  }

  // Despesa: rotear conforme forma
  if (_modalForma === 'cartao') {
    _salvarCompraDoModal();
  } else if (_modalForma === 'recorrente') {
    salvarTransacao(); // recorrência usa o fluxo existente
  } else {
    salvarTransacao(); // à vista
  }
}

/**
 * Salva uma compra parcelada a partir do modal unificado.
 * @private
 */
function _salvarCompraDoModal() {
  const cartaoId   = document.getElementById('transacao-cartao-sel')?.value;
  const descricao  = document.getElementById('transacao-desc')?.value.trim();
  const valorTotal = currencyToNumber(document.getElementById('transacao-valor')?.value);
  const data       = document.getElementById('transacao-data')?.value;
  const categoria  = document.getElementById('transacao-cat')?.value;

  if (!cartaoId)              { showToast('Selecione um cartão', true); return; }
  if (!descricao)             { showToast('Informe a descrição', true); return; }
  if (!valorTotal || valorTotal <= 0) { showToast('Informe o valor', true); return; }
  if (!data)                  { showToast('Informe a data', true); return; }

  const cartao = cartoes.find(c => c.id === cartaoId);
  if (!cartao) { showToast('Cartão não encontrado', true); return; }

  const parcelas    = _modalParcelas;
  const valorParcela = parseFloat((valorTotal / parcelas).toFixed(2));

  compras.push({
    id: gerarId('compra'),
    cartaoId,
    descricao,
    valorTotal,
    valorParcela,
    parcelas,
    parcelasPagas: 0,
    dataCompra: data,
    categoria: categoria || 'Outros',
  });

  invalidarCacheLancamentos();
  salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
  renderTudo();
  fecharModal('modal-transacao');
  showToast(`Compra lançada em ${parcelas}x de ${formatMoney(valorParcela)}`);
}

/**
 * Abre o modal para EDITAR uma transação existente.
 * @param {string} id
 */

/**
 * Salva a transação (nova, edição ou criação de recorrência).
 */
function salvarTransacao() {
  const id = document.getElementById('transacao-id')?.value;
  const data = document.getElementById('transacao-data')?.value;
  const descricao = document.getElementById('transacao-desc')?.value.trim();
  const categoria = document.getElementById('transacao-cat')?.value;
  const modalTitulo = document.getElementById('modal-titulo');
  const tipo = modalTitulo?.innerHTML.includes('Receita') ? 'receita' : 'despesa';
  let valor = currencyToNumber(document.getElementById('transacao-valor')?.value);

  if (!descricao || isNaN(valor) || valor <= 0) {
    showToast('Preencha os dados corretamente', true);
    return;
  }

  valor = tipo === 'receita' ? Math.abs(valor) : -Math.abs(valor);

  if (id) {
    // Edição de transação existente
    const idx = lancamentos.findIndex(l => l.id === id);
    if (idx !== -1) {
      lancamentos[idx] = { ...lancamentos[idx], data, descricao, categoria, valor };
      showToast('Transação atualizada!');
    } else {
      showToast('Erro: transação não encontrada', true);
      return;
    }
  } else if (document.getElementById('recorrencia-ativa')?.checked) {
    _salvarComoRecorrencia({ descricao, categoria, valor });
    return; // _salvarComoRecorrencia chama salvarTudo/renderTudo/fecharModal
  } else {
    // Transação avulsa
    lancamentos.push({
      id: gerarId('trans'),
      data,
      descricao,
      categoria,
      valor,
      tipo: valor > 0 ? 'receita' : 'despesa_avista',
    });
    showToast('Transação salva!');
  }

  salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
  renderTudo();
  fecharModal('modal-transacao');
}

/**
 * Abre o modal de edição de uma transação existente.
 * @param {string} id - ID da transação a ser editada.
 */
function editarTransacao(id) {
  const transacao = lancamentos.find(l => l.id === id);
  if (!transacao || transacao.tipo === 'pagamento_fatura') {
    showToast('Edição não permitida para este tipo de lançamento', true);
    return;
  }

  const idInput = document.getElementById('transacao-id');
  const dataInput = document.getElementById('transacao-data');
  const descInput = document.getElementById('transacao-desc');
  const valorInput = document.getElementById('transacao-valor');
  const catSelect = document.getElementById('transacao-cat');
  const modalTitulo = document.getElementById('modal-titulo');

  if (idInput) idInput.value = transacao.id;
  if (dataInput) dataInput.value = transacao.data;
  if (descInput) descInput.value = transacao.descricao;
  if (valorInput) valorInput.value = formatBRL(valorParaInput(Math.abs(transacao.valor)));

  if (catSelect) {
    catSelect.innerHTML = '';
    const categorias = transacao.valor > 0 ? getCategoriasReceita() : getCategoriasDespesa();
    categorias.forEach(c => catSelect.add(new Option(c, c)));
    catSelect.value = transacao.categoria;
  }

  if (modalTitulo) modalTitulo.innerHTML = transacao.valor > 0 ? '💰 Editar Receita' : '💸 Editar Despesa';

  _resetarPainelRecorrencia();

  const modal = document.getElementById('modal-transacao');
  if (modal) modal.style.display = 'flex';
}

/**
 * Exclui uma transação avulsa após confirmação do usuário.
 * @param {string} id - ID da transação a ser excluída.
 */
function excluirItem(id) {
  const transacao = lancamentos.find(l => l.id === id);
  if (!transacao) return;

  confirmar({
    icone: '🗑️',
    titulo: 'Excluir transação?',
    mensagem: `"${transacao.descricao}" — esta ação não pode ser desfeita.`,
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    lancamentos = lancamentos.filter(l => l.id !== id);
    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    renderTudo();
    showToast('Transação removida!');
  });
}

// ---------- Reserva de emergência ----------

/**
 * Renderiza a tela de reserva: totais, barra de progresso e lista de metas.
 */
function atualizarReservaDisplay() {
  const total = reservaMetas.reduce((s, m) => s + (m.atual || 0), 0);
  const meta  = reservaMetas.reduce((s, m) => s + m.valor, 0);
  const pct   = meta > 0 ? Math.min((total / meta) * 100, 100) : 0;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('total-reservado',   formatMoney(total));
  setEl('meta-total',        formatMoney(meta));
  setEl('progress-percent',  pct.toFixed(1) + '%');

  const fill = document.getElementById('progress-reserva-fill');
  if (fill) fill.style.width = pct + '%';

  const container = document.getElementById('metas-reserva-list');
  if (!container) return;

  if (reservaMetas.length === 0) {
    container.innerHTML = `
      <div class="empty-state-modern">
        <div class="icon">🎯</div>
        <div class="title">Nenhuma meta criada</div>
        <div class="subtitle">Adicione uma meta para começar a reservar</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  for (const metaObj of reservaMetas) {
    const pm  = metaObj.valor > 0 ? Math.min((metaObj.atual || 0) / metaObj.valor * 100, 100) : 0;
    const cor = pm >= 100 ? '#1D9E75' : '#72ADE7';
    container.insertAdjacentHTML('beforeend', `
      <div class="rsv-meta-card">
        <div class="rsv-meta-top">
          <div class="rsv-meta-nome">${escapeHtml(metaObj.nome)}</div>
          <div class="rsv-meta-acoes">
            <button class="rsv-meta-btn" onclick="editarMeta('${metaObj.id}')" title="Editar">✏️</button>
            <button class="rsv-meta-btn" onclick="excluirMeta('${metaObj.id}')" title="Excluir">🗑️</button>
          </div>
        </div>
        <div class="rsv-meta-valores">
          <span class="rsv-meta-atual">${formatMoney(metaObj.atual || 0)}</span>
          <span>de ${formatMoney(metaObj.valor)} • ${pm.toFixed(1)}%</span>
        </div>
        <div class="rsv-meta-barra-bg">
          <div class="rsv-meta-barra-fill" style="width:${pm}%; background:${cor};"></div>
        </div>
      </div>`);
  }
}

/**
 * Abre o modal de criação de meta de reserva.
 */
function abrirModalMeta() {
  const nomeInput = document.getElementById('meta-nome');
  const valorInput = document.getElementById('meta-valor');
  if (nomeInput) nomeInput.value = '';
  if (valorInput) valorInput.value = '';

  const modal = document.getElementById('modal-meta');
  if (modal) modal.style.display = 'flex';

  // Sincroniza _digits para evitar bug de valor anterior
  setTimeout(() => setupMoneyInputs(), 50);
}

/**
 * Salva uma nova meta de reserva.
 */
function salvarMeta() {
  const nome = document.getElementById('meta-nome')?.value.trim();
  const valor = parseFloat(document.getElementById('meta-valor')?.value);

  if (!nome || isNaN(valor) || valor <= 0) {
    showToast('Preencha os dados corretamente', true);
    return;
  }

  reservaMetas.push({
    id: gerarId('meta'),
    nome,
    valor,
    atual: 0,
  });

  salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
  atualizarReservaDisplay();
  fecharModal('modal-meta');
  showToast('Meta criada!');
}

/**
 * Edita nome e valor de uma meta existente usando o sistema de diálogos.
 * @param {string} id - ID da meta a ser editada.
 */
function editarMeta(id) {
  const meta = reservaMetas.find(m => m.id === id);
  if (!meta) return;

  perguntarForm({
    icone: '🎯',
    titulo: 'Editar meta',
    textoBotao: 'Salvar',
    campos: [
      { campo: 'nome', label: 'Nome', valorInicial: meta.nome, required: true },
      { campo: 'valor', label: 'Valor objetivo', tipo: 'money', valorInicial: meta.valor, required: true },
    ],
  }, ({ nome, valor }) => {
    const novoValor = currencyToNumber(valor);
    if (!nome.trim() || isNaN(novoValor) || novoValor <= 0) {
      showToast('Dados inválidos', true);
      return;
    }
    meta.nome = nome.trim();
    meta.valor = novoValor;
    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    atualizarReservaDisplay();
    showToast('Meta atualizada!');
  });
}

/**
 * Remove uma meta de reserva após confirmação.
 * @param {string} id - ID da meta a ser excluída.
 */
function excluirMeta(id) {
  const meta = reservaMetas.find(m => m.id === id);
  if (!meta) return;

  confirmar({
    icone: '🗑️',
    titulo: `Excluir "${meta.nome}"?`,
    mensagem: 'O saldo desta meta será perdido permanentemente.',
    textoBotao: 'Excluir',
    perigo: true,
  }, () => {
    reservaMetas = reservaMetas.filter(m => m.id !== id);
    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    atualizarReservaDisplay();
    showToast('Meta excluída!');
  });
}

/**
 * Transfere um valor da conta corrente para a reserva de emergência.
 * Distribui o valor proporcionalmente entre todas as metas.
 */
function adicionarReservaRapida() {
  const saldo = calcularSaldoReal();

  perguntarValor({
    icone: '➕',
    titulo: 'Adicionar à reserva',
    label: 'Valor a transferir',
    valorInicial: 0,
    info: `Saldo disponível: <strong>${formatMoney(saldo)}</strong>`,
    textoBotao: 'Transferir',
  }, valor => {
    if (saldo < valor) {
      showToast('Saldo insuficiente!', true);
      return;
    }

    lancamentos.push({
      id: gerarId('res'),
      data: hojeLocal(),
      descricao: 'Transferência para Reserva',
      categoria: 'Reserva',
      valor: -valor,
      tipo: 'despesa_avista',
    });

    const totalMeta = reservaMetas.reduce((s, m) => s + m.valor, 0);
    if (totalMeta > 0) {
      for (const meta of reservaMetas) {
        meta.atual = (meta.atual || 0) + (valor * (meta.valor / totalMeta));
      }
    }

    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    renderTudo();
    showToast(`✅ ${formatMoney(valor)} adicionado à reserva!`);
  });
}

/**
 * Resgata um valor da reserva e devolve para a conta corrente.
 */
function sacarReserva() {
  const totalReservado = reservaMetas.reduce((s, m) => s + (m.atual || 0), 0);
  if (totalReservado === 0) {
    showToast('Nada para sacar da reserva', true);
    return;
  }

  perguntarValor({
    icone: '➖',
    titulo: 'Sacar da reserva',
    label: 'Valor a resgatar',
    valorInicial: 0,
    info: `Reserva disponível: <strong>${formatMoney(totalReservado)}</strong>`,
    textoBotao: 'Sacar',
  }, valor => {
    if (totalReservado < valor) {
      showToast('Saldo insuficiente na reserva!', true);
      return;
    }

    lancamentos.push({
      id: gerarId('res_saq'),
      data: hojeLocal(),
      descricao: 'Resgate da Reserva',
      categoria: 'Reserva',
      valor: +valor,
      tipo: 'receita',
    });

    const totalMeta = reservaMetas.reduce((s, m) => s + m.valor, 0);
    if (totalMeta > 0) {
      for (const meta of reservaMetas) {
        meta.atual = Math.max(0, (meta.atual || 0) - (valor * (meta.valor / totalMeta)));
      }
    }

    salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
    renderTudo();
    showToast(`✅ ${formatMoney(valor)} sacado da reserva!`);
  });
}

// ---------- Helpers privados ----------

/**
 * Reseta o painel de recorrência para o estado padrão (desmarcado).
 * @private
 */
function _resetarPainelRecorrencia() {
  const recCheckbox = document.getElementById('recorrencia-ativa');
  const recConfig = document.getElementById('recorrencia-config');
  const recIcon = document.getElementById('recorrencia-icon');
  const inputDia = document.getElementById('recorrencia-dia');
  const labelDia = document.getElementById('label-dia-recorrencia');
  const formaPagamento = document.getElementById('recorrencia-forma-pagamento');
  const cartaoGroup = document.getElementById('recorrencia-cartao-group');
  const dataFim = document.getElementById('recorrencia-fim');
  const gerarHojeToggle = document.getElementById('gerar-hoje-toggle');

  if (recCheckbox) recCheckbox.checked = false;
  if (recConfig) recConfig.classList.remove('active');
  if (recIcon) recIcon.textContent = '🔄';

  // Reseta chips de frequência
  document.querySelectorAll('#frequencia-chips .recorrencia-chip').forEach(chip => chip.classList.remove('active'));
  const chipMensal = document.querySelector('#frequencia-chips .recorrencia-chip[data-freq="mensal"]');
  if (chipMensal) chipMensal.classList.add('active');

  if (inputDia) {
    inputDia.min = 1;
    inputDia.max = 31;
    inputDia.placeholder = 'Dia do vencimento';
    inputDia.value = new Date().getDate();
  }

  if (labelDia) labelDia.textContent = 'Dia do mês (1-31)';
  if (formaPagamento) formaPagamento.value = 'debito';
  if (cartaoGroup) cartaoGroup.style.display = 'none';
  if (dataFim) dataFim.value = '';
  if (gerarHojeToggle) gerarHojeToggle.style.display = 'none';
}

/**
 * Atualiza o campo de dia da recorrência conforme o chip de frequência ativo.
 * @private
 */
function _atualizarDiaRecorrencia() {
  const chipAtivo = document.querySelector('#frequencia-chips .recorrencia-chip.active');
  if (!chipAtivo) return;

  const hoje = new Date();
  const frequencia = chipAtivo.dataset.freq;
  const inputDia = document.getElementById('recorrencia-dia');
  if (!inputDia) return;

  if (frequencia === 'mensal') {
    inputDia.value = hoje.getDate();
  } else if (frequencia === 'quinzenal') {
    inputDia.value = Math.min(hoje.getDate(), 15);
  } else if (frequencia === 'semanal') {
    inputDia.value = hoje.getDay();
  }
}

/**
 * Salva a transação como recorrência, gerando a primeira ocorrência imediatamente se aplicável.
 * @param {Object} params - Parâmetros da recorrência.
 * @param {string} params.descricao - Descrição da recorrência.
 * @param {string} params.categoria - Categoria da recorrência.
 * @param {number} params.valor - Valor da recorrência (com sinal).
 * @private
 */
function _salvarComoRecorrencia({ descricao, categoria, valor }) {
  const freqBtn = document.querySelector('#frequencia-chips .recorrencia-chip.active');
  const frequencia = freqBtn ? freqBtn.dataset.freq : 'mensal';
  const hoje = new Date();
  const hojeStr = formatarDataLocal(hoje);

  // Valida e normaliza o dia conforme a frequência
  let dia = parseInt(document.getElementById('recorrencia-dia')?.value);
  if (frequencia === 'semanal') {
    dia = (!isNaN(dia) && dia >= 0 && dia <= 6) ? dia : hoje.getDay();
  } else if (frequencia === 'quinzenal') {
    dia = Math.min(!isNaN(dia) && dia >= 1 ? dia : hoje.getDate(), 15);
  } else {
    dia = Math.min(Math.max(!isNaN(dia) && dia >= 1 ? dia : hoje.getDate(), 1), 31);
  }

  const dataFim = document.getElementById('recorrencia-fim')?.value || null;
  const formaPagamento = document.getElementById('recorrencia-forma-pagamento')?.value;
  let cartaoId = null;

  if (formaPagamento === 'cartao') {
    cartaoId = document.getElementById('recorrencia-cartao')?.value;
    if (!cartaoId) {
      showToast('Selecione um cartão', true);
      return;
    }
  }

  // "Gerar hoje" está visível E marcado
  const gerarHojeEl = document.getElementById('gerar-hoje-toggle');
  const gerarPrimeiraHoje = document.getElementById('gerar-primeira-hoje');
  const gerarHoje = gerarHojeEl?.style.display === 'flex' && gerarPrimeiraHoje?.checked === true;

  const novaRec = {
    id: gerarId('rec'),
    descricao,
    categoria,
    valor,
    tipo: frequencia,
    dia,
    dataFim,
    ativo: true,
    ultimaGeracao: gerarHoje ? hojeStr : '',
    formaPagamento,
    cartaoId,
  };

  if (gerarHoje) {
    if (formaPagamento === 'cartao' && cartaoId) {
      const cartao = cartoes.find(c => c.id === cartaoId);
      if (cartao) {
        compras.push({
          id: gerarId('rec_compra'),
          dataCompra: hojeStr,
          descricao: descricao + ' (Recorrente)',
          categoria,
          valorTotal: Math.abs(valor),
          parcelas: 1,
          valorParcela: Math.abs(valor),
          cartaoId: cartao.id,
          parcelasPagas: 0,
        });
        showToast('✅ Recorrência criada! Primeira parcela lançada hoje.');
      }
    } else {
      lancamentos.push({
        id: gerarId('rec_trans'),
        data: hojeStr,
        descricao: descricao + ' (Recorrente)',
        categoria,
        valor,
        tipo: valor > 0 ? 'receita' : 'despesa_avista',
        recorrenciaId: novaRec.id,
      });
      showToast('✅ Recorrência criada e primeira entrada lançada hoje!');
    }
  } else {
    const proxima = calcularProximaDataRecorrencia(novaRec, hoje);
    const dataStr = proxima ? proxima.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : '—';
    showToast(`✅ Recorrência criada! Próxima entrada: ${dataStr}.`);
  }

  recorrencias.push(novaRec);
  salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
  renderTudo();
  fecharModal('modal-transacao');
}