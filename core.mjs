const MiB = 1024 * 1024;
const encoder = new TextEncoder();

function csvRecords(input) {
  if (typeof input !== 'string') throw new Error('CSV content must be text.');
  const text = input.replace(/^\uFEFF/, '');
  const records = [];
  let cells = [], field = '', quoted = false, afterQuote = false, hadQuote = false, line = 1, rowLine = 1, rowOffset = 0, firstDelimiter = null;
  const finishField = () => { cells.push(field); field = ''; afterQuote = false; };
  const finishRow = (end = text.length) => { finishField(); records.push({ cells, line: rowLine, hadQuote, raw: text.slice(rowOffset, end), delimiter: firstDelimiter }); cells = []; hadQuote = false; firstDelimiter = null; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else {
        field += c;
        if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
      }
    } else if (c === ',') { if (!cells.length) firstDelimiter = i - rowOffset; finishField(); }
    else if (c === '\r' || c === '\n') {
      finishRow(i);
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++;
      rowLine = line;
      rowOffset = i + 1;
    } else if (c === '"') {
      if (field || afterQuote) throw new Error(`Unexpected quote on line ${line}. Check CSV quoting.`);
      quoted = true;
      hadQuote = true;
    } else {
      if (afterQuote) throw new Error(`Unexpected text after a closing quote on line ${line}.`);
      field += c;
    }
  }
  if (quoted) throw new Error(`Unclosed quoted field starting in record on line ${rowLine}.`);
  if (field || cells.length || afterQuote) finishRow();
  return records;
}

export function parseCSV(text) {
  return csvRecords(text).map(record => record.cells);
}

function linkedInSearchRecords(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const header = csvRecords(lines[0])[0];
  const timestamp = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} UTC),(.*)$/;
  const rawRecord = /^((?:\d{4}\/\d{2}\/\d{2}[^,]*)|N\/A|null|),(.*)$/i;
  const first = lines.slice(1).find(line => line.trim());
  if (header?.cells.join(',') !== 'Time,Search Query' || !first || !timestamp.test(first)) return csvRecords(text);
  const records = [header];
  let pendingBlanks = [];
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index], match = rawRecord.exec(line);
    if (!line.trim()) { pendingBlanks.push(line); continue; }
    if (match) {
      pendingBlanks = [];
      records.push({ cells: [match[1], match[2]], line: index + 1, raw: line, delimiter: match[1].length, searchRaw: true, continuations: 0 });
    }
    else if (records.length > 1) {
      const record = records.at(-1);
      const continuation = [...pendingBlanks, line].join('\n');
      record.cells[1] += '\n' + continuation;
      record.raw += '\n' + continuation;
      record.continuations += pendingBlanks.length + 1;
      pendingBlanks = [];
    }
  }
  return records;
}

const months = new Map(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((name, i) => [name, i + 1]));

export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let match, year, month, day;
  if ((match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(text))) {
    [, day, month, year] = match;
    month = months.get(month.toLowerCase());
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?(?: UTC)?)?$/.exec(text)) ||
    (match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/.exec(text))) {
    [, year, month, day] = match;
    if (match[4] !== undefined && (+match[4] > 23 || +match[5] > 59 || +(match[6] || 0) > 59)) return null;
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:,? (\d{1,2}):(\d{2}) (AM|PM))?$/i.exec(text))) {
    [, month, day, year] = match;
    year = +year + (+year >= 69 ? 1900 : 2000);
    if (match[4] !== undefined && (+match[4] < 1 || +match[4] > 12 || +match[5] > 59)) return null;
  } else return null;
  year = +year; month = +month; day = +day;
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(day) || day < 1 || day > days[month - 1]) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const schemas = {
  'profile.csv': ['First Name', 'Last Name', 'Headline'],
  'connections.csv': ['First Name', 'Last Name', 'Company', 'Position', 'URL', 'Connected On'],
  'messages.csv': ['CONVERSATION ID', 'CONVERSATION TITLE', 'FROM', 'TO', 'SENDER PROFILE URL', 'DATE', 'SUBJECT', 'CONTENT'],
  'job applications.csv': ['Company Name', 'Job Title', 'Job Url', 'Application Date'],
  'searchqueries.csv': ['Time', 'Search Query'],
  'ads clicked.csv': ['Ad clicked Date', 'Ad Title/Id'],
  'learning.csv': ['Content Title', 'Content Type', 'Content Last Watched Date (if viewed)', 'Content Completed At (if completed)'],
  'invitations.csv': ['From', 'To', 'Direction', 'Sent At'],
  'inferences_about_you.csv': ['Category', 'Type of inference', 'Description', 'Inference'],
  'ad_targeting.csv': [],
  'skills.csv': ['Name'],
};

