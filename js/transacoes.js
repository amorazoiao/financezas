// =============================================================================
// transacoes.js — Modal de receitas/despesas, CRUD de lançamentos e reserva
// =============================================================================
// Depende de: utils.js, storage.js, recorrencias.js, dialogs.js
// =============================================================================

// ---------- Modal de transação ----------

/**
 * Abre o modal de nova receita ou despesa com campos zerados.
 * @param {'receita'|'despesa'} tipo - Tipo da transação.
 */
function abrirModalTransacao(tipo) {
  const idInput = document.getElementById('transacao-id');
  const dataInput = document.getElementById('transacao-data');
  const descInput = document.getElementById('transacao-desc');
  const valorInput = document.getElementById('transacao-valor');
  const catSelect = document.getElementById('transacao-cat');
  const modalTitulo = document.getElementById('modal-titulo');

  if (idInput) idInput.value = '';
  if (dataInput) dataInput.value = hojeLocal();
  if (descInput) descInput.value = '';
  if (valorInput) valorInput.value = '';

  // Carrega categorias conforme o tipo
  if (catSelect) {
    catSelect.innerHTML = '';
    const categorias = tipo === 'receita' ? getCategoriasReceita() : getCategoriasDespesa();
    categorias.forEach(c => catSelect.add(new Option(c, c)));
  }

  if (modalTitulo) modalTitulo.innerHTML = tipo === 'receita' ? '💰 Nova Receita' : '💸 Nova Despesa';

  // Reseta painel de recorrência
  _resetarPainelRecorrencia();

  const modal = document.getElementById('modal-transacao');
  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (valorInput && !valorInput.value) valorInput.value = '0,00';
    toggleCartaoRecorrencia(); // garante que opção cartão some em receitas
    verificarExibicaoGerarHoje();
    setupMoneyInputs();
  }, 50);
}

/**
 * Abre o modal com a opção de recorrência já ativada.
 * @param {'receita'|'despesa'} tipo - Tipo da transação.
 */
function abrirModalTransacaoComRecorrencia(tipo) {
  abrirModalTransacao(tipo);
  setTimeout(() => {
    const recCheckbox = document.getElementById('recorrencia-ativa');
    if (recCheckbox) recCheckbox.checked = true;
    toggleRecorrenciaConfig();
    toggleCartaoRecorrencia();
    _atualizarDiaRecorrencia();
    verificarExibicaoGerarHoje();
  }, 100);
}

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

  salvarTudo();
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
    salvarTudo();
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
  const meta = reservaMetas.reduce((s, m) => s + m.valor, 0);

  const totalReservadoEl = document.getElementById('total-reservado');
  const metaTotalEl = document.getElementById('meta-total');
  const progressPercentEl = document.getElementById('progress-percent');
  const progressFillEl = document.getElementById('progress-reserva-fill');

  if (totalReservadoEl) totalReservadoEl.innerHTML = formatMoney(total);
  if (metaTotalEl) metaTotalEl.innerHTML = formatMoney(meta);
  if (progressPercentEl) progressPercentEl.innerHTML = meta > 0 ? ((total / meta) * 100).toFixed(1) + '%' : '0%';
  if (progressFillEl) progressFillEl.style.width = meta > 0 ? `${Math.min((total / meta) * 100, 100)}%` : '0%';

  const container = document.getElementById('metas-reserva-list');
  if (!container) return;

  if (reservaMetas.length === 0) {
    container.innerHTML = '<div class="empty-state-modern"><div class="icon">🎯</div><div class="title">Nenhuma meta</div></div>';
    return;
  }

  container.innerHTML = '';
  for (const metaObj of reservaMetas) {
    const pm = metaObj.valor > 0 ? ((metaObj.atual || 0) / metaObj.valor * 100) : 0;
    container.innerHTML += `
      <div class="meta-item">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(metaObj.nome)}</strong>
          <div class="meta-actions">
            <button onclick="editarMeta('${metaObj.id}')" title="Editar">✏️</button>
            <button onclick="excluirMeta('${metaObj.id}')" title="Excluir" style="color:var(--danger);">🗑️</button>
          </div>
        </div>
        <div style="font-size:var(--font-base); margin-top:var(--margin-xs);">${formatMoney(metaObj.atual || 0)} de ${formatMoney(metaObj.valor)}</div>
        <div style="height:6px; background:var(--gray-200); border-radius:var(--radius-full); margin-top:var(--margin-xs);">
          <div style="width:${Math.min(pm, 100)}%; background:${pm >= 100 ? 'var(--success)' : 'var(--primary)'}; border-radius:var(--radius-full); height:100%;"></div>
        </div>
      </div>`;
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

  salvarTudo();
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
    salvarTudo();
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
    salvarTudo();
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

    salvarTudo();
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

    salvarTudo();
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
  salvarTudo();
  renderTudo();
  fecharModal('modal-transacao');
}