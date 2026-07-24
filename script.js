/* Configurazione rapida dell'intestazione dell'applicazione. */
const APP_TITLE = 'DIP. DI GIUSTIZIA — LOS SANTOS';
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const state = { crimes: [], selected: new Set(), activeCrime: null };

const $ = (selector) => document.querySelector(selector);
const refs = { body: $('#crimeTableBody'), search: $('#searchInput'), category: $('#categoryFilter'), selectedOnly: $('#selectedOnly'), selectAll: $('#selectAll'), selectVisible: $('#selectVisible'), count: $('#countText'), table: $('#tableWrap'), loading: $('#loadingState'), empty: $('#emptyState'), copy: $('#copyButton'), modal: $('#detailModal'), toast: $('#toast') };
document.title = APP_TITLE + ' | Codice Penale';
$('#appTitle').textContent = APP_TITLE;

/** Interpreta intervalli testuali senza modificare il valore originale mostrato a schermo. */
function parsePenalty(value, type) {
  const text = String(value || '').trim();
  if (type === 'months' && text === '-') return { min: 0, max: 0, kind: 'zero' };
  if (/ergastolo/i.test(text)) return { kind: 'life' };
  if (/stimata dal giudice|vedi nota/i.test(text)) return { kind: 'discretion' };
  // Rimuove separatori delle migliaia e trova uno o due numeri presenti nella descrizione.
  const numbers = [...text.matchAll(/\d{1,3}(?:[.\s]\d{3})*|\d+/g)].map((m) => Number(m[0].replace(/[.\s]/g, ''))).filter(Number.isFinite);
  if (!numbers.length) return { kind: 'discretion' };
  return { min: numbers[0], max: numbers[1] ?? numbers[0], kind: 'numeric' };
}

function getFilteredCrimes() {
  const query = refs.search.value.trim().toLocaleLowerCase('it');
  return state.crimes.filter((crime) => {
    const matchesSearch = !query || crime.nome.toLocaleLowerCase('it').includes(query) || crime.articolo.toLocaleLowerCase('it').includes(query);
    return matchesSearch && (!refs.category.value || crime.categoria === refs.category.value) && (!refs.selectedOnly.checked || state.selected.has(crime.id));
  });
}

function procedureBadge(procedure) {
  const lower = procedure.toLowerCase();
  const className = lower.includes('arresto') ? 'arrest' : lower.includes('sanzione amministrativa') ? 'sanction' : lower.includes('richiesta processo') ? 'process' : 'discretion';
  return `<span class="badge ${className}">${escapeHtml(procedure)}</span>`;
}
function penaltyBadges(value, type) {
  const penalty = parsePenalty(value, type);
  if (penalty.kind === 'discretion') return '<span class="badge discretion">A discrezione del giudice</span>';
  if (penalty.kind === 'life') return '<span class="badge process">Ergastolo</span>';
  return '';
}
function escapeHtml(value) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }

function renderTable() {
  const crimes = getFilteredCrimes();
  const selectedCount = state.selected.size;
  refs.count.textContent = `${crimes.length} reati trovati / ${selectedCount} selezionati`;
  refs.body.innerHTML = crimes.map((crime) => `<tr class="${state.selected.has(crime.id) ? 'is-selected' : ''}">
    <td data-label="Selezione"><input class="crime-check" data-id="${crime.id}" type="checkbox" ${state.selected.has(crime.id) ? 'checked' : ''} aria-label="Seleziona ${escapeHtml(crime.nome)}"></td>
    <td data-label="Articolo" class="article">${escapeHtml(crime.articolo)}${crime.richiestaProcesso ? '<br><span class="badge process">Processo</span>' : ''}</td>
    <td data-label="Nome reato"><button class="crime-name" data-detail="${crime.id}" type="button">${escapeHtml(crime.nome)}</button></td>
    <td data-label="Categoria" class="category">${escapeHtml(crime.categoria)}</td>
    <td data-label="Fattura" class="value">${escapeHtml(crime.fattura)} ${penaltyBadges(crime.fattura, 'fine')}</td>
    <td data-label="Mesi di carcere" class="value">${escapeHtml(crime.mesi)} ${penaltyBadges(crime.mesi, 'months')}</td>
    <td data-label="Procedura">${procedureBadge(crime.procedura)}</td></tr>`).join('');
  refs.empty.hidden = crimes.length !== 0; refs.table.hidden = crimes.length === 0;
  refs.selectAll.checked = crimes.length > 0 && crimes.every((crime) => state.selected.has(crime.id));
  refs.selectAll.indeterminate = crimes.some((crime) => state.selected.has(crime.id)) && !refs.selectAll.checked;
}

