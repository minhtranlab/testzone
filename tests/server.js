// Harness server: serves the Apps Script HTML (template includes resolved) + /rpc → mocked google.script.run.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas');

const APP = process.env.APP_DIR || require('./paths').APP;
const DATA = process.env.DATA_DIR || require('./paths').WORK + '/gas';

function initialTabs() {
  return {
    README: [['Test Zone – Data']],
    Interpretation: [['Kiểu / cờ', 'Điều kiện', 'Ý nghĩa', 'Chiến lược dạy gợi ý']],
    Student_Report: [['session_id', 'student_code', 'form_id', 'attempt_no', 'submitted_at', 'total_correct', 'percent', 'weakest_topics', 'main_error_profile', 'timing_pattern', 'summary']],
    Topic_Summary: [['student_code', 'form_id', 'unit', 'topic', 'topic_name', 'n_attempted', 'n_correct', 'accuracy', 'avg_pace_ratio', 'n_fast_wrong', 'n_slow_wrong', 'n_slow_right', 'n_blank', 'n_changed_R_to_W', 'verdict', 'updated_at']],
    Students: [['student_code', 'name', 'track', 'active', 'note'],
      ['T01', 'Test Student', 'AP Calc AB', 'Yes', ''], ['T02', 'Locked Student', 'AP Calc AB', 'No', ''], ['T03', 'SAT Only', 'SAT', 'Yes', ''],
      ['T04', 'Second Student', 'AP', 'Yes', ''], ['T05', 'Third', 'AP Calculus AB', 'Yes', ''], ['T06', 'Fourth', 'AP Calc AB', 'Yes', ''],
      ['T07', 'Fifth', 'AP Calc AB', 'Yes', ''], ['T08', 'Sixth', 'AP Calc AB', 'Yes', ''], ['T09', 'Seventh', 'AP Calc AB', 'Yes', '']],
    Sessions: [['session_id', 'student_code', 'form_id', 'attempt_no', 'started_at', 'submitted_at', 'status', 'score_A', 'score_B', 'total_correct', 'total_questions', 'percent', 'time_used_A_min', 'time_used_B_min', 'n_blank', 'n_flagged', 'device']],
    Responses: [['session_id', 'student_code', 'form_id', 'attempt_no', 'qid', 'part', 'display_no', 'unit', 'topic', 'final_answer', 'correct', 'first_answer', 'n_changes', 'change_pattern', 'eliminated', 'ever_marked', 'final_marked', 'visits', 'time_total_sec', 'time_first_visit_sec', 'pace_ratio', 'order_first_seen', 'calc_used', 'profile', 'flags', 'tutor_note']],
    Events: [['session_id', 'part', 't_ms', 'qid', 'type', 'value', 'logged_at']],
    Questions: [['qid', 'form_id', 'part', 'display_no', 'orig_no', 'key', 'unit', 'topic', 'topic_name', 'topic2', 'practice', 'representation', 'difficulty', 'tag_status']],
    Forms: [['form_id', 'exam', 'part', 'part_title', 'n_questions', 'time_limit_min', 'calculator', 'source'],
      ['APCAB-2012', 'AP Calculus AB', 'A', 'Section I, Part A', '28', '55', 'No', 'AP Calculus AB Practice Exam 2012'],
      ['APCAB-2012', 'AP Calculus AB', 'B', 'Section I, Part B', '17', '50', 'Yes', 'AP Calculus AB Practice Exam 2012'],
      ['MOCK-AP45', 'AP Calculus AB', 'A', 'Section I, Part A', '28', '55', 'No', 'mock'],
      ['MOCK-AP45', 'AP Calculus AB', 'B', 'Section I, Part B', '17', '50', 'Yes', 'mock'],
      ['MOCK-APCAB', 'AP Calculus AB', 'A', 'Section I, Part A', '3', '6', 'No', 'mock'],
      ['MOCK-APCAB', 'AP Calculus AB', 'B', 'Section I, Part B', '1', '4', 'Yes', 'mock']],
    Settings: [['key', 'value', 'meaning'], ['app_name', 'Test Zone', ''], 
      ['valid_min_time_ratio', process.env.STRICT_VALID ? '0.3' : '0', ''], ['valid_quick_ratio', process.env.STRICT_VALID ? '0.3' : '1.01', ''],
      ['valid_blank_ratio', process.env.STRICT_VALID ? '0.3' : '1.01', ''], ['unit_slow_ratio', '0.4', ''], ['fast_ratio', '0.5', ''], ['slow_ratio', '1.5', ''], ['guess_window_sec', '60', ''],
      ['guess_min_time_sec', '15', ''], ['weak_accuracy', '0.6', ''], ['min_questions_for_verdict', '2', ''], ['autosave_sec', '60', ''],
      ['five_min_warning_sec', '300', ''], ['desmos_api_key', '', ''], ['show_results', 'score_and_right_wrong', '']],
    Dictionary: [['tab', 'column', 'meaning', 'example']]
  };
}

function page() {
  let html = fs.readFileSync(path.join(APP, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (m, n) => {
    let s = fs.readFileSync(path.join(APP, n + '.html'), 'utf8');
    if (n === 'Client') s = MOCK_RUN + s;
    return s;
  });
  return html;
}
const MOCK_RUN = `<script>
(function(){
  function runner(succ, fail){ return new Proxy({}, { get: function(_, name){
    if (name === 'withSuccessHandler') return function(f){ return runner(f, fail); };
    if (name === 'withFailureHandler') return function(f){ return runner(succ, f); };
    return function(){ var args = Array.prototype.slice.call(arguments);
      fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn: name, args: args }) })
        .then(function(r){ if (!r.ok) throw new Error('NetworkError: ' + r.status); return r.json(); })
        .then(function(j){ setTimeout(function(){ if (j.error) { fail && fail(new Error(j.error)); } else { succ && succ(j.result); } }, 0); })
        .catch(function(e){ fail && fail(e); });
    }; } }); }
  window.google = { script: { run: runner(null, null), url: { getLocation: function (cb) {
    var p = {}; new URLSearchParams(location.search).forEach(function (v, k) { p[k] = v; }); setTimeout(function () { cb({ parameter: p }); }, 0); } } } };
})();
</script>`;

function start(port) {
  const st = { gas: createGas(APP, DATA, initialTabs()), offline: false, rpcLog: [], latency: 0 };
  st.reset = () => { st.gas = createGas(APP, DATA, initialTabs()); st.rpcLog = []; };
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page()); return; }
    if (req.url === '/rpc' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        if (st.offline) { res.writeHead(503); res.end('offline'); return; }
        const { fn, args } = JSON.parse(body);
        let out;
        try { out = { result: st.gas.call(fn, args) }; } catch (e) { out = { error: e.message }; if (!/^(LOGIN|SESSION|FORM)/.test(e.message)) console.error('RPC error', fn, e.stack); }
        const txt = JSON.stringify(out);
        st.rpcLog.push({ fn, req: body.length, res: txt });
        setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(txt); }, st.latency);
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise(r => server.listen(port, () => r({ server, st })));
}

module.exports = { start, initialTabs };
if (require.main === module) start(8080).then(() => console.log('http://localhost:8080'));
