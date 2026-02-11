// Main application entry point
import * as api from './api.js';
import {
  formatNumber,
  formatVotingPower,
  formatPercent,
  shortenAddress,
  formatDate,
  createElement,
  escapeHtml,
  getGaugeColor,
  formatGaugeName,
} from './utils.js';
import { marked } from 'marked';

// State
const state = {
  currentEpoch: null,
  epochs: [],
  health: null,
};

// Router
class Router {
  constructor() {
    this.routes = {};
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  on(pattern, handler) {
    this.routes[pattern] = handler;
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');

    // Try exact match first
    if (this.routes[path]) {
      this.routes[path](params);
      return;
    }

    // Try pattern matching
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const match = this.matchPattern(pattern, path);
      if (match) {
        handler({ ...match, query: params });
        return;
      }
    }

    // 404
    this.render404();
  }

  matchPattern(pattern, path) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
    return params;
  }

  render404() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="empty">
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <p><a href="#/">Back to Dashboard</a></p>
      </div>
    `;
  }

  navigate(path) {
    window.location.hash = path;
  }
}

const router = new Router();

// UI Components

function renderBreadcrumbs(items) {
  const container = document.getElementById('breadcrumbs');

  if (!items || items.length <= 1) {
    container.classList.remove('visible');
    return;
  }

  container.classList.add('visible');
  container.innerHTML = `
    <div class="breadcrumbs-content">
      ${items.map((item, i) => {
        if (i === items.length - 1) {
          return `<span class="current">${escapeHtml(item.label)}</span>`;
        }
        return `<a href="${item.href}">${escapeHtml(item.label)}</a><span class="separator">/</span>`;
      }).join('')}
    </div>
  `;
}

function renderLoading() {
  return '<div class="loading">Loading...</div>';
}

function renderError(message) {
  return `<div class="error">${escapeHtml(message)}</div>`;
}

function renderEmpty(title, message) {
  return `
    <div class="empty">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderEpochSelector(epochs, selectedId, onChange) {
  const container = createElement('div', { className: 'epoch-selector' });

  const label = createElement('label', { for: 'epoch-select' }, 'Epoch:');

  const select = createElement('select', {
    id: 'epoch-select',
    onchange: (e) => onChange(parseInt(e.target.value, 10)),
  });

  if (epochs.length === 0) {
    select.appendChild(createElement('option', { value: '' }, 'No epochs available'));
  } else {
    for (const epoch of epochs) {
      const opt = createElement('option', {
        value: epoch.epochId.toString(),
      }, `Epoch ${epoch.epochId}`);
      if (epoch.epochId === selectedId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
  }

  container.appendChild(label);
  container.appendChild(select);

  return container;
}

function renderStatsGrid(stats) {
  return `
    <div class="stats-grid">
      ${stats.map(stat => `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(stat.label)}</div>
          <div class="stat-value ${stat.small ? 'small' : ''}">${escapeHtml(stat.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderGaugeCard(gauge, epochId, index) {
  const color = getGaugeColor(index);
  const rank = index + 1;
  return `
    <a href="#/epochs/${epochId}/gauges/${gauge.gaugeAddress}" class="gauge-card">
      <div class="gauge-header">
        <span class="gauge-name"><span class="gauge-rank">${rank}</span>${formatGaugeName(gauge.gaugeAddress)}</span>
        <span class="gauge-percent">${formatPercent(gauge.percentage)}</span>
      </div>
      <div class="gauge-bar">
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill gauge-${index + 1}" style="width: ${Math.min(gauge.percentage || 0, 100)}%; background: ${color};"></div>
        </div>
        <span class="gauge-bar-value">${formatVotingPower(gauge.totalVotes)}</span>
      </div>
      <div class="gauge-stats">
        <span>${gauge.uniqueVoters || 0} voter${gauge.uniqueVoters !== 1 ? 's' : ''}</span>
        <span>${gauge.uniqueContributors || 0} contributor${gauge.uniqueContributors !== 1 ? 's' : ''}</span>
      </div>
    </a>
  `;
}

function renderSortableTable(config) {
  const { columns, rows, sortColumn, sortDirection, onSort, onRowClick } = config;

  return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            ${columns.map(col => `
              <th
                class="${col.sortable ? 'sortable' : ''} ${sortColumn === col.key ? `sorted-${sortDirection}` : ''}"
                ${col.sortable ? `data-sort="${col.key}"` : ''}
              >
                ${escapeHtml(col.label)}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `
            <tr><td colspan="${columns.length}" style="text-align: center; color: var(--color-text-secondary);">No data available</td></tr>
          ` : rows.map((row, i) => `
            <tr ${onRowClick ? `data-row-index="${i}" style="cursor: pointer;"` : ''}>
              ${columns.map(col => `
                <td class="${col.className || ''}">${col.render ? col.render(row) : escapeHtml(row[col.key] ?? '')}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Page Renderers

async function renderDashboard() {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  renderBreadcrumbs(null);
  updateActiveNav('home');

  try {
    // Fetch initial data
    const [healthData, epochsData] = await Promise.all([
      api.getHealth().catch(() => null),
      api.getEpochs({ limit: 50, finalized: true }),
    ]);

    state.health = healthData;
    state.epochs = epochsData.epochs;

    if (state.epochs.length === 0) {
      main.innerHTML = renderEmpty(
        'No Epochs Indexed',
        'No finalized epochs have been indexed yet. Check back later.'
      );
      return;
    }

    const latestEpoch = state.epochs[0];
    state.currentEpoch = latestEpoch.epochId;

    await renderDashboardContent(latestEpoch.epochId);
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderDashboardContent(epochId) {
  const main = document.getElementById('main');

  try {
    const epochData = await api.getEpoch(epochId);
    const epoch = epochData.epoch;
    const gauges = epochData.gauges || [];
    const summary = epochData.summary || {};

    main.innerHTML = '';

    // Epoch selector
    const selector = renderEpochSelector(state.epochs, epochId, (newEpochId) => {
      state.currentEpoch = newEpochId;
      renderDashboardContent(newEpochId);
    });
    main.appendChild(selector);

    // Stats grid
    const statsHtml = renderStatsGrid([
      { label: 'Total Votes', value: formatVotingPower(epoch.totalVotes) },
      { label: 'Delegates', value: formatNumber(summary.totalDelegates || 0) },
      { label: 'Contributors', value: formatNumber(summary.totalContributors || 0) },
      { label: 'Gauges', value: formatNumber(summary.totalGaugesVotedFor || 0) },
    ]);
    main.insertAdjacentHTML('beforeend', statsHtml);

    // Gauges section
    const gaugesSection = createElement('section', { className: 'gauges-section' });
    gaugesSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Gauge Breakdown</h2>
        <span class="section-subtitle">Epoch ${epochId}</span>
      </div>
      <div class="gauge-list">
        ${gauges.map((g, i) => renderGaugeCard(g, epochId, i)).join('')}
      </div>
    `;
    main.appendChild(gaugesSection);

  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderGaugeDetail(params) {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  updateActiveNav(null);

  const epochId = parseInt(params.epochId, 10);
  const gaugeAddress = params.gauge;

  renderBreadcrumbs([
    { label: 'Dashboard', href: '#/' },
    { label: `Epoch ${epochId}`, href: `#/?epoch=${epochId}` },
    { label: formatGaugeName(gaugeAddress), href: null },
  ]);

  try {
    const [epochData, contributionsData] = await Promise.all([
      api.getEpoch(epochId),
      api.getEpochContributions(epochId, { gauge: gaugeAddress, limit: 100 }),
    ]);

    const gauge = epochData.gauges.find(g => g.gaugeAddress.toLowerCase() === gaugeAddress.toLowerCase());
    const contributions = contributionsData.contributions || [];

    // Group contributions by delegate
    const delegateMap = new Map();
    for (const c of contributions) {
      if (!delegateMap.has(c.delegateAddress)) {
        delegateMap.set(c.delegateAddress, {
          delegateAddress: c.delegateAddress,
          totalVotes: 0n,
          delegators: [],
        });
      }
      const entry = delegateMap.get(c.delegateAddress);
      entry.totalVotes += BigInt(c.contributionAmount);
      entry.delegators.push(c);
    }

    const delegates = Array.from(delegateMap.values())
      .sort((a, b) => a.totalVotes > b.totalVotes ? -1 : 1);

    main.innerHTML = `
      <div class="detail-header">
        <h1 class="detail-title">${formatGaugeName(gaugeAddress)}</h1>
        <div class="detail-address">${gaugeAddress}</div>
        <div class="detail-meta">Epoch ${epochId}</div>
      </div>

      ${renderStatsGrid([
        { label: 'Total Votes', value: formatVotingPower(gauge?.totalVotes || '0') },
        { label: 'Share of Total', value: formatPercent(gauge?.percentage || 0) },
        { label: 'Unique Voters', value: formatNumber(gauge?.uniqueVoters || 0) },
        { label: 'Contributors', value: formatNumber(gauge?.uniqueContributors || 0) },
      ])}

      <section>
        <div class="section-header">
          <h2 class="section-title">Votes by Delegate</h2>
        </div>
        ${renderSortableTable({
          columns: [
            { key: 'rank', label: '#', className: 'rank', render: (r, i) => (delegates.indexOf(r) + 1) },
            { key: 'delegateAddress', label: 'Delegate', className: 'address', render: r => `<a href="#/epochs/${epochId}/delegates/${r.delegateAddress}">${shortenAddress(r.delegateAddress)}</a>` },
            { key: 'delegators', label: 'Delegators', className: 'numeric', render: r => r.delegators.length },
            { key: 'totalVotes', label: 'Votes', className: 'numeric', render: r => formatVotingPower(r.totalVotes.toString()) },
          ],
          rows: delegates,
        })}
      </section>

      <section style="margin-top: 2rem;">
        <div class="section-header">
          <h2 class="section-title">Individual Contributions</h2>
        </div>
        ${renderSortableTable({
          columns: [
            { key: 'delegatorAddress', label: 'Contributor', className: 'address', render: r => `<a href="#/epochs/${epochId}/voters/${r.delegatorAddress}">${shortenAddress(r.delegatorAddress)}</a>` },
            { key: 'delegateAddress', label: 'Via Delegate', className: 'address', render: r => `<a href="#/epochs/${epochId}/delegates/${r.delegateAddress}">${shortenAddress(r.delegateAddress)}</a>` },
            { key: 'contributionAmount', label: 'Contribution', className: 'numeric', render: r => formatVotingPower(r.contributionAmount) },
            { key: 'contributionPercentage', label: '%', className: 'numeric', render: r => formatPercent(r.contributionPercentage) },
          ],
          rows: contributions,
        })}
      </section>
    `;
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderDelegateDetail(params) {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  updateActiveNav(null);

  const epochId = parseInt(params.epochId, 10);
  const delegateAddress = params.address;

  renderBreadcrumbs([
    { label: 'Dashboard', href: '#/' },
    { label: `Epoch ${epochId}`, href: `#/?epoch=${epochId}` },
    { label: 'Delegate', href: null },
  ]);

  try {
    const [delegatesData, contributionsData] = await Promise.all([
      api.getEpochDelegates(epochId, { limit: 100 }),
      api.getEpochContributions(epochId, { delegate: delegateAddress, limit: 100 }),
    ]);

    const delegate = delegatesData.delegates.find(d =>
      d.delegateAddress.toLowerCase() === delegateAddress.toLowerCase()
    );
    const contributions = contributionsData.contributions || [];

    // Group by gauge
    const gaugeMap = new Map();
    for (const c of contributions) {
      if (!gaugeMap.has(c.gaugeAddress)) {
        gaugeMap.set(c.gaugeAddress, { gaugeAddress: c.gaugeAddress, totalVotes: 0n, contributions: [] });
      }
      const entry = gaugeMap.get(c.gaugeAddress);
      entry.totalVotes += BigInt(c.contributionAmount);
      entry.contributions.push(c);
    }
    const gauges = Array.from(gaugeMap.values());

    // Group by delegator
    const delegatorMap = new Map();
    for (const c of contributions) {
      if (!delegatorMap.has(c.delegatorAddress)) {
        delegatorMap.set(c.delegatorAddress, {
          delegatorAddress: c.delegatorAddress,
          votingPower: BigInt(c.delegatorVotingPower),
          totalContribution: 0n,
        });
      }
      const entry = delegatorMap.get(c.delegatorAddress);
      entry.totalContribution += BigInt(c.contributionAmount);
    }
    const delegators = Array.from(delegatorMap.values())
      .sort((a, b) => a.totalContribution > b.totalContribution ? -1 : 1);

    main.innerHTML = `
      <div class="detail-header">
        <h1 class="detail-title">Delegate</h1>
        <div class="detail-address">${delegateAddress}</div>
        <div class="detail-meta">Epoch ${epochId}${delegate ? ` | Rank #${delegate.rank}` : ''}</div>
      </div>

      ${renderStatsGrid([
        { label: 'Total Voting Power', value: formatVotingPower(delegate?.totalVotingPower || '0') },
        { label: 'Delegators', value: formatNumber(delegate?.delegatorCount || delegators.length) },
        { label: 'Gauges Voted', value: formatNumber(delegate?.gaugesVotedFor || gauges.length) },
        { label: 'Rank', value: `#${delegate?.rank || '—'}` },
      ])}

      <section>
        <div class="section-header">
          <h2 class="section-title">Vote Distribution</h2>
        </div>
        ${delegate?.votes ? `
          <div class="gauge-list">
            ${delegate.votes.map((v, i) => `
              <a href="#/epochs/${epochId}/gauges/${v.gaugeAddress}" class="gauge-card">
                <div class="gauge-header">
                  <span class="gauge-name">${formatGaugeName(v.gaugeAddress)}</span>
                  <span class="gauge-percent">${formatPercent(v.weightPercentage)}</span>
                </div>
                <div class="gauge-bar">
                  <div class="gauge-bar-track">
                    <div class="gauge-bar-fill" style="width: ${v.weightPercentage || 0}%; background: ${getGaugeColor(i)};"></div>
                  </div>
                  <span class="gauge-bar-value">${formatVotingPower(v.votesCast)}</span>
                </div>
              </a>
            `).join('')}
          </div>
        ` : '<p class="empty">No vote data available</p>'}
      </section>

      <section style="margin-top: 2rem;">
        <div class="section-header">
          <h2 class="section-title">Delegators</h2>
        </div>
        ${renderSortableTable({
          columns: [
            { key: 'delegatorAddress', label: 'Address', className: 'address', render: r => `<a href="#/epochs/${epochId}/voters/${r.delegatorAddress}">${shortenAddress(r.delegatorAddress)}</a>` },
            { key: 'votingPower', label: 'Voting Power', className: 'numeric', render: r => formatVotingPower(r.votingPower.toString()) },
            { key: 'totalContribution', label: 'Total Contribution', className: 'numeric', render: r => formatVotingPower(r.totalContribution.toString()) },
          ],
          rows: delegators,
        })}
      </section>
    `;
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderVoterDetail(params) {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  updateActiveNav(null);

  const epochId = parseInt(params.epochId, 10);
  const voterAddress = params.address;

  renderBreadcrumbs([
    { label: 'Dashboard', href: '#/' },
    { label: `Epoch ${epochId}`, href: `#/?epoch=${epochId}` },
    { label: 'Voter', href: null },
  ]);

  try {
    const [voterData, contributionsData] = await Promise.all([
      api.getVoter(voterAddress).catch(() => ({ delegator: null })),
      api.getEpochContributions(epochId, { delegator: voterAddress, limit: 100 }),
    ]);

    const voter = voterData.delegator;
    const contributions = contributionsData.contributions || [];

    const totalContribution = contributions.reduce(
      (sum, c) => sum + BigInt(c.contributionAmount),
      0n
    );

    // Get delegate info
    const delegateAddress = contributions.length > 0 ? contributions[0].delegateAddress : voter?.currentDelegate;

    main.innerHTML = `
      <div class="detail-header">
        <h1 class="detail-title">Voter / Delegator</h1>
        <div class="detail-address">${voterAddress}</div>
        <div class="detail-meta">Epoch ${epochId}</div>
      </div>

      ${renderStatsGrid([
        { label: 'Voting Power', value: formatVotingPower(contributions[0]?.delegatorVotingPower || voter?.currentVotingPower || '0') },
        { label: 'Total Contribution', value: formatVotingPower(totalContribution.toString()) },
        { label: 'Gauges', value: formatNumber(new Set(contributions.map(c => c.gaugeAddress)).size) },
      ])}

      ${delegateAddress ? `
        <section>
          <div class="section-header">
            <h2 class="section-title">Delegated To</h2>
          </div>
          <div class="card">
            <a href="#/epochs/${epochId}/delegates/${delegateAddress}" class="address-full">${delegateAddress}</a>
          </div>
        </section>
      ` : ''}

      <section style="margin-top: 2rem;">
        <div class="section-header">
          <h2 class="section-title">Contributions by Gauge</h2>
        </div>
        ${renderSortableTable({
          columns: [
            { key: 'gaugeAddress', label: 'Gauge', className: 'address', render: r => `<a href="#/epochs/${epochId}/gauges/${r.gaugeAddress}">${formatGaugeName(r.gaugeAddress)}</a>` },
            { key: 'contributionAmount', label: 'Contribution', className: 'numeric', render: r => formatVotingPower(r.contributionAmount) },
            { key: 'contributionPercentage', label: '%', className: 'numeric', render: r => formatPercent(r.contributionPercentage) },
          ],
          rows: contributions,
        })}
      </section>

      ${voter?.history && voter.history.length > 0 ? `
        <section style="margin-top: 2rem;">
          <div class="section-header">
            <h2 class="section-title">Historical Activity</h2>
          </div>
          ${renderSortableTable({
            columns: [
              { key: 'epochId', label: 'Epoch', render: r => `<a href="#/epochs/${r.epochId}/voters/${voterAddress}">Epoch ${r.epochId}</a>` },
              { key: 'delegateAddress', label: 'Delegate', className: 'address', render: r => shortenAddress(r.delegateAddress) },
              { key: 'votingPower', label: 'Voting Power', className: 'numeric', render: r => formatVotingPower(r.votingPower) },
              { key: 'totalContribution', label: 'Contribution', className: 'numeric', render: r => formatVotingPower(r.totalContribution) },
            ],
            rows: voter.history,
          })}
        </section>
      ` : ''}
    `;
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderRankings() {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  updateActiveNav('rankings');
  renderBreadcrumbs(null);

  try {
    // Fetch epochs first
    if (state.epochs.length === 0) {
      const epochsData = await api.getEpochs({ limit: 50, finalized: true });
      state.epochs = epochsData.epochs;
    }

    if (state.epochs.length === 0) {
      main.innerHTML = renderEmpty('No Data', 'No epochs have been indexed yet.');
      return;
    }

    const epochId = state.currentEpoch || state.epochs[0].epochId;
    await renderRankingsContent(epochId);
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderRankingsContent(epochId) {
  const main = document.getElementById('main');

  try {
    const rankings = await api.getRankings({ epoch: epochId, limit: 20 });

    main.innerHTML = '';

    // Epoch selector
    const selector = renderEpochSelector(state.epochs, epochId, (newEpochId) => {
      state.currentEpoch = newEpochId;
      renderRankingsContent(newEpochId);
    });
    main.appendChild(selector);

    // Tabs for different rankings
    const content = createElement('div');
    content.innerHTML = `
      <div class="tabs">
        <button class="tab active" data-tab="delegates">Top Delegates</button>
        <button class="tab" data-tab="voters">Top Voters</button>
        <button class="tab" data-tab="gauges">Top Gauges</button>
      </div>

      <div class="tab-content" id="tab-delegates">
        ${renderSortableTable({
          columns: [
            { key: 'rank', label: '#', className: 'rank' },
            { key: 'delegateAddress', label: 'Delegate', className: 'address', render: r => `<a href="#/epochs/${epochId}/delegates/${r.delegateAddress}">${shortenAddress(r.delegateAddress)}</a>` },
            { key: 'totalVotingPower', label: 'Voting Power', className: 'numeric', render: r => formatVotingPower(r.totalVotingPower) },
            { key: 'delegatorCount', label: 'Delegators', className: 'numeric' },
            { key: 'gaugesVotedFor', label: 'Gauges', className: 'numeric' },
          ],
          rows: rankings.topDelegates || [],
        })}
      </div>

      <div class="tab-content" id="tab-voters" style="display: none;">
        ${renderSortableTable({
          columns: [
            { key: 'rank', label: '#', className: 'rank' },
            { key: 'voterAddress', label: 'Voter', className: 'address', render: r => `<a href="#/epochs/${epochId}/voters/${r.voterAddress}">${shortenAddress(r.voterAddress)}</a>` },
            { key: 'votingPower', label: 'Voting Power', className: 'numeric', render: r => formatVotingPower(r.votingPower) },
            { key: 'totalContribution', label: 'Total Contribution', className: 'numeric', render: r => formatVotingPower(r.totalContribution) },
          ],
          rows: rankings.topVoters || [],
        })}
      </div>

      <div class="tab-content" id="tab-gauges" style="display: none;">
        ${renderSortableTable({
          columns: [
            { key: 'rank', label: '#', className: 'rank' },
            { key: 'gaugeAddress', label: 'Gauge', className: 'address', render: r => `<a href="#/epochs/${epochId}/gauges/${r.gaugeAddress}">${formatGaugeName(r.gaugeAddress)}</a>` },
            { key: 'totalVotes', label: 'Total Votes', className: 'numeric', render: r => formatVotingPower(r.totalVotes) },
            { key: 'uniqueVoters', label: 'Voters', className: 'numeric' },
            { key: 'uniqueContributors', label: 'Contributors', className: 'numeric' },
          ],
          rows: rankings.topGauges || [],
        })}
      </div>
    `;

    main.appendChild(content);

    // Tab switching
    content.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        content.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        content.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

        e.target.classList.add('active');
        const tabId = e.target.dataset.tab;
        document.getElementById(`tab-${tabId}`).style.display = 'block';
      });
    });
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

async function renderSpec() {
  const main = document.getElementById('main');
  main.innerHTML = renderLoading();
  updateActiveNav('spec');
  renderBreadcrumbs(null);

  try {
    // Fetch the spec markdown
    const response = await fetch('/spec.md');
    if (!response.ok) {
      throw new Error('Failed to load specification');
    }
    const markdown = await response.text();

    // Configure marked
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    const html = marked.parse(markdown);

    main.innerHTML = `
      <div class="spec-content">
        ${html}
      </div>
    `;
  } catch (error) {
    main.innerHTML = renderError(error.message);
  }
}

function updateActiveNav(route) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.route === route);
  });
}

// Initialize routes
router.on('/', renderDashboard);
router.on('/rankings', renderRankings);
router.on('/spec', renderSpec);
router.on('/epochs/:epochId/gauges/:gauge', renderGaugeDetail);
router.on('/epochs/:epochId/delegates/:address', renderDelegateDetail);
router.on('/epochs/:epochId/voters/:address', renderVoterDetail);

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  router.handleRoute();
});
