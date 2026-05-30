// =============================================================================
// exportacoes.js — Exportação de dados (Excel, PDF) e backup/restore JSON
// =============================================================================
// Depende de: utils.js, storage.js
// Libs externas: SheetJS (XLSX), jsPDF, html2canvas
// =============================================================================

// ---------- Excel ----------

/**
 * Exporta todos os lançamentos e compras para um arquivo .xlsx.
 */
function exportExcel() {
  const dados = obterTodosLancamentosParaUI().map(t => ({
    Data:       t.data,
    Descrição:  t.descricao,
    Categoria:  t.categoria,
    Valor:      t.valor,
  }));

  if (dados.length === 0) { showToast('Sem dados para exportar', true); return; }

  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Financeiro');
  XLSX.writeFile(wb, `financeiro_${hojeLocal()}.xlsx`);
  showToast('Exportado!');
}

/**
 * Exporta os lançamentos do mês atualmente selecionado no extrato para .xlsx.
 */
function exportExtrato() {
  const mes  = currentFilterMes;
  const ano  = currentFilterAno;

  const filtrados = obterTodosLancamentosParaUI()
    .filter(t => { const d = parseLocalDate(t.data); return d.getMonth() === mes && d.getFullYear() === ano; });

  if (filtrados.length === 0) { showToast('Sem dados para exportar', true); return; }

  const dados = filtrados.map(t => ({
    Data:      t.data,
    Descrição: t.descricao,
    Categoria: t.categoria,
    Valor:     t.valor,
  }));

  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
  XLSX.writeFile(wb, `extrato_${mes + 1}_${ano}.xlsx`);
  showToast('Exportado!');
}

// ---------- PDF ----------

/**
 * Gera um PDF do extrato do mês atual renderizando o elemento HTML.
 */
async function exportPDF() {
  const el = document.querySelector('#screen-extrato > div');
  if (!el) { showToast('Nada para exportar', true); return; }

  try {
    const { jsPDF } = window.jspdf;

    // Clona o elemento fora da viewport para renderização limpa
    const clone = el.cloneNode(true);
    clone.style.cssText = 'width:800px; padding:20px; background:white; position:absolute; left:-9999px;';
    document.body.appendChild(clone);

    const canvas = await html2canvas(clone, { scale: 2 });
    document.body.removeChild(clone);

    const pdf = new jsPDF();
    pdf.addImage(
      canvas.toDataURL('image/png'), 'PNG',
      10, 10, 190, (canvas.height * 190) / canvas.width
    );
    pdf.save(`extrato_${mesesNomes[currentFilterMes]}_${currentFilterAno}.pdf`);
    showToast('PDF gerado!');
  } catch (e) {
    console.error('[FinanÇezas] exportPDF:', e);
    showToast('Erro ao gerar PDF', true);
  }
}

/**
 * Gera um PDF com o resumo geral de todos os lançamentos.
 */
async function exportPDFGeral() {
  if (obterTodosLancamentosParaUI().length === 0) { showToast('Sem dados', true); return; }

  try {
    const { jsPDF } = window.jspdf;
    const todos     = obterTodosLancamentosParaUI();

    const receitas    = todos.filter(t => t.valor > 0).reduce((s, t) => s + t.valor, 0);
    const despesas    = todos.filter(t => t.valor < 0 && t.tipo !== 'compra_parcelada').reduce((s, t) => s + Math.abs(t.valor), 0);
    const comprasVal  = todos.filter(t => t.tipo === 'compra_parcelada').reduce((s, t) => s + Math.abs(t.valor), 0);

    const div = document.createElement('div');
    div.style.cssText = 'width:800px; padding:20px; background:white;';
    div.innerHTML = `
      <h2>💰 Relatório Financeiro</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="background:#f0f0f0;"><th colspan="2" style="padding:8px; text-align:left;">Resumo Geral</th></tr>
        <tr><td style="padding:8px;">💰 Receitas</td><td style="text-align:right; padding:8px;">${formatMoney(receitas)}</td></tr>
        <tr><td style="padding:8px;">💸 Despesas à vista</td><td style="text-align:right; padding:8px;">${formatMoney(despesas)}</td></tr>
        <tr><td style="padding:8px;">💳 Compras parceladas</td><td style="text-align:right; padding:8px;">${formatMoney(comprasVal)}</td></tr>
        <tr style="background:#f0f0f0; font-weight:bold;">
          <td style="padding:8px;">💰 Saldo Atual</td>
          <td style="text-align:right; padding:8px;">${formatMoney(calcularSaldoReal())}</td>
        </tr>
      </table>
      <p style="margin-top:20px; font-size:12px; color:#888;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>`;

    document.body.appendChild(div);
    const canvas = await html2canvas(div, { scale: 2 });
    document.body.removeChild(div);

    const pdf = new jsPDF();
    pdf.addImage(
      canvas.toDataURL('image/png'), 'PNG',
      10, 10, 190, (canvas.height * 190) / canvas.width
    );
    pdf.save(`relatorio_${hojeLocal()}.pdf`);
    showToast('PDF gerado!');
  } catch (e) {
    console.error('[FinanÇezas] exportPDFGeral:', e);
    showToast('Erro ao gerar PDF', true);
  }
}

// ---------- Backup e restore ----------

/**
 * Faz download de um arquivo JSON com todos os dados do aplicativo.
 */
function backup() {
  const dados = {
    version: APP_VERSION,
    lancamentos,
    compras,
    recorrencias,
    cartoes,
    reservaMetas,
    categoriasPersonalizadas,
    orcamentos,
  };

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `backup_${hojeLocal()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Backup gerado!');
}

/**
 * Permite ao usuário selecionar um arquivo JSON de backup e restaurar os dados.
 * Sobrescreve todos os dados atuais após validação mínima.
 */
function restore() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json';

  input.onchange = e => {
    const file   = e.target.files[0];
    const reader = new FileReader();

    reader.onload = ev => {
      try {
        const dados = JSON.parse(ev.target.result);

        // Validação mínima: precisa ter pelo menos lancamentos e compras
        if (!dados.lancamentos || !dados.compras) {
          showToast('Arquivo inválido', true);
          return;
        }

        lancamentos              = dados.lancamentos              || [];
        compras                  = dados.compras                  || [];
        recorrencias             = dados.recorrencias             || [];
        cartoes                  = dados.cartoes                  || [];
        reservaMetas             = dados.reservaMetas             || [];
        categoriasPersonalizadas = dados.categoriasPersonalizadas || [];
        orcamentos               = dados.orcamentos               || [];

        salvarTudo().catch(e => console.error("[Storage] Falha ao salvar:", e));
        renderTudo();
        showToast('Restaurado com sucesso!');
      } catch (err) {
        console.error('[FinanÇezas] restore:', err);
        showToast('Erro ao restaurar', true);
      }
    };

    reader.readAsText(file);
  };

  input.click();
}
