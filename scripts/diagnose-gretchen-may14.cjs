#!/usr/bin/env node
// Diagnose why Gretchen Stewart isn't appearing after "Sync Trainers from Toast" at Westfield.
// Walks the exact same path syncTrainersFromToast() walks and reports which gate she fails.

const admin = require('firebase-admin');
const https = require('https');

const SERVICE_ACCOUNT = require('/Users/adamstandridge/Documents/projects/service-account.json');
const WESTFIELD_GUID = '86326c13-2905-455f-924a-a970ba974785';
const API_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net';
const TARGET = { first: 'gretchen', last: 'stewart' };

admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) });
const db = admin.firestore();

function httpJson(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('=== Gretchen Stewart sync diagnostic — Westfield ===\n');

  console.log('[1] Authenticating with Toast via toastAuth cloud function...');
  const authRes = await httpJson('POST', `${API_BASE}/toastAuth`, {});
  if (authRes.status !== 200 || !authRes.body?.accessToken) {
    console.error('  FAIL — toastAuth response:', authRes);
    process.exit(1);
  }
  const token = authRes.body.accessToken;
  console.log('  OK, token acquired.\n');

  console.log('[2] Fetching Westfield employees + jobs from Toast...');
  const [empRes, jobRes] = await Promise.all([
    httpJson('GET', `${API_BASE}/toastEmployees?restaurantGuid=${WESTFIELD_GUID}`),
    httpJson('GET', `${API_BASE}/toastJobs?restaurantGuid=${WESTFIELD_GUID}`),
  ]);
  const employees = empRes.body?.data ?? empRes.body?.employees ?? empRes.body ?? [];
  const jobs = jobRes.body?.data ?? jobRes.body?.jobs ?? jobRes.body ?? [];
  if (!Array.isArray(employees)) {
    console.error('  FAIL — employees response not an array:', empRes);
    process.exit(1);
  }
  console.log(`  Got ${employees.length} employees, ${Array.isArray(jobs) ? jobs.length : '?'} jobs.\n`);

  console.log('[3] Building jobGuid -> title map (same as syncTrainersFromToast)...');
  const jobMap = {};
  if (Array.isArray(jobs)) {
    jobs.forEach((j) => {
      const guid = j.guid ?? j.id;
      const title = j.title ?? j.name ?? '';
      if (guid) jobMap[String(guid)] = title;
    });
  }
  console.log(`  ${Object.keys(jobMap).length} jobs in map.`);
  console.log('  Titles containing "trainer":',
    Object.entries(jobMap).filter(([_, t]) => String(t).toLowerCase().includes('trainer'))
  );
  console.log();

  console.log('[4] Locating Gretchen by name...');
  const matches = employees.filter((e) => {
    const f = String(e.firstName ?? e.first_name ?? '').toLowerCase();
    const l = String(e.lastName ?? e.last_name ?? '').toLowerCase();
    return f.includes(TARGET.first) || l.includes(TARGET.last) ||
           (f + ' ' + l).includes('gretchen') || (f + ' ' + l).includes('stewart');
  });
  if (!matches.length) {
    console.error('  FAIL — no employee at Westfield matches "Gretchen" or "Stewart".');
    console.error('  This means Toast does not have her as an active employee at this location.');
    console.error('  Either she is at a different location, or her record was deleted.');
    process.exit(0);
  }
  console.log(`  Found ${matches.length} match(es) at Westfield:`);
  matches.forEach((e, i) => {
    console.log(`\n  --- Match ${i + 1} ---`);
    console.log('  guid:', e.guid);
    console.log('  externalEmployeeId:', e.externalEmployeeId ?? '(none)');
    console.log('  firstName / lastName:', e.firstName, '/', e.lastName);
    console.log('  email:', e.email ?? '(none)');
    console.log('  deleted:', e.deleted, '(if true, sync skips at line 75)');
    console.log('  deletedDate:', e.deletedDate ?? '(n/a)');
    const refs = e.jobReferences ?? e.jobs ?? [];
    console.log('  jobReferences:');
    if (!refs.length) console.log('    (empty — no jobs assigned)');
    refs.forEach((ref, j) => {
      const jGuid = ref.guid ?? ref.jobGuid ?? ref;
      const titleFromMap = jobMap[String(jGuid)];
      const titleFromRef = ref.title ?? ref.name;
      const resolved = titleFromMap ?? titleFromRef ?? '';
      const isTrainer = String(resolved).toLowerCase().includes('trainer');
      console.log(`    [${j}] jobGuid=${jGuid}`);
      console.log(`        title from jobMap: ${titleFromMap ?? '(NOT in Westfield jobs list)'}`);
      console.log(`        title on ref:      ${titleFromRef ?? '(none)'}`);
      console.log(`        resolved title:    "${resolved}"`);
      console.log(`        contains "trainer"? ${isTrainer ? 'YES ✓' : 'NO ✗'}`);
    });
  });

  console.log('\n[5] Running the actual filter logic from ToastSyncService.filterTrainersFromEmployees...');
  const passed = matches.filter((emp) => {
    if (emp.deleted === true) return false;
    const refs = emp.jobReferences ?? emp.jobs ?? [];
    for (const ref of refs) {
      const jGuid = ref.guid ?? ref.jobGuid ?? ref;
      const title = jobMap[String(jGuid)] ?? ref.title ?? ref.name ?? '';
      if (title && String(title).toLowerCase().includes('trainer')) return true;
    }
    return false;
  });
  console.log(`  ${passed.length}/${matches.length} pass the trainer filter.`);

  if (!passed.length) {
    console.log('\n  >>> ROOT CAUSE CANDIDATE: she fails the trainer filter <<<');
    console.log('  Either deleted=true, or no jobReference has a title containing "trainer".');
  }

  console.log('\n[6] Checking Firestore trainers/ collection for existing docs by toastGuid...');
  for (const e of matches) {
    const guid = String(e.guid);
    const docByGuidId = await db.collection('trainers').doc(guid).get();
    const queryByField = await db.collection('trainers').where('toastGuid', '==', guid).get();
    console.log(`\n  toastGuid ${guid}:`);
    if (docByGuidId.exists) {
      const d = docByGuidId.data();
      console.log(`    [doc-id=guid] EXISTS  status=${d.status ?? '(none)'} archived=${d.archived ?? '(none)'} firstName=${d.firstName} lastName=${d.lastName}`);
      if (d.status === 'archived' || d.archived === true) {
        console.log('    >>> STICKY-ARCHIVE GUARD WILL SKIP HER (ToastSyncService.js:162) <<<');
      }
    } else {
      console.log('    [doc-id=guid] not found');
    }
    if (!queryByField.empty) {
      queryByField.docs.forEach((doc) => {
        const d = doc.data();
        console.log(`    [legacy doc, id=${doc.id}] status=${d.status ?? '(none)'} archived=${d.archived ?? '(none)'} firstName=${d.firstName} lastName=${d.lastName}`);
        if (d.status === 'archived' || d.archived === true) {
          console.log('    >>> STICKY-ARCHIVE GUARD WILL SKIP HER (ToastSyncService.js:162) <<<');
        }
      });
    } else {
      console.log('    [legacy doc by toastGuid field] none');
    }
  }

  console.log('\n[7] Checking Firestore staffAccounts for Gretchen entries...');
  const cfg = await db.collection('config').doc('staffAccounts').get();
  const accts = cfg.exists ? (cfg.data().accounts || cfg.data()) : {};
  const hits = [];
  for (const [k, v] of Object.entries(accts)) {
    if (!v || typeof v !== 'object') continue;
    const name = String(v.name ?? '').toLowerCase();
    if (name.includes('gretchen') || name.includes('stewart')) hits.push({ key: k, ...v });
  }
  if (!hits.length) {
    console.log('  No staffAccounts entry mentions Gretchen/Stewart.');
  } else {
    hits.forEach((h) => {
      console.log(`  key=${h.key}  role=${h.role}  store=${h.store}  archived=${h.archived ?? false}  toastGuid=${h.toastGuid ?? '(none)'}  name=${h.name}`);
      if (h.archived) console.log('    >>> staffAccounts STICKY-ARCHIVE WILL SKIP HER (ToastSyncService.js:224) <<<');
    });
  }

  console.log('\n=== Done. Verdict above. ===');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