function updateSummary() {
  const selected = state.crimes.filter((crime) => state.selected.has(crime.id));
  const totals = { fineMin: 0, fineMax: 0, monthsMin: 0, monthsMax: 0, discretionaryFine: false, discretionaryMonths: false, life: false };
  selected.forEach((crime) => {
    const fine = parsePenalty(crime.fattura, 'fine'); const months = parsePenalty(crime.mesi, 'months');
    if (fine.kind === 'numeric') { totals.fineMin += fine.min; totals.fineMax += fine.max; } else if (fine.kind === 'discretion') totals.discretionaryFine = true;
    if (months.kind === 'numeric' || months.kind === 'zero') { totals.monthsMin += months.min; totals.monthsMax += months.max; } else if (months.kind === 'life') totals.life = true; else totals.discretionaryMonths = true;
  });
  const noSelection = selected.length === 0;
  $('#fineMin').textContent = noSelection ? 'Nessun valore' : currency.format(totals.fineMin);
  $('#fineMax').textContent = noSelection ? 'Nessun valore' : currency.format(totals.fineMax);
  $('#monthsMin').textContent = noSelection ? 'Nessun valore' : `${totals.monthsMin} mesi`;
  $('#monthsMax').textContent = noSelection ? 'Nessun valore' : totals.life ? 'Ergastolo' : `${totals.monthsMax} mesi`;
  $('#fineMinNote').textContent = !noSelection && totals.discretionaryFine ? '+ elementi a discrezione del giudice' : '';
  $('#fineMaxNote').textContent = !noSelection && totals.discretionaryFine ? '+ elementi a discrezione del giudice' : '';
  $('#monthsMinNote').textContent = !noSelection && totals.discretionaryMonths ? '+ elementi a discrezione del giudice' : '';
  $('#monthsMaxNote').textContent = !noSelection && totals.life ? '+ pena fino all’ergastolo' : !noSelection && totals.discretionaryMonths ? '+ elementi a discrezione del giudice' : '';
  refs.copy.disabled = noSelection;
}

function selectCrime(id, checked) { checked ? state.selected.add(id) : state.selected.delete(id); renderTable(); updateSummary(); }
function openModal(id) { state.activeCrime = state.crimes.find((crime) => crime.id === id); const crime = state.activeCrime; $('#modalArticle').textContent = crime.articolo; $('#modalTitle').textContent = crime.nome; $('#modalContent').innerHTML = [['Categoria', crime.categoria], ['Fattura', crime.fattura], ['Mesi di carcere', crime.mesi], ['Procedura', crime.procedura], ['Richiesta processo', crime.richiestaProcesso ? 'Sì — processo richiesto' : 'No']].map(([label, value], index) => `<div class="detail-item ${index === 3 ? 'full' : ''}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join(''); $('#modalSelectButton').textContent = state.selected.has(crime.id) ? 'Rimuovi selezione' : 'Seleziona reato'; refs.modal.showModal(); }
function toast(message) { refs.toast.textContent = message; refs.toast.classList.add('show'); setTimeout(() => refs.toast.classList.remove('show'), 2600); }

function buildReport() {
  const selected = state.crimes.filter((crime) => state.selected.has(crime.id));
  const lines = [`VERBALE — ${APP_TITLE}`, `Data: ${new Date().toLocaleDateString('it-IT')}`, '', 'CAPI D’ACCUSA:'];
  selected.forEach((crime, index) => lines.push(`${index + 1}. ${crime.articolo} — ${crime.nome}\n   Fattura: ${crime.fattura}\n   Pena detentiva: ${crime.mesi}\n   Procedura: ${crime.procedura}${crime.richiestaProcesso ? '\n   Processo: richiesto' : ''}`));
  lines.push('', 'TOTALI:', `Fattura minima: ${$('#fineMin').textContent}${$('#fineMinNote').textContent ? ' ' + $('#fineMinNote').textContent : ''}`, `Fattura massima: ${$('#fineMax').textContent}${$('#fineMaxNote').textContent ? ' ' + $('#fineMaxNote').textContent : ''}`, `Mesi minimi: ${$('#monthsMin').textContent}${$('#monthsMinNote').textContent ? ' ' + $('#monthsMinNote').textContent : ''}`, `Mesi massimi: ${$('#monthsMax').textContent}${$('#monthsMaxNote').textContent ? ' ' + $('#monthsMaxNote').textContent : ''}`);
  return lines.join('\n');
}

refs.body.addEventListener('change', (event) => { if (event.target.matches('.crime-check')) selectCrime(Number(event.target.dataset.id), event.target.checked); });
refs.body.addEventListener('click', (event) => { const button = event.target.closest('[data-detail]'); if (button) openModal(Number(button.dataset.detail)); });
[refs.search, refs.category, refs.selectedOnly].forEach((el) => el.addEventListener(el === refs.search ? 'input' : 'change', renderTable));
refs.selectAll.addEventListener('change', () => { getFilteredCrimes().forEach((crime) => refs.selectAll.checked ? state.selected.add(crime.id) : state.selected.delete(crime.id)); renderTable(); updateSummary(); });
refs.selectVisible.addEventListener('click', () => { getFilteredCrimes().forEach((crime) => state.selected.add(crime.id)); renderTable(); updateSummary(); });
$('#resetButton').addEventListener('click', () => { state.selected.clear(); refs.selectedOnly.checked = false; renderTable(); updateSummary(); toast('Campi azzerati.'); });
$('#closeModal').addEventListener('click', () => refs.modal.close());
refs.modal.addEventListener('click', (event) => { if (event.target === refs.modal) refs.modal.close(); });
$('#modalSelectButton').addEventListener('click', () => { const id = state.activeCrime.id; selectCrime(id, !state.selected.has(id)); $('#modalSelectButton').textContent = state.selected.has(id) ? 'Rimuovi selezione' : 'Seleziona reato'; });
refs.copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(buildReport()); toast('Verbale copiato negli appunti.'); } catch { toast('Copia non disponibile: seleziona e copia il testo dal browser.'); } });

fetch('reati.json').then((response) => { if (!response.ok) throw new Error('Impossibile caricare reati.json'); return response.json(); }).then((crimes) => { state.crimes = crimes; [...new Set(crimes.map((crime) => crime.categoria))].sort().forEach((category) => refs.category.add(new Option(category, category))); refs.loading.hidden = true; refs.table.hidden = false; renderTable(); updateSummary(); }).catch(() => { refs.loading.textContent = 'Impossibile caricare l’archivio. Avvia il progetto con un piccolo server locale e riprova.'; });
