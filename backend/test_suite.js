// Set isolated test environment flags BEFORE importing config/models
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.resolve(__dirname, 'test_runner.sqlite');
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}
for (const suffix of ['-wal', '-shm']) {
  if (fs.existsSync(TEST_DB_PATH + suffix)) fs.unlinkSync(TEST_DB_PATH + suffix);
}

process.env.NODE_ENV = 'test';
process.env.USE_SQLITE = 'true';
process.env.SQLITE_PATH = TEST_DB_PATH;
process.env.USE_REDIS_MOCK = 'true';
process.env.PORT = '5055';
process.env.MIN_DELAY_BETWEEN_EMAILS_MS = '1500';

const http = require('http');
const assert = require('assert');
const { syncDatabase, EmailJob } = require('./src/models');
const app = require('./src/server');
const { reconcilePendingJobs } = require('./src/services/recoveryService');
const { processEmailJob } = require('./src/services/jobProcessorService');
const { processDueFallbackJobs } = require('./src/worker');

const API_PORT = 5055;
const SLACK_PORT = 5056;

function request(method, reqPath, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);
    if (cookie) headers['Cookie'] = cookie;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: API_PORT,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => {
          resBody += chunk;
        });
        res.on('end', () => {
          let parsed = resBody;
          try {
            parsed = JSON.parse(resBody);
          } catch (e) {
            // Leave raw HTML/text response intact
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runComprehensiveTests() {
  const startAll = Date.now();
  const benchmarks = {};
  const slackPayloads = [];

  const mockSlackServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => {
      raw += d;
    });
    req.on('end', () => {
      try {
        slackPayloads.push(JSON.parse(raw));
      } catch (e) {
        slackPayloads.push({ raw });
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });

  await new Promise((resolve) => mockSlackServer.listen(SLACK_PORT, '127.0.0.1', resolve));
  await syncDatabase();

  const server = await new Promise((resolve) => {
    const s = app.listen(API_PORT, '127.0.0.1', () => resolve(s));
  });

  try {
    console.log('================================================================');
    console.log('🧪 COMPREHENSIVE END-TO-END VERIFICATION — GMAIL SCHEDULER');
    console.log('================================================================');

    // ----------------------------------------------------------------
    // SUITE 1: Auth, OAuth Guard, JWT Cookie & Logout Security
    // ----------------------------------------------------------------
    console.log('\n--- [1/7] Authentication, Google OAuth Guard & JWT Cookie ---');
    const health = await request('GET', '/api/health');
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.status, 'healthy');

    const unauth = await request('GET', '/api/emails/scheduled');
    assert.strictEqual(unauth.statusCode, 401);

    const providers = await request('GET', '/api/auth/providers');
    assert.strictEqual(providers.statusCode, 200);

    const googleRedirect = await request('GET', '/api/auth/google');
    assert.strictEqual(googleRedirect.statusCode, 302);
    if (providers.body.googleConfigured) {
      assert.ok(
        googleRedirect.headers.location.includes('accounts.google.com/o/oauth2'),
        'Configured OAuth must redirect to Google consent URL'
      );
    } else {
      assert.ok(googleRedirect.headers.location.includes('error=google_not_configured'));
    }

    const login = await request('POST', '/api/auth/dev-login', {
      email: 'qa.architect@gmail.com',
      name: 'QA Architect',
    });
    assert.strictEqual(login.statusCode, 200);
    const setCookieHeader = login.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    assert.ok(rawCookie.includes('HttpOnly'));
    assert.ok(rawCookie.includes('SameSite=Lax'));
    const cookie = rawCookie.split(';')[0];

    const me = await request('GET', '/api/auth/me', null, cookie);
    assert.strictEqual(me.statusCode, 200);
    assert.strictEqual(me.body.email, 'qa.architect@gmail.com');

    // Logout flow check using a disposable second session cookie
    const tempLogin = await request('POST', '/api/auth/dev-login', {
      email: 'logout.check@gmail.com',
      name: 'Logout Check',
    });
    const tempCookie = (Array.isArray(tempLogin.headers['set-cookie'])
      ? tempLogin.headers['set-cookie'][0]
      : tempLogin.headers['set-cookie']
    ).split(';')[0];
    const logoutRes = await request('POST', '/api/auth/logout', null, tempCookie);
    assert.strictEqual(logoutRes.statusCode, 200);
    const clearedHeader = JSON.stringify(logoutRes.headers['set-cookie'] || []);
    assert.ok(clearedHeader.includes('token=;'));
    console.log('✅ SUITE 1 PASSED: Unauth 401, OAuth fallback redirect, HTTP-only JWT cookie, Logout.');

    // ----------------------------------------------------------------
    // SUITE 2: Multi-Sender Provisioning & Gmail SMTP Config Validation
    // ----------------------------------------------------------------
    console.log('\n--- [2/7] Multi-Sender (Ethereal + Gmail SMTP Schema/Validation) ---');
    const sendersRes = await request('GET', '/api/senders', null, cookie);
    assert.strictEqual(sendersRes.statusCode, 200);
    assert.ok(sendersRes.body.length >= 1);
    const primarySender = sendersRes.body[0];
    assert.strictEqual(primarySender.smtp_pass, undefined, 'SMTP password must never be leaked');

    const badSmtp = await request(
      'POST',
      '/api/senders/smtp',
      { email: 'bad@gmail.com', appPassword: '' },
      cookie
    );
    assert.strictEqual(badSmtp.statusCode, 400);

    const customGmail = await request(
      'POST',
      '/api/senders/smtp',
      {
        email: 'real.test.sender@gmail.com',
        displayName: 'Real Gmail Configured',
        appPassword: 'abcd efgh ijkl mnop',
        hourlyLimit: 150,
        provider: 'gmail',
        skipVerify: true, // Real Gmail credential handshake tested separately when user provides credentials
      },
      cookie
    );
    assert.strictEqual(customGmail.statusCode, 201);
    assert.strictEqual(customGmail.body.provider, 'gmail');
    assert.strictEqual(customGmail.body.smtp_host, 'smtp.gmail.com');
    assert.strictEqual(customGmail.body.smtp_port, 465);

    const delRes = await request('DELETE', `/api/senders/${customGmail.body.id}`, null, cookie);
    assert.strictEqual(delRes.statusCode, 200);

    // Create a second independent Ethereal sender for burst rate-limit tests
    const burstSenderRes = await request(
      'POST',
      '/api/senders/ethereal',
      { displayName: 'Burst Test Sender', hourlyLimit: 2 },
      cookie
    );
    assert.strictEqual(burstSenderRes.statusCode, 201);
    const burstSender = burstSenderRes.body;
    console.log(`✅ SUITE 2 PASSED: Primary (${primarySender.email}) & Burst (${burstSender.email}) Ethereal senders + Gmail SMTP route verified.`);

    // ----------------------------------------------------------------
    // SUITE 3: Live Ethereal SMTP Delivery + Dual Idempotency Guard
    // ----------------------------------------------------------------
    console.log('\n--- [3/7] Live Scheduling, Real Ethereal Delivery & Idempotency ---');
    const tSchedStart = Date.now();
    const schedLive = await request(
      'POST',
      '/api/emails/schedule',
      {
        senderId: primarySender.id,
        recipients: ['live.alpha@example.com', 'live.beta@example.com'],
        subject: 'LiveEtherealDelivery Subject',
        body: 'Testing live SMTP handshake with Nodemailer & Ethereal Preview URL.',
        startTime: new Date().toISOString(),
        delayMs: 200,
        hourlyLimit: 10,
      },
      cookie
    );
    benchmarks.scheduleApiMs = Date.now() - tSchedStart;
    assert.strictEqual(schedLive.statusCode, 201);
    assert.strictEqual(schedLive.body.count, 2);

    for (const job of schedLive.body.jobs) {
      assert.ok(job.bull_job_id.startsWith('email-'));
      assert.ok(!job.bull_job_id.includes(':'), 'BullMQ jobId must contain zero colons');
    }

    // Wait briefly so 200ms offset elapses, then dispatch via real worker loop
    await sleep(350);
    const tWorkerStart = Date.now();
    await processDueFallbackJobs();
    benchmarks.etherealSendMs = Date.now() - tWorkerStart;

    const sentRes = await request('GET', '/api/emails/sent', null, cookie);
    assert.strictEqual(sentRes.statusCode, 200);
    assert.strictEqual(sentRes.body.total, 2);
    for (const email of sentRes.body.emails) {
      assert.strictEqual(email.status, 'SENT');
      assert.ok(email.ethereal_preview_url && email.ethereal_preview_url.startsWith('https://ethereal.email/'));
    }

    // Re-running job processor on already SENT job must be skipped cleanly
    const dupCheck = await processEmailJob({ emailJobId: sentRes.body.emails[0].id });
    assert.strictEqual(dupCheck.skipped, true);
    assert.strictEqual(dupCheck.reason, 'already_sent_or_missing');
    console.log(`✅ SUITE 3 PASSED: Delivered 2 real Ethereal emails (${benchmarks.etherealSendMs}ms), preview URLs captured, duplicate blocked.`);

    // ----------------------------------------------------------------
    // SUITE 4: Burst Load, Rate Limiting Overflow & Slack Alert Dedupe
    // ----------------------------------------------------------------
    console.log('\n--- [4/7] Burst Rate Limiting (limit=2, batch=6) & Slack Deduplication ---');
    const slackConnect = await request(
      'POST',
      '/api/slack/manual',
      {
        webhookUrl: `http://127.0.0.1:${SLACK_PORT}/services/test-webhook`,
        channelName: '#qa-rate-alerts',
        teamName: 'ReachInbox QA',
      },
      cookie
    );
    assert.strictEqual(slackConnect.statusCode, 200);

    const burstRecipients = [
      'b1@rate.test',
      'b2@rate.test',
      'b3@rate.test',
      'b4@rate.test',
      'b5@rate.test',
      'b6@rate.test',
    ];
    const burstRes = await request(
      'POST',
      '/api/emails/schedule',
      {
        senderId: burstSender.id,
        recipients: burstRecipients,
        subject: 'RateLimitBurst Campaign',
        body: 'Overflow burst body text for Elasticsearch search.',
        startTime: new Date().toISOString(),
        delayMs: 0,
        hourlyLimit: 2,
      },
      cookie
    );
    assert.strictEqual(burstRes.statusCode, 201);
    assert.strictEqual(burstRes.body.count, 6);

    // Run worker batches (concurrency=5 default, so two passes cover all 6 jobs)
    await processDueFallbackJobs();
    await processDueFallbackJobs();

    const burstRecords = await EmailJob.findAll({
      where: { sender_id: burstSender.id },
      order: [['scheduled_at', 'ASC']],
    });
    const burstSent = burstRecords.filter((r) => r.status === 'SENT');
    const burstDelayed = burstRecords.filter((r) => r.status === 'DELAYED_RATE_LIMIT');

    assert.strictEqual(burstSent.length, 2, 'Exactly 2 emails should send in current hour');
    assert.strictEqual(burstDelayed.length, 4, 'Remaining 4 emails must defer cleanly to next hour');

    // Verify overflow stagger timestamps increase strictly
    for (let i = 1; i < burstDelayed.length; i++) {
      const prevTs = new Date(burstDelayed[i - 1].scheduled_at).getTime();
      const currTs = new Date(burstDelayed[i].scheduled_at).getTime();
      assert.ok(currTs > prevTs, 'Deferred timestamps must be staggered forward');
    }

    // Verify Slack webhook received EXACTLY 1 alert for all 4 overflows in this hour
    assert.strictEqual(
      slackPayloads.length,
      1,
      `Expected exactly 1 deduplicated Slack alert, got ${slackPayloads.length}`
    );
    assert.ok(slackPayloads[0].text.includes(burstSender.email));

    // Disconnect Slack and confirm graceful handling with 0 additional alerts/crashes
    const slackDisconnect = await request('DELETE', '/api/slack/disconnect', null, cookie);
    assert.strictEqual(slackDisconnect.statusCode, 200);
    const extraBurst = await request(
      'POST',
      '/api/emails/schedule',
      {
        senderId: burstSender.id,
        recipients: ['b7@rate.test'],
        subject: 'PostDisconnect Overflow',
        body: 'Should defer safely without Slack crash',
        startTime: new Date().toISOString(),
        delayMs: 0,
        hourlyLimit: 2,
      },
      cookie
    );
    assert.strictEqual(extraBurst.statusCode, 201);
    await processDueFallbackJobs();
    assert.strictEqual(slackPayloads.length, 1);
    console.log('✅ SUITE 4 PASSED: 2 SENT, 5 DELAYED_RATE_LIMIT (staggered), exactly 1 Slack alert delivered & disconnect safe.');

    // ----------------------------------------------------------------
    // SUITE 5: Restart Persistence & Schema Migration Survival
    // ----------------------------------------------------------------
    console.log('\n--- [5/7] Server Restart Persistence & Idempotent Schema Sync ---');
    const restartSched = await request(
      'POST',
      '/api/emails/schedule',
      {
        senderId: primarySender.id,
        recipients: ['restart.one@example.com', 'restart.two@example.com'],
        subject: 'RestartRecoveryVerification',
        body: 'Verifying survival across server + DB re-initialization',
        startTime: new Date(Date.now() + 1200).toISOString(),
        delayMs: 100,
        hourlyLimit: 20,
      },
      cookie
    );
    assert.strictEqual(restartSched.statusCode, 201);

    // Simulate process shutdown + boot recovery (`syncDatabase()` + `reconcilePendingJobs()`)
    await syncDatabase(); // Previously crashed SQLite with FK DROP TABLE error!
    const recoverySummary = await reconcilePendingJobs();
    assert.ok(recoverySummary.totalPending >= 2);

    // Wait past scheduled timestamp and dispatch
    await sleep(1500);
    await processDueFallbackJobs();

    const recoveredJobs = await EmailJob.findAll({
      where: { recipient_email: ['restart.one@example.com', 'restart.two@example.com'] },
    });
    assert.strictEqual(recoveredJobs.length, 2);
    assert.ok(recoveredJobs.every((j) => j.status === 'SENT'));
    console.log('✅ SUITE 5 PASSED: SQLite re-sync with FK data + reconcilePendingJobs() + 100% delivery with 0 duplicates.');

    // ----------------------------------------------------------------
    // SUITE 6: Search, Status Filtering, Stats & Pagination
    // ----------------------------------------------------------------
    console.log('\n--- [6/7] Search, Status Filter, Stats & Pagination ---');
    const tSearchStart = Date.now();
    const searchBySubj = await request('GET', '/api/emails/search?q=RateLimitBurst', null, cookie);
    benchmarks.searchApiMs = Date.now() - tSearchStart;
    assert.strictEqual(searchBySubj.statusCode, 200);
    assert.strictEqual(searchBySubj.body.total, 6);

    const searchByRecip = await request('GET', '/api/emails/search?q=restart.one@example.com', null, cookie);
    assert.strictEqual(searchByRecip.statusCode, 200);
    assert.strictEqual(searchByRecip.body.total, 1);

    const searchByBody = await request('GET', '/api/emails/search?q=Nodemailer&status=SENT', null, cookie);
    assert.strictEqual(searchByBody.statusCode, 200);
    assert.strictEqual(searchByBody.body.total, 2);

    const filterDelayed = await request('GET', '/api/emails/search?status=DELAYED_RATE_LIMIT', null, cookie);
    assert.strictEqual(filterDelayed.statusCode, 200);
    assert.strictEqual(filterDelayed.body.total, 5);

    const noResults = await request('GET', '/api/emails/search?q=ZZZNonExistentToken999', null, cookie);
    assert.strictEqual(noResults.statusCode, 200);
    assert.strictEqual(noResults.body.total, 0);

    const paginated = await request('GET', '/api/emails/sent?page=1&limit=2', null, cookie);
    assert.strictEqual(paginated.statusCode, 200);
    assert.strictEqual(paginated.body.emails.length, 2);
    assert.ok(paginated.body.totalPages >= 3);

    const stats = await request('GET', '/api/emails/stats', null, cookie);
    assert.strictEqual(stats.statusCode, 200);
    assert.strictEqual(stats.body.sent, 6); // 2 live + 2 burst + 2 restart
    assert.strictEqual(stats.body.rateLimited, 5);
    console.log(`✅ SUITE 6 PASSED: Search (${benchmarks.searchApiMs}ms), status filters, empty search, pagination, stats accurate.`);

    // ----------------------------------------------------------------
    // SUITE 7: Queue Inspector (/admin/queues) & Metrics
    // ----------------------------------------------------------------
    console.log('\n--- [7/7] Queue Inspector UI (/admin/queues) ---');
    const queueUi = await request('GET', '/admin/queues');
    assert.strictEqual(queueUi.statusCode, 200);
    assert.ok(String(queueUi.body).includes('email-queue Inspector'));
    assert.ok(String(queueUi.body).includes('RateLimitBurst Campaign'));
    console.log('✅ SUITE 7 PASSED: /admin/queues rendered live job states cleanly.');

    const totalDuration = Date.now() - startAll;
    console.log('\n================================================================');
    console.log(`🎉 ALL 7 VERIFICATION SUITES PASSED IN ${totalDuration}ms`);
    console.log('📊 Measured Benchmarks:', benchmarks);
    console.log('================================================================\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => mockSlackServer.close(resolve));
  }
}

runComprehensiveTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
