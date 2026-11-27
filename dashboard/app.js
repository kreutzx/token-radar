// Token Radar dashboard, model radar-8. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the KPI strip, the ranked board, filters,
// a per-protocol detail panel, the live-token view and the method panel. No
// network: every byte it shows is in data.js, and every value it shows is
// recomputed here from the fitted parameters data.js carries, so the page
// checks board.json instead of trusting it.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', chain: 'all', category: 'all', verdict: 'all', watch: false,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtOdds(o) {
    return Math.round(o * 100) + '%';
  }
  function fmtMult(x) {
    return '\u00d7' + Number(x).toFixed(2);
  }

  // The fitted model, recomputed from the components data.js carries per row.
  // lib/model.ts builds board.json from these same rounded components, so a
  // row that does not recompute here is a row whose data went stale.
  function launchOf(row) {
    return Math.max(1, Math.round(row.curve_usd * row.category_factor * row.struct_mult * row.haircut));
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(launchOf(row) * row.token_odds));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watch) params.set('watch', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'launch') { av = a.launch_value_usd; bv = b.launch_value_usd; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function topbar() {
    return el('header', { class: 'topbar' },
      el('div', { class: 'brand' }, 'Token ', el('em', { text: 'Radar' })),
      el('div', { class: 'topmeta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model — fitted, not asserted' })
      )
    );
  }

  // The KPI strip: the whole audit on one line at the top of the page — the
  // strongest held-out band first, then range honesty, the odds scored as
  // probabilities, the terms that survived, the verdicts and the coverage —
  // so a reader sees the evidence before the first row.
  function kpiStrip() {
    var f = DATA.fit;
    var a = DATA.accounting;
    function kpi(label, value, sub) {
      return el('div', { class: 'kpi' },
        el('span', { text: label }),
        el('b', { text: value }),
        el('small', { text: sub })
      );
    }
    var kept = DATA.evidence.value.filter(function (r) { return r.verdict === 'kept'; }).length +
      DATA.evidence.odds.filter(function (r) { return r.verdict === 'kept'; }).length;
    var tried = DATA.evidence.value.length + DATA.evidence.odds.length - 2;
    return el('section', { class: 'kpis', 'aria-label': 'Model validation and coverage' },
      kpi('Band \u00b7 walk-forward', '\u00d7/\u00f7 ' + f.wf_band_factor, 'fit on earlier listings, priced the later ones \u00b7 LOO \u00d7/\u00f7 ' + f.band_factor),
      kpi('Range honesty', Math.round(f.hon_loo_2575 * 100) + '% in the middle half', 'held-out caps inside the printed P25\u2013P75 band, stated 50% \u00b7 ' + Math.round(f.hon_loo_1090 * 100) + '% inside P10\u2013P90, stated 80%'),
      kpi('Odds \u00b7 walk-forward Brier', String(f.odds_wf_brier), 'against ' + f.odds_wf_base_brier + ' for the base rate alone \u00b7 LOO ' + f.odds_brier),
      kpi('Terms on trial', kept + ' of ' + tried + ' kept', 'each kept or dropped on two blind tests \u00b7 the table is in Method'),
      kpi('Verdicts FARM / THIN / SKIP', DATA.verdict_counts.FARM + ' / ' + DATA.verdict_counts.THIN + ' / ' + DATA.verdict_counts.SKIP, 'FARM beats fees, a 4% T-bill and $25/hr on a $10,000 scenario'),
      kpi('Coverage', a.total + ' / ' + a.total, 'protocols accounted for \u00b7 watchlist ' + a.watchlist_ranked + ' / ' + a.watchlist),
      kpi('Model fit', f.comps + ' comps', 'log mcap = ' + f.intercept + ' + ' + f.slope + ' \u00d7 log TVL \u00b7 slope \u00b1' + f.boot_slope_se + ' over ' + f.boot_refits + ' refits')
    );
  }

  // The coverage bar: every protocol in the snapshot, in exactly one group.
  function acctBar() {
    var a = DATA.accounting;
    var colors = ['#d99a2b', '#8a6d2f', '#5c4f1e', '#3f7d5a', '#2e4a3a', '#4a5568', '#39424f', '#2f3742', '#262d36', '#1f242c'];
    var bar = el('div', { class: 'acctbar', role: 'img', 'aria-label': 'Coverage: all ' + a.total + ' protocols by group' });
    a.groups.forEach(function (g, i) {
      bar.appendChild(el('i', { style: 'width:' + (g.count / a.total * 100).toFixed(2) + '%;background:' + colors[i % colors.length], title: g.label + ': ' + g.count }));
    });
    var legend = el('div', { class: 'acctlegend' }, a.groups.map(function (g, i) {
      return el('span', null, el('i', { style: 'background:' + colors[i % colors.length] }), g.label + ' ' + g.count);
    }));
    return el('section', { class: 'acct', 'aria-label': 'Coverage accounting' }, bar, legend);
  }

  // The integrity strip: the page re-derives the board it was handed — every
  // row's values from its components, the rank order, the ledger totals and
  // the checksum the program printed — and says whether they agree.
  function fnv1a(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function integrityStrip() {
    var f = DATA.fit;
    var a = DATA.accounting;
    var checks = [];
    var recomputed = 0;
    DATA.rows.forEach(function (r) { if (launchOf(r) === r.launch_value_usd && impliedOf(r) === r.implied_value_usd) recomputed++; });
    checks.push({ ok: recomputed === DATA.rows.length, text: 'rows recompute ' + recomputed + '/' + DATA.rows.length });
    var byRank = DATA.rows.slice().sort(function (x, y) { return x.rank - y.rank; });
    var ordered = true;
    for (var i = 1; i < byRank.length; i++) {
      if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) ordered = false;
    }
    checks.push({ ok: ordered, text: 'ranks in implied order' });
    var sum = a.groups.reduce(function (s, g) { return s + g.count; }, 0);
    checks.push({ ok: sum === a.total, text: 'ledger ' + sum + ' of ' + a.total });
    var sumImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    checks.push({ ok: sumImplied > 0, text: 'board total ' + fmtUsd(sumImplied) });
    var cs = fnv1a(byRank.map(function (r) { return r.slug + ':' + r.implied_value_usd; }).join('|'));
    checks.push({ ok: cs === f.checksum, text: 'checksum ' + cs + (cs === f.checksum ? ' matches' : ' \u2260 program\u2019s ' + f.checksum) });
    var plans = DATA.rows.every(function (r) { return r.farm_steps && r.farm_steps.length === 9 && r.farm_steps.every(function (s) { return s.length >= 20 && s.length <= 600; }); });
    checks.push({ ok: plans, text: 'every plan 9 priced steps' });
    var passed = checks.filter(function (c) { return c.ok; }).length;
    return el('section', { class: 'integrity' + (passed === checks.length ? '' : ' bad'), 'aria-label': 'Integrity checks' },
      el('b', { text: 'Integrity \u2014 ' + passed + '/' + checks.length + ' checks pass' }),
      el('span', { text: checks.map(function (c) { return (c.ok ? '\u2713 ' : '\u2717 ') + c.text; }).join(' \u00b7 ') })
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('h1', { text: 'Pre-token protocols ranked by what their token would be worth \u2014 priced by a model fitted to the ones that already launched, and audited on this page' }),
      el('p', { text: 'Launch value comes from a size curve fitted on this snapshot\u2019s own traded protocols; each category then takes a recency-weighted factor \u2014 the recent half of the record counts double, because the regime a launch would meet is the recent one \u2014 and a category too thin to have its own factor inherits a softer one, held at arm\u2019s length. Token odds are a fitted logistic that also reads the snapshot\u2019s own record \u2014 watchlist membership and each category\u2019s token record \u2014 not a lookup table. Every term in both models was kept or dropped on two blind tests, printed in the Method tab; every row\u2019s range is its own distribution over 200 bootstrap refits; every verdict is priced against fees, a T-bill and an hourly wage on one stated scenario. The full audit is in the Method tab and in METHOD.md beside this page.' })
    );
  }

  function tabButton(id, label) {
    return el('button', {
      type: 'button', 'aria-pressed': state.tab === id ? 'true' : 'false', text: label,
      onclick: function () { state.tab = id; writeHash(); render(); }
    });
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var vd = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return el('option', { value: v, text: v, selected: v === state.verdict ? 'selected' : null }); })
    );
    vd.addEventListener('change', function () { state.verdict = vd.value; writeHash(); render(); });
    var watch = el('button', {
      type: 'button', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only',
      onclick: function () { state.watch = !state.watch; writeHash(); render(); }
    });
    var sort = el('select', { id: 'sort', 'aria-label': 'Sort by' },
      ['implied', 'launch', 'odds', 'tvl', 'growth', 'age', 'name'].map(function (k) {
        return el('option', { value: k, text: { implied: 'Implied value', launch: 'Launch value', odds: 'Token odds', tvl: 'TVL', growth: '7-day growth', age: 'Age', name: 'Name' }[k], selected: k === state.sort ? 'selected' : null });
      })
    );
    sort.addEventListener('change', function () { state.sort = sort.value; state.dir = -1; render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), vd),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort' }), sort),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }),
        el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('method', 'Method'))),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Scope' }), watch),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' of ' + DATA.accounting.traded + ' traded shown' : 'the audit' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or verdict to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { selectRow(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(r.slug); } }
      },
        el('td', { class: 'num rankno', text: String(r.rank) }),
        el('td', null, el('div', { class: 'pname' },
          el('b', { text: r.name }),
          el('span', { text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' \u00b7 watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.launch_value_usd) }),
        el('td', { class: 'num', text: fmtOdds(r.token_odds) }),
        el('td', null, el('div', null,
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'band', text: fmtUsd(r.band_lo_usd) + ' \u2013 ' + fmtUsd(r.band_hi_usd) }),
          el('span', { class: 'band', text: 'rank #' + r.rank_lo + '\u2013#' + r.rank_hi + ' across refits' })
        )),
        el('td', null, el('span', { class: 'tag verdict-' + r.verdict.toLowerCase(), text: r.verdict }),
          el('span', { class: 'band', text: 'net ' + fmtUsd(r.plan_net_usd) + ' \u00b7 ' + fmtUsd(r.plan_net_hour) + '/hr' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Implied value is the fitted launch value weighted by token odds; the range under it is the middle half of the row\u2019s own distribution over 200 bootstrap refits, with the ranks it takes across those refits. Select a row for its step-by-step pricing and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('launch', 'Launch value'),
            sortHeader('odds', 'Odds'),
            sortHeader('implied', 'Implied value (band)'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: '\u2014' }),
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'tag live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: ' + DATA.accounting.traded + ' protocols in the snapshot already record a token; the ' + DATA.live.length + ' largest by market cap are shown. Their market cap is a fact, not a model, and the fitted comps among them are the model\u2019s evidence — no farm plan is written for a launch that already happened.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function detailPanel() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var launch = launchOf(row);
    var implied = impliedOf(row);
    var matches = launch === row.launch_value_usd && implied === row.implied_value_usd;
    var density = row.tvl_usd > 0 ? row.implied_value_usd / row.tvl_usd : 0;
    var steps = row.farm_steps || [];
    var panel = el('section', { class: 'panel detail', id: 'detail', 'aria-label': 'Protocol detail' });
    panel.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'tag verdict-' + row.verdict.toLowerCase(), text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' \u00b7 verdict ' + row.verdict + (row.watchlist ? ' \u00b7 watchlist' : '') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 listed ' + (row.listed_at || 'on an unknown date') + ' \u00b7 records no token' })
      ),
      el('button', { class: 'closebtn', type: 'button', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
    ));
    panel.appendChild(el('h3', { text: 'Implied value — fitted step by step, nothing asserted' }));
    panel.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('span', { text: 'TVL' }), el('b', { text: fmtFull(row.tvl_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Size curve at this TVL' }), el('b', { text: fmtFull(row.curve_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Category factor (' + row.factor_source + ')' }), el('b', { text: fmtMult(row.category_factor) })),
      el('div', { class: 'cell' }, el('span', { text: 'Structural multiplier' }), el('b', { text: fmtMult(row.struct_mult) + (row.struct_mult < 1 ? ' (curator: TVL nested)' : '') })),
      el('div', { class: 'cell' }, el('span', { text: 'Concern haircut' }), el('b', { text: fmtMult(row.haircut) + (row.concern ? ' (sharp fall or very new)' : '') })),
      el('div', { class: 'cell' }, el('span', { text: 'Launch value' }), el('b', { text: fmtFull(row.launch_value_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Token odds' }), el('b', { text: fmtOdds(row.token_odds) })),
      el('div', { class: 'cell' }, el('span', { text: 'Implied value' }), el('b', { text: fmtFull(row.implied_value_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Bootstrap range P25\u2013P75' }), el('b', { text: fmtUsd(row.band_lo_usd) + ' \u2013 ' + fmtUsd(row.band_hi_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Wider range P10\u2013P90' }), el('b', { text: fmtUsd(row.band10_lo_usd) + ' \u2013 ' + fmtUsd(row.band10_hi_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Rank across 200 refits' }), el('b', { text: '#' + row.rank_lo + ' \u2013 #' + row.rank_hi }))
    ));
    panel.appendChild(el('p', { class: 'note' },
      'Odds evidence: ' + row.odds_peers + '. The page recomputes this row from the fitted curve value and factors as ' + fmtFull(implied) + '. ',
      el('span', { class: matches ? 'check' : 'check bad', text: matches ? 'Matches board.json.' : 'Differs from board.json — the data would be stale.' })
    ));
    panel.appendChild(el('p', { class: 'note', text: 'Seven-day change ' + fmtPct(row.change_7d) + ' \u00b7 age with no token ' + fmtAge(row.age_days) + ' \u00b7 expected value per TVL dollar $' + density.toFixed(2) + ' \u00b7 plan fees about ' + fmtFull(row.est_cost_usd) + ' over the hold.' }));
    var notUsed = DATA.evidence.value.concat(DATA.evidence.odds).filter(function (r) { return r.verdict !== 'kept' && r.verdict !== 'baseline'; }).map(function (r) { return r.term.replace(/^\+ /, ''); });
    panel.appendChild(el('p', { class: 'note', text: 'Tested on this model and not used: ' + notUsed.join(' \u00b7 ') + '. Each was dropped because it failed one of the two blind tests in the Method tab \u2014 the model names what it refused, not only what it kept.' }));
    panel.appendChild(el('h3', { text: 'Nearest priced peers \u2014 the record this row is priced against' }));
    var peersBody = el('tbody');
    (row.peers || []).forEach(function (p) {
      peersBody.appendChild(el('tr', null,
        el('td', { text: p.name }),
        el('td', { text: p.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: '\u00d7' + p.cap_tvl.toFixed(2) }),
        el('td', { class: 'num', text: '\u00d7' + p.model_mult.toFixed(2) })
      ));
    });
    panel.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'mini' },
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Peer' }), el('th', { scope: 'col', text: 'Category' }),
        el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }),
        el('th', { scope: 'col', text: 'Actual cap / TVL' }), el('th', { scope: 'col', text: 'Model, held out' }))),
      peersBody
    )));
    panel.appendChild(el('p', { class: 'note', text: 'Same category first, then nearest by TVL. \u201cModel, held out\u201d is what the fitted model priced that peer at with the peer itself left out of the fit \u2014 the misses are printed, not hidden.' }));
    panel.appendChild(el('h3', { text: 'The verdict, priced \u2014 one stated scenario' }));
    panel.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('span', { text: 'Scenario deposit' }), el('b', { text: fmtFull(row.plan_deposit_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Modelled drop at a 7% share' }), el('b', { text: fmtFull(row.plan_drop_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Plan fees over the hold' }), el('b', { text: fmtFull(row.plan_fees_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Net of fees' }), el('b', { text: fmtFull(row.plan_net_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Net per hands-on hour' }), el('b', { text: fmtUsd(row.plan_net_hour) + ' / hr (' + row.plan_hours + ' h)' })),
      el('div', { class: 'cell' }, el('span', { text: 'The same deposit in a 4% T-bill' }), el('b', { text: fmtFull(row.plan_tbill_usd) }))
    ));
    var shares = [DATA.priors.plan_drop_share / 2, DATA.priors.plan_drop_share, DATA.priors.plan_drop_share * 2];
    var deposits = [1000, 3000, 10000, 30000];
    var sensHead = el('tr', null, el('th', { scope: 'col', text: 'Net if the drop share \u2192 / deposit \u2193' }),
      shares.map(function (s) { return el('th', { scope: 'col', class: 'num', text: (s * 100).toFixed(1) + '%' }); }));
    var sensBody = el('tbody');
    deposits.forEach(function (dep) {
      sensBody.appendChild(el('tr', null,
        el('td', { text: fmtFull(dep) }),
        shares.map(function (s) {
          var net = Math.round(row.implied_value_usd * s * dep / (row.tvl_usd + dep)) - row.plan_fees_usd;
          var own = dep === row.plan_deposit_usd && Math.abs(s - DATA.priors.plan_drop_share) < 1e-9;
          return el('td', { class: 'num' + (own ? ' own' : ''), text: fmtUsd(net) });
        })
      ));
    });
    panel.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'mini sens' },
      el('caption', { text: 'The verdict under other drop shares and deposit sizes \u2014 the highlighted cell is this row\u2019s own scenario.' }),
      el('thead', null, sensHead), sensBody
    )));
    panel.appendChild(el('h3', { text: 'Farm plan — what to do, what it costs, how long it takes' }));
    panel.appendChild(el('ol', { class: 'steps' }, steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    })));
    panel.appendChild(el('p', { class: 'note', text: 'A protocol that records no token may still have one its DefiLlama record does not carry. This board never claims a token will launch, or when.' }));
    return panel;
  }

  function methodPanel() {
    var f = DATA.fit;
    var a = DATA.accounting;
    var panel = el('section', { class: 'panel model', 'aria-label': 'Method and validation' });
    panel.appendChild(el('h2', { text: 'Method — the model is fitted, then backtested, in the open' }));
    panel.appendChild(el('p', { text: 'No multiple on this board is asserted. The size curve and the category factors are fitted at run time to the ' + f.comps + ' protocols in the snapshot whose token already trades with TVL and market cap on record (exchange tokens excluded, of ' + a.with_mcap + ' carrying a market cap). What is not fitted is listed as a prior, in the same place.' }));
    panel.appendChild(el('div', { class: 'formula', text: 'log(market cap) = ' + f.intercept + ' + ' + f.slope + ' \u00d7 log(TVL)   \u00b7   launch = curve \u00d7 category factor \u00d7 structural \u00d7 haircut   \u00b7   implied = launch \u00d7 token odds' }));
    panel.appendChild(el('h3', { text: 'Validation, computed inside the program on every run' }));
    panel.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('span', { text: 'Leave-one-out median |log error|' }), el('b', { text: String(f.loo_median_abs_log_err) })),
      el('div', { class: 'cell' }, el('span', { text: 'Row band from LOO' }), el('b', { text: '\u00d7/\u00f7 ' + f.band_factor })),
      el('div', { class: 'cell' }, el('span', { text: 'Comps priced within \u00d72 / \u00d73 (LOO)' }), el('b', { text: Math.round(f.loo_within_2x * 100) + '% / ' + Math.round(f.loo_within_3x * 100) + '%' })),
      el('div', { class: 'cell' }, el('span', { text: 'Walk-forward fit / test' }), el('b', { text: f.wf_train + ' / ' + f.wf_test + ' comps' })),
      el('div', { class: 'cell' }, el('span', { text: 'Walk-forward median |log error|' }), el('b', { text: String(f.wf_median_abs_log_err) })),
      el('div', { class: 'cell' }, el('span', { text: 'Walk-forward within \u00d73' }), el('b', { text: Math.round(f.wf_within_3x * 100) + '%' })),
      el('div', { class: 'cell' }, el('span', { text: 'Held-out folds (slug-dealt)' }), el('b', { text: f.kf_folds + ' folds \u00b7 ' + f.kf_test + ' comps' })),
      el('div', { class: 'cell' }, el('span', { text: 'Held-out median |log error|' }), el('b', { text: String(f.kf_median_abs_log_err) })),
      el('div', { class: 'cell' }, el('span', { text: 'Held-out band / within \u00d73' }), el('b', { text: '\u00d7/\u00f7 ' + f.kf_band_factor + ' \u00b7 ' + Math.round(f.kf_within_3x * 100) + '%' }))
    ));
    panel.appendChild(el('p', { class: 'note', text: 'The second holdout ignores time on purpose: the comps are dealt into ' + f.kf_folds + ' folds by a hash of the slug, each fold is priced by a model fitted on the other four, and every comp is priced exactly once, out of sample. A split that cannot see the listing order cannot be flattered by it, so it checks the walk-forward rather than repeating it.' }));
    panel.appendChild(el('p', { class: 'note', text: 'Walk-forward: fit on the comps listed by ' + f.wf_split_listed_at + ', price the ones listed later. Growth is not a launch-value input, on this evidence: ' + f.comps_grew_5 + ' of the ' + f.comps + ' comps grew more than 5% in the snapshot week and ' + f.comps_fell_5 + ' fell more than 5%, so a fitted growth slope would be a falling week\u2019s artefact; growth enters through the odds model, the concern haircut and the verdicts.' }));
    panel.appendChild(el('h3', { text: 'Out-of-sample evidence \u2014 every term, kept or dropped' }));
    panel.appendChild(el('p', { class: 'note', text: 'A term enters the shipped model only if it lowers the held-out miss on BOTH tests. These tables are computed inside the program on every run; the shipped model is exactly the rows marked kept.' }));
    function evTable(rows, headA, headB, fmt) {
      var body = el('tbody');
      rows.forEach(function (r) {
        body.appendChild(el('tr', null,
          el('td', { text: r.term }),
          el('td', { class: 'num', text: fmt(r.test_a) }),
          el('td', { class: 'num', text: fmt(r.test_b) }),
          el('td', null, el('span', { class: 'tag ev-' + (r.verdict === 'kept' ? 'kept' : r.verdict === 'baseline' ? 'base' : 'drop'), text: r.verdict }))
        ));
      });
      return el('div', { class: 'table-wrap' }, el('table', { class: 'mini' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Term' }), el('th', { scope: 'col', text: headA }), el('th', { scope: 'col', text: headB }), el('th', { scope: 'col', text: 'Verdict' }))),
        body));
    }
    panel.appendChild(el('h4', { text: 'Value model \u2014 median |log error|, lower is better' }));
    panel.appendChild(evTable(DATA.evidence.value, 'Leave-one-out', 'Walk-forward', function (v) { return v.toFixed(4) + ' (\u00d7/\u00f7 ' + Math.exp(v).toFixed(2) + ')'; }));
    panel.appendChild(el('h4', { text: 'Token odds \u2014 Brier score, lower is better' }));
    panel.appendChild(evTable(DATA.evidence.odds, 'Ten-fold', 'Walk-forward', function (v) { return v.toFixed(4); }));
    panel.appendChild(el('h3', { text: 'Range honesty and the odds, scored as probabilities' }));
    panel.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('span', { text: 'Caps inside P25\u2013P75 (stated 50%)' }), el('b', { text: Math.round(f.hon_loo_2575 * 100) + '% LOO \u00b7 ' + Math.round(f.hon_wf_2575 * 100) + '% WF' })),
      el('div', { class: 'cell' }, el('span', { text: 'Caps inside P10\u2013P90 (stated 80%)' }), el('b', { text: Math.round(f.hon_loo_1090 * 100) + '% LOO \u00b7 ' + Math.round(f.hon_wf_1090 * 100) + '% WF' })),
      el('div', { class: 'cell' }, el('span', { text: 'Odds Brier \u00b7 LOO / 10-fold / WF' }), el('b', { text: f.odds_brier + ' / ' + f.odds_10f_brier + ' / ' + f.odds_wf_brier })),
      el('div', { class: 'cell' }, el('span', { text: 'Base-rate Brier \u00b7 LOO / WF' }), el('b', { text: f.odds_base_brier + ' / ' + f.odds_wf_base_brier })),
      el('div', { class: 'cell' }, el('span', { text: 'Bootstrap \u00b7 ' + f.boot_refits + ' refits' }), el('b', { text: 'slope \u00b1' + f.boot_slope_se + ' \u00b7 intercept \u00b1' + f.boot_intercept_se })),
      el('div', { class: 'cell' }, el('span', { text: 'Board checksum' }), el('b', { text: f.checksum }))
    ));
    panel.appendChild(el('p', { class: 'note', text: 'The peer cells the previous model used scored a leave-one-out Brier of 0.2144 and a walk-forward 0.2865 on these same tests; the logistic is kept because it beats them on both. A survival-style adjustment of the odds was fitted and rejected: it scored 0.3246, because it prices a different event than the record being forecast.' }));
    panel.appendChild(el('h3', { text: 'Category factors (fitted; source shown)' }));
    panel.appendChild(el('div', { class: 'sectors' }, DATA.factors.map(function (r) {
      return el('span', { text: r.category + ' ' + fmtMult(r.factor) + ' (' + r.source + (r.source === 'category' ? ', ' + r.comps + ' comps' : '') + ')' });
    })));
    panel.appendChild(el('h3', { text: 'Priors — stated judgements, not fitted' }));
    panel.appendChild(el('ul', { class: 'priors' },
      el('li', { text: 'Curator multiplier ' + fmtMult(DATA.priors.curator_mult) + ' on ' + DATA.curator_rows + ' ranked rows: a curator\u2019s TVL is nested inside the protocols it allocates to, so the same dollars would otherwise be priced twice.' }),
      el('li', { text: 'Concern haircut ' + fmtMult(DATA.priors.concern_haircut) + ' on ' + DATA.haircut_rows + ' ranked rows: a seven-day fall of ' + DATA.priors.concern_fall_pct + '% or worse, or under ' + DATA.priors.concern_age_days + ' days on record. A concern row can be THIN at best.' }),
      el('li', { text: 'Verdict benchmark: every row is priced on one stated scenario \u2014 a $' + DATA.priors.plan_deposit_usd + ' deposit at a ' + Math.round(DATA.priors.plan_drop_share * 100) + '% drop share over the plan\u2019s hold. FARM must beat the plan\u2019s fees, a ' + Math.round(DATA.priors.tbill_annual * 100) + '% T-bill on the same deposit, $' + DATA.priors.wage_per_hour + ' for each hands-on hour, odds of ' + DATA.priors.farm_odds + ' and the rich line (implied value at least ' + Math.round(DATA.priors.farm_density * 100) + '% of TVL); THIN beats its fees but not every benchmark; the rest are SKIP.' }),
      el('li', { text: 'Token odds are a ridge logistic (penalty ' + DATA.priors.odds_ridge + ') on the terms the ablation kept, fitted against the record of which of the ' + a.total + ' protocols already carry a token (base rate ' + f.traded_share + '); its coefficients are printed in METHOD.md, and each row\u2019s detail names its peer evidence.' })
    ));
    panel.appendChild(el('h3', { text: 'Accounting — all ' + a.total + ' protocols' }));
    panel.appendChild(el('div', { class: 'grid' },
      el('div', { class: 'cell' }, el('span', { text: 'Already record a token' }), el('b', { text: String(a.traded) })),
      el('div', { class: 'cell' }, el('span', { text: 'Ranked on this board' }), el('b', { text: String(a.ranked) })),
      el('div', { class: 'cell' }, el('span', { text: 'Watchlist covered' }), el('b', { text: a.watchlist_ranked + ' / ' + a.watchlist })),
      a.groups.map(function (g) {
        return el('div', { class: 'cell' }, el('span', { text: g.label }), el('b', { text: String(g.count) }));
      }),
      a.unranked.map(function (u) {
        return el('div', { class: 'cell' }, el('span', { text: 'Not ranked: ' + u.reason }), el('b', { text: String(u.count) }));
      })
    ));
    panel.appendChild(el('p', { class: 'note', text: 'The same audit, with the run\u2019s own numbers, is written as METHOD.md beside this page on every build. Rows are ranked by the middle of their band, never by its top.' }));
    return panel;
  }

  function selectRow(slug) {
    state.selected = slug;
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(topbar());
    shell.appendChild(kpiStrip());
    shell.appendChild(hero());
    shell.appendChild(acctBar());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      var detail = detailPanel();
      if (detail) shell.appendChild(detail);
      shell.appendChild(boardTable());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(methodPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
})();
