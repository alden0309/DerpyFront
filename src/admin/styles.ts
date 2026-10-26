// ADMIN (r26): the admin page's own styles, on top of the hub's stylesheet
// (which the page keeps: fonts, colours, dl-btn, dl-panel, dl-table,
// dl-dialog, dl-field, dl-seg). A tool, not a showcase: dense tables, plain
// labels, clear buttons. Under 640 px wide tables turn into cards.
// Injected as one <style> by Main.ts, so nothing here is in the site's CSS.

export const ADMIN_CSS = `
.adm-main.dl-main { max-width: 1380px; padding-top: 22px; }
.adm-shell { display: grid; grid-template-columns: 208px minmax(0, 1fr); gap: 26px; align-items: start; }
.adm-nav { position: sticky; top: 14px; display: flex; flex-direction: column; gap: 2px; }
.adm-who { padding: 4px 10px 14px; margin-bottom: 6px; border-bottom: 1px solid var(--line); }
.adm-who-title { font-weight: 800; font-stretch: 112%; font-size: 21px; letter-spacing: -0.01em; }
.adm-who-name { font-size: 13.5px; color: var(--text-2); margin-top: 2px; }
.adm-fresh { margin-top: 8px; }
.adm-navlink { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
  color: var(--text-2); text-decoration: none; font-weight: 600; font-size: 14.5px; }
.adm-navlink:hover { background: var(--surface); color: var(--text); }
.adm-navlink[aria-current="page"] { background: var(--surface-2); color: var(--text);
  box-shadow: inset 3px 0 0 var(--peel); }
.adm-navlink .dl-i { width: 17px; height: 17px; opacity: 0.85; }
.adm-navcount { margin-left: auto; font-size: 12px; font-weight: 700; padding: 0 6px; border-radius: 6px;
  background: rgba(245, 204, 60, 0.16); color: var(--peel); }
.adm-page { min-width: 0; }
.adm-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 10px 18px; margin-bottom: 18px; }
.adm-head h1 { font-weight: 800; font-stretch: 112%; font-size: 28px; line-height: 1.1; letter-spacing: -0.02em; }
.adm-head .adm-sub { margin-top: 4px; color: var(--text-2); font-size: 14.5px; max-width: 70ch; }
.adm-crumb { font-size: 13.5px; color: var(--text-2); margin-bottom: 6px; }
.adm-crumb a { color: var(--text-2); }
.adm-crumb a:hover { color: var(--text); }
.adm-grid { display: grid; gap: 16px; }
.adm-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: start; }
.adm-box { background: var(--surface); border: 1px solid var(--line); border-radius: 11px; padding: 14px 16px; min-width: 0; }
.adm-box > h2, .adm-h2 { font-size: 15.5px; font-weight: 720; margin: 0 0 10px; display: flex; align-items: center;
  gap: 8px; flex-wrap: wrap; }
.adm-box > h2 .adm-aside, .adm-h2 .adm-aside { margin-left: auto; font-weight: 500; font-size: 13px; color: var(--text-3); }
.adm-quiet { color: var(--text-2); font-size: 14px; }
.adm-small { font-size: 12.5px; color: var(--text-3); }
.adm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
.adm-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.adm-stat { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-width: 0; }
.adm-stat .k { display: block; font-size: 12.5px; color: var(--text-2); font-weight: 560; }
.adm-stat .v { display: block; margin-top: 2px; font-size: 21px; font-weight: 760; font-variant-numeric: tabular-nums;
  line-height: 1.2; overflow-wrap: anywhere; }
.adm-stat .v small { font-size: 12.5px; font-weight: 560; color: var(--text-2); margin-left: 5px; }
.adm-stat a { color: inherit; text-decoration: none; display: block; }
.adm-stat:has(a:hover) { border-color: var(--line-2); }
.adm-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 5px 14px; font-size: 14px; margin: 0; }
.adm-facts dt { color: var(--text-2); }
.adm-facts dd { margin: 0; overflow-wrap: anywhere; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.adm-table th { text-align: left; font-size: 12px; font-weight: 640; color: var(--text-3); padding: 6px 9px;
  border-bottom: 1px solid var(--line-2); white-space: nowrap; }
.adm-table td { padding: 6px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
.adm-table tbody tr:hover td { background: rgba(255, 255, 255, 0.025); }
.adm-table tbody tr:last-child td { border-bottom: 0; }
.adm-table .num { text-align: right; white-space: nowrap; }
.adm-table .nowrap { white-space: nowrap; }
.adm-table a { color: var(--text); font-weight: 600; text-decoration: none; }
.adm-table a:hover { text-decoration: underline; text-decoration-color: var(--peel); }
.adm-box a:not(.dl-btn) { color: var(--text); }
.adm-box .adm-aside a { color: var(--text-2); text-decoration: underline; text-underline-offset: 3px; }
.adm-box .adm-aside a:hover { color: var(--text); }
.adm-table .acts { text-align: right; white-space: nowrap; }
.adm-table .acts .dl-btn + .dl-btn { margin-left: 6px; }
.adm-tablewrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
.adm-plus { color: var(--good); }
.adm-minus { color: var(--bad); }
.adm-pill { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 6px;
  font-size: 12px; font-weight: 650; line-height: 1.5; white-space: nowrap; background: var(--surface-2);
  color: var(--text-2); vertical-align: 1px; }
.adm-pill.good { background: rgba(74, 222, 128, 0.13); color: var(--good); }
.adm-pill.bad { background: rgba(248, 113, 113, 0.14); color: var(--bad); }
.adm-pill.warn { background: rgba(245, 204, 60, 0.15); color: var(--peel); }
.adm-pill.blue { background: rgba(26, 155, 230, 0.15); color: #6cc4f5; }
.adm-pill.violet { background: rgba(167, 139, 250, 0.16); color: #c4b5fd; }
.adm-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.adm-row.end { justify-content: flex-end; }
.adm-search { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.adm-input, .adm-select, .adm-textarea { padding: 7px 10px; border: 1px solid var(--line-2); border-radius: 8px;
  background: #141417; color: var(--text); font: inherit; font-size: 14.5px; min-width: 0; }
.adm-input:focus-visible, .adm-select:focus-visible, .adm-textarea:focus-visible { outline: 2px solid var(--peel);
  outline-offset: 0; border-color: transparent; }
.adm-input.grow { flex: 1 1 220px; }
.adm-textarea { width: 100%; min-height: 64px; resize: vertical; }
.adm-form { display: grid; gap: 10px; }
.adm-form label { display: grid; gap: 4px; font-size: 13.5px; font-weight: 600; color: var(--text-2); }
.adm-form .adm-check { display: flex; align-items: center; gap: 8px; color: var(--text); font-weight: 600; }
.adm-inline { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.adm-inline > label { flex: 1 1 140px; }
.dl-btn.adm-danger { background: #dc2626; color: #fff; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25); }
.dl-btn.adm-danger:hover { background: #ef4444; }
.dl-btn.adm-danger.ghost { background: rgba(220, 38, 38, 0.12); color: #fca5a5; box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.35); }
.dl-btn.adm-danger.ghost:hover { background: rgba(220, 38, 38, 0.22); }
.dl-btn.adm-danger:disabled, .dl-btn.adm-danger.ghost:disabled { background: var(--surface-2); color: var(--text-3);
  box-shadow: none; cursor: not-allowed; }
.dl-btn.small.tiny { padding: 3px 8px; font-size: 12.5px; }
.adm-tabs.dl-seg { margin-bottom: 14px; }
.adm-pager { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 14px; color: var(--text-2); }
.adm-fold { margin-top: 12px; }
.adm-fold > summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text-2); padding: 4px 0; }
.adm-fold > summary:hover { color: var(--text); }
.adm-empty { padding: 18px 4px; color: var(--text-2); font-size: 14.5px; }
.adm-warnline { padding: 9px 12px; border-radius: 9px; background: rgba(245, 204, 60, 0.1);
  box-shadow: inset 3px 0 0 var(--peel); color: var(--cream); font-size: 14px; }
.adm-badline { padding: 9px 12px; border-radius: 9px; background: rgba(248, 113, 113, 0.1);
  box-shadow: inset 3px 0 0 var(--bad); color: #fecaca; font-size: 14px; }
.adm-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.adm-action { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: rgba(255, 255, 255, 0.015);
  display: grid; gap: 8px; align-content: start; }
.adm-action h3 { font-size: 14px; font-weight: 700; margin: 0; }
.adm-action p { font-size: 13px; color: var(--text-2); margin: 0; }
.adm-action .adm-check { font-size: 14px; font-weight: 600; }
.adm-action.danger { border-color: rgba(248, 113, 113, 0.28); }
.adm-err { color: var(--bad); font-size: 13.5px; font-weight: 600; }
.adm-json { margin: 0; font-size: 12px; color: var(--text-2); overflow-wrap: anywhere; max-width: 46ch; }
.adm-json b { color: var(--text-3); font-weight: 650; }
.adm-bar { display: flex; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; min-width: 60px; }
.adm-bar > span { display: block; background: var(--peel); }
.adm-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding: 4px 0; }
.adm-chart .col { flex: 1; display: flex; align-items: flex-end; gap: 1px; min-width: 4px; height: 100%; }
.adm-chart .col span { display: block; flex: 1; min-height: 1px; border-radius: 2px 2px 0 0; }
.adm-chart .earned { background: var(--leaf); }
.adm-chart .spent { background: var(--front); }
.adm-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--text-2); margin-top: 6px; }
.adm-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.adm-toasts { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: grid; gap: 8px;
  z-index: 100; width: min(460px, calc(100vw - 32px)); }
.adm-toast { padding: 10px 14px; border-radius: 10px; background: #26262b; border: 1px solid var(--line-2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); font-size: 14.5px; font-weight: 600; }
.adm-toast.good { box-shadow: inset 3px 0 0 var(--good), 0 10px 30px rgba(0, 0, 0, 0.5); }
.adm-toast.bad { box-shadow: inset 3px 0 0 var(--bad), 0 10px 30px rgba(0, 0, 0, 0.5); }
.adm-dialog .dl-dialog-body { gap: 12px; }
.adm-dialog p { color: var(--text-2); font-size: 14.5px; }
.adm-typed { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text);
  background: var(--surface-2); padding: 1px 6px; border-radius: 5px; }
.adm-link { color: var(--text); font-weight: 600; text-decoration: underline; text-decoration-color: var(--peel);
  text-underline-offset: 3px; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; }
.adm-copy { display: flex; gap: 8px; align-items: center; }
.adm-copy input { flex: 1; min-width: 0; }
.adm-split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.adm-news-body p + p { margin-top: 6px; }
.adm-news-body ul { padding-left: 18px; list-style: disc; }
.adm-banner-preview { border: 1px dashed var(--line-2); border-radius: 10px; overflow: hidden; }

@media (max-width: 900px) {
  .adm-split { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .adm-main.dl-main { padding-top: 12px; }
  .adm-shell { display: block; }
  .adm-nav { position: sticky; top: 0; z-index: 20; flex-direction: row; overflow-x: auto; gap: 4px;
    margin: 0 -16px 14px; padding: 8px 16px; background: rgba(19, 19, 22, 0.96); border-bottom: 1px solid var(--line);
    scrollbar-width: none; }
  .adm-nav::-webkit-scrollbar { display: none; }
  .adm-who { display: none; }
  .adm-navlink { flex: none; padding: 6px 10px; font-size: 13.5px; background: var(--surface); }
  .adm-navlink[aria-current="page"] { box-shadow: inset 0 -2px 0 var(--peel); }
  .adm-head h1 { font-size: 23px; }
  .adm-cols { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .adm-table.cards thead { display: none; }
  .adm-table.cards, .adm-table.cards tbody, .adm-table.cards tr, .adm-table.cards td { display: block; width: 100%; }
  .adm-table.cards tr { border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.015); }
  .adm-table.cards tbody tr:hover td { background: none; }
  .adm-table.cards td { border: 0; padding: 3px 0; display: flex; gap: 10px; justify-content: space-between;
    align-items: baseline; text-align: right; }
  .adm-table.cards td > .cv { min-width: 0; }
  .adm-table.cards td::before { content: attr(data-label); color: var(--text-3); font-size: 12.5px; font-weight: 600;
    text-align: left; flex: none; }
  .adm-table.cards td[data-label=""]::before { content: none; }
  .adm-table.cards td.lead { font-size: 15px; font-weight: 700; text-align: left; justify-content: flex-start; }
  .adm-table.cards td.acts { justify-content: flex-end; padding-top: 6px; }
  .adm-table.cards .num { text-align: right; }
  .adm-facts { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .adm-facts dt { margin-top: 6px; font-size: 12.5px; }
  .adm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .adm-stat .v { font-size: 18px; }
}
`;