const clean = value => String(value ?? '').trim();
const missingDate = value => !clean(value) || /^(N\/A|null)$/i.test(clean(value));
const basename = name => name.replaceAll('\\', '/').split('/').at(-1).toLowerCase();
const nonempty = row => row.some(cell => cell.trim() !== '');

export function buildArchive(files, label = 'LinkedIn export') {
  if (!Array.isArray(files)) throw new Error('Select CSV files from a LinkedIn export folder.');
  if (files.length > 500) throw new Error('Import supports at most 500 files. Select one export folder.');
  let total = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.text !== 'string') throw new Error('Each imported file needs a name and text content.');
    const bytes = encoder.encode(file.text).byteLength;
    if (bytes > 20 * MiB) throw new Error(`${file.name} exceeds the 20 MiB per-file import limit.`);
    total += bytes;
  }
  if (total > 100 * MiB) throw new Error('Export exceeds the 100 MiB total import limit.');
  const archive = { label, files: [], profile: { name: '', headline: '' }, connections: [], messages: [], jobs: [], searches: [], ads: [], learning: [], invitations: [], inferences: [], targeting: [], skills: [] };
  const seen = new Set();
  let supported = 0;
  for (const file of files) {
    const key = basename(file.name);
    const known = Object.hasOwn(schemas, key);
    if (known && seen.has(key)) throw new Error(`Duplicate supported source ${file.name}. Import only one copy of each source.`);
    if (known) { seen.add(key); supported++; }
    let records;
    try { records = key === 'searchqueries.csv' ? linkedInSearchRecords(file.text) : csvRecords(file.text); }
    catch (error) {
      if (known) throw new Error(`${file.name}: ${error.message}`);
      else {
        let headers = [];
        try { headers = csvRecords(file.text.split(/\r\n|\n|\r/, 1)[0])[0]?.cells ?? []; } catch {}
        archive.files.push({ name: file.name, headers, count: null, status: 'unsupported', issues: [`Could not parse this inventory-only file: ${error.message} Record count unavailable.`] });
        continue;
      }
    }
    records = records.filter(record => nonempty(record.cells));
    if (key === 'connections.csv') {
      const start = records.findIndex(record => record.cells[0] === 'First Name' && record.cells.includes('Connected On'));
      if (start < 0) throw new Error(`${file.name}: Cannot find the First Name / Connected On header. Select an original Connections.csv export.`);
      records = records.slice(start);
    }
    const headers = records.shift()?.cells ?? [];
    if (known) {
      const missing = schemas[key].filter(header => !headers.includes(header));
      if (!headers.length || !headers.some(Boolean) || missing.length) throw new Error(`${file.name}: Missing required headers${missing.length ? `: ${missing.join(', ')}` : ''}. Use an original LinkedIn CSV export.`);
      if (key !== 'ad_targeting.csv' && new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error(`${file.name}: Repeated column headers are ambiguous for this source.`);
    }
    const metadata = { name: file.name, headers, count: records.length, status: known ? 'ready' : 'unsupported', issues: [] };
    const extras = [];
    let reconstructed = 0, literalCommas = 0;
    if (records.some(record => record.searchRaw)) metadata.issues.push('LinkedIn raw search format: query text after each timestamp is preserved verbatim, including quote marks.');
    const continuations = records.reduce((sum, record) => sum + (record.continuations || 0), 0);
    if (continuations) metadata.issues.push(`${continuations} physical lines without a timestamp retained as query continuations; inspect source coverage.`);
    for (const record of records) {
      const row = record.cells;
      if (record.searchRaw && row[1].includes(',')) {
        extras.push({ row: record.line, literalCommas: row[1].split(',').length - 1 });
        literalCommas++;
      }
      if (row.length === headers.length) continue;
      if (key === 'searchqueries.csv' && headers.length === 2 && headers[0] === 'Time' && headers[1] === 'Search Query' && row.length > 2 && parseDate(row[0])) {
        extras.push({ row: record.line, extraCells: row.length - headers.length });
        record.cells = [row[0], record.raw.slice(record.delimiter + 1)];
        reconstructed++;
      } else if (key === 'learning.csv' && headers.at(-1) === '' && row.length === headers.length - 1) {
        record.cells = [...row, ''];
      } else if (!known) metadata.issues.push(`Record on line ${record.line} has ${row.length} cells; expected ${headers.length}. Inventoried without analysis.`);
      else throw new Error(`${file.name}: Record on line ${record.line} has ${row.length} cells; expected ${headers.length}. Check missing quotes or delimiters.`);
    }
    if (reconstructed) {
      metadata.issues.push(`${reconstructed} search queries reconstructed from extra comma-separated fields`);
    }
    if (literalCommas) metadata.issues.push(`${literalCommas} search queries contain literal commas; preserved as query text`);
    if (extras.length) metadata.extras = extras;
    const indexes = new Map(headers.map((header, index) => [header, index]));
    const get = (row, header) => row[indexes.get(header)] ?? '';
    let invalid = 0, missing = 0, invalidCompletion = 0;
    const date = value => {
      const result = parseDate(value);
      if (!result) { if (missingDate(value)) missing++; else invalid++; }
      return result;
    };
    for (const { cells: row } of records) {
      const value = header => get(row, header);
      switch (key) {
        case 'profile.csv':
          if (!archive.profile.name) archive.profile = { name: [clean(value('First Name')), clean(value('Last Name'))].filter(Boolean).join(' '), headline: value('Headline') };
          break;
        case 'connections.csv': archive.connections.push({ name: [clean(value('First Name')), clean(value('Last Name'))].filter(Boolean).join(' '), company: clean(value('Company')), position: value('Position'), url: clean(value('URL')), date: date(value('Connected On')) }); break;
        case 'messages.csv': {
          const messageDate = date(value('DATE'));
          const clock = / (\d{2}:\d{2}:\d{2}) UTC$/.exec(value('DATE'))?.[1];
          archive.messages.push({ id: value('CONVERSATION ID'), title: value('CONVERSATION TITLE'), from: value('FROM'), to: value('TO'), senderUrl: value('SENDER PROFILE URL'), date: messageDate, timestamp: messageDate && clock ? `${messageDate}T${clock}Z` : null, subject: value('SUBJECT'), content: value('CONTENT') });
          break;
        }
        case 'job applications.csv': archive.jobs.push({ company: value('Company Name'), title: value('Job Title'), url: clean(value('Job Url')), date: date(value('Application Date')) }); break;
        case 'searchqueries.csv': archive.searches.push({ query: value('Search Query'), date: date(value('Time')) }); break;
        case 'ads clicked.csv': archive.ads.push({ title: value('Ad Title/Id'), date: date(value('Ad clicked Date')) }); break;
        case 'learning.csv': {
          const completion = value('Content Completed At (if completed)');
          const completedDate = parseDate(completion);
          if (!completedDate && !missingDate(completion)) invalidCompletion++;
          archive.learning.push({ title: value('Content Title'), type: value('Content Type'), date: date(value('Content Last Watched Date (if viewed)')), completed: Boolean(completedDate) });
          break;
        }
        case 'invitations.csv': archive.invitations.push({ from: value('From'), to: value('To'), direction: value('Direction'), date: date(value('Sent At')) }); break;
        case 'inferences_about_you.csv': archive.inferences.push({ category: value('Category'), type: value('Type of inference'), description: value('Description'), value: value('Inference') }); break;
        case 'ad_targeting.csv':
          headers.forEach((header, index) => {
            if (!header) return;
            let item = archive.targeting.find(item => item.category === header);
            if (!item) { item = { category: header, values: [] }; archive.targeting.push(item); }
            if (row[index] !== '') item.values.push(row[index]);
          });
          break;
        case 'skills.csv': if (clean(value('Name'))) archive.skills.push(value('Name')); break;
      }
    }
    if (missing) metadata.issues.push(`${missing} records have missing dates; retained as undated`);
    if (invalid) metadata.issues.push(`${invalid} records have unrecognized or invalid dates; retained as undated`);
    if (invalidCompletion) metadata.issues.push(`${invalidCompletion} learning completion dates are unrecognized or invalid`);
    if (known && metadata.issues.length) metadata.status = 'warning';
    archive.files.push(metadata);
  }
  if (!supported) throw new Error('No supported LinkedIn sources found. Select files such as Connections.csv, messages.csv, Profile.csv or Skills.csv.');
  return archive;
}

