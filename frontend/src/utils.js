// Utility functions

// Format large numbers with commas
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return '—';

  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '—';

  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Format voting power (usually in wei, convert to human-readable)
export function formatVotingPower(value) {
  if (!value) return '0';

  // Handle string bigint values from API
  const n = typeof value === 'string' ? BigInt(value) : value;

  // Convert from wei (18 decimals) to human readable
  const divisor = 10n ** 18n;
  const whole = n / divisor;
  const remainder = n % divisor;

  // Get 2 decimal places
  const decimal = remainder * 100n / divisor;

  if (decimal > 0) {
    return `${formatNumber(Number(whole))}.${decimal.toString().padStart(2, '0')}`;
  }

  return formatNumber(Number(whole));
}

// Format percentage
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(decimals)}%`;
}

// Shorten address for display
export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format timestamp to readable date
export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format timestamp to relative time
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '—';

  const now = Date.now();
  const date = timestamp * 1000;
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

// Create element helper
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'onclick' || key === 'onchange') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        el.dataset[dataKey] = dataValue;
      }
    } else if (key === 'innerHTML') {
      el.innerHTML = value;
    } else {
      el.setAttribute(key, value);
    }
  }

  for (const child of Array.isArray(children) ? children : [children]) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }

  return el;
}

// HTML escape
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Gauge color by index
export function getGaugeColor(index) {
  const colors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7'];
  return colors[index % colors.length];
}

// Gauge name display
export function formatGaugeName(address) {
  // Known gauges map
  const gaugeNames = {
    '0x0000000000000000000000000000000000000001': 'Gauge 1',
    '0x0000000000000000000000000000000000000002': 'Gauge 2',
    '0x0000000000000000000000000000000000000003': 'Gauge 3',
  };

  return gaugeNames[address] || shortenAddress(address);
}

// Debounce function
export function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