export function groupCounts(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const name = clean(typeof key === 'function' ? key(row) : row[key]);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
}

export function filterYear(rows, year = 'all') {
  return year === 'all' ? rows : rows.filter(row => row.date?.slice(0, 4) === String(year));
}

export function periodSeries(rows, year = 'all') {
  const counts = new Map();
  if (year !== 'all') for (let month = 1; month <= 12; month++) counts.set(`${year}-${String(month).padStart(2, '0')}`, 0);
  for (const row of filterYear(rows, year)) {
    if (!row.date) continue;
    const label = row.date.slice(0, year === 'all' ? 4 : 7);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  if (year === 'all' && counts.size) {
    const years = [...counts.keys()].map(Number);
    for (let y = Math.min(...years); y <= Math.max(...years); y++) {
      const label = String(y).padStart(4, '0');
      if (!counts.has(label)) counts.set(label, 0);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count }));
}

export function coverage(rows) {
  const dates = rows.map(row => row.date).filter(Boolean).sort();
  return { first: dates[0] ?? null, last: dates.at(-1) ?? null, undated: rows.length - dates.length };
}

export const normalizedName = name => clean(name).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();

export function conversationGroups(messages, ownName) {
  const groups = new Map();
  const ids = new Set(messages.map(message => message.id).filter(id => clean(id)));
  messages.forEach((message, index) => {
    let id = clean(message.id) ? message.id : null;
    if (!id) {
      id = `missing-conversation-${index + 1}`;
      while (ids.has(id)) id += '-unknown';
      ids.add(id);
    }
    let group = groups.get(id);
    if (!group) {
      group = { id, title: message.title || '', participants: [], knownId: Boolean(clean(message.id)), count: 0, sent: 0, received: 0, unnamed: 0, lastDate: null, messages: [] };
      groups.set(id, group);
    }
    if (!group.title && message.title) group.title = message.title;
    group.count++;
    const sender = classifySender(message.from, ownName);
    if (sender === 'owner') group.sent++;
    else if (sender === 'other') group.received++;
    else if (sender === 'unnamed') group.unnamed++;
    for (const name of [message.from, ...String(message.to || '').split(/[,;]/)].map(clean).filter(Boolean)) {
      if (!group.participants.some(existing => normalizedName(existing) === normalizedName(name))) group.participants.push(name);
    }
    if (message.date && (!group.lastDate || message.date > group.lastDate)) group.lastDate = message.date;
    group.messages.push(message);
  });
  return [...groups.values()].map(group => ({ ...group, messages: group.messages.toSorted((a, b) => (a.timestamp ?? a.date ?? '9999').localeCompare(b.timestamp ?? b.date ?? '9999')) }))
    .sort((a, b) => b.count - a.count || (b.lastDate || '').localeCompare(a.lastDate || '') || a.id.localeCompare(b.id));
}

export const sourceNames = {connections:'Connections.csv',messages:'messages.csv',jobs:'Job Applications.csv',searches:'SearchQueries.csv',ads:'Ads Clicked.csv',learning:'Learning.csv',invitations:'Invitations.csv',inferences:'Inferences_about_you.csv',targeting:'Ad_Targeting.csv',skills:'Skills.csv'};
export const sourceFile = (archive, key) => archive.files.find(file => basename(file.name) === sourceNames[key]?.toLowerCase());
export function classifySender(name, ownName) {
  const sender = normalizedName(name), own = normalizedName(ownName);
  return !sender ? 'unnamed' : !own ? 'unattributed' : sender === own ? 'owner' : 'other';
}
