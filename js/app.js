/* app.js — screens + quiz runtime (four question types, resume, palette, review, dashboard, timer) */
const KEYS = ['A','B','C','D','E','F','G'];
const SECS_PER_Q = 90*60/65;              // real exam pace: 90 minutes for 65 questions
const MODE_LABELS = {study:'Practice by topic', quick:'Quick test', full:'Full mock exam', daily:"Today's 10",
                     review_wrong:'Practise mistakes', review_marks:'Bookmarks'};
const TYPE_HINT = {multi:n=>`Select ${['','ONE','TWO','THREE','FOUR'][n]||n}`, order:()=>'Put in order', match:()=>'Match each item'};

let state = null, timerId = null;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function rich(s){ return esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n/g,'<br>'); }
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('#'+id).classList.add('active'); window.scrollTo(0,0);
}
function fmtTime(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}
const scaled = (c, n) => n ? Math.round(100 + 900*c/n) : 100;
const PASS = () => Bank.taxonomy().exam.pass_score;
const taskName = k => (Bank.taxonomy().tasks[k]||{}).name || k;
const domName = k => (Bank.taxonomy().domains[k]||{}).name || k;
const modeLabel = m => MODE_LABELS[m] || m;

/* ---------- dates (device-local) ---------- */
function dayStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const todayStr = () => dayStr(new Date());
function prevDay(s){ const [y,m,d] = s.split('-').map(Number); return dayStr(new Date(y, m-1, d-1)); }
function daysToExam(){
  const ex = Store.getExamDate(); if(!ex) return null;
  const [y,m,d] = ex.split('-').map(Number), now = new Date();
  return Math.round((new Date(y,m-1,d) - new Date(now.getFullYear(), now.getMonth(), now.getDate()))/86400000);
}

/* ================= HOME ================= */
function renderHome(){ renderDaily(); renderResume(); renderReadiness(); renderReviewButtons(); renderDashboard(); renderHistory(); $('#exam-date').value = Store.getExamDate(); }

function renderResume(){
  const r = Store.getResume(), el = $('#resume-banner');
  if(!r){ el.style.display='none'; el.innerHTML=''; return; }
  const done = r.questions.filter((q,i)=>Bank.isAnswered(q, r.answers[i])).length;
  el.style.display = 'block';
  el.innerHTML = `<div class="resume-card"><div><strong>▶ Unfinished ${esc(modeLabel(r.mode))}</strong>
    <div class="resume-sub">${done}/${r.questions.length} answered · ${fmtTime(r.limit - r.elapsed)} left</div></div>
    <div class="resume-actions"><button class="btn-primary" id="resume-yes">Resume</button>
    <button class="btn-ghost btn-small" id="resume-no">Discard</button></div></div>`;
  $('#resume-yes').onclick = resumeTest;
  $('#resume-no').onclick = ()=>{ if(confirm('Discard the unfinished test?')){ Store.clearResume(); renderResume(); } };
}

function renderDaily(){
  const today = todayStr(), rec = Store.getDaily(today), streak = Store.dailyStreak(today, prevDay), left = daysToExam();
  const examLine = left!==null && left>=0 ? ` · ${left===0 ? 'exam day!' : left+' days to your exam'}` : '';
  $('#daily-card').classList.toggle('done', !!rec);
  $('#daily-sub').textContent = rec ? `Done today: ${rec.score}/${rec.total} · tap to practise again` : `10 questions a day across all 5 domains${examLine}`;
  $('#daily-streak').textContent = streak ? `🔥 ${streak}` : 'Start →';
}

/* Readiness: the last full mocks against the 700 pass mark */
function renderReadiness(){
  const mocks = Store.allHistory().filter(h=>h.mode==='full' && h.scaled);
  const el = $('#readiness');
  if(!mocks.length){
    el.innerHTML = `<div class="ready-card"><div class="ready-head">🎯 Exam readiness</div>
      <div class="ready-sub">Take a full mock to see where you stand. Pass mark: ${PASS()}/1000.</div></div>`;
    return;
  }
  const last3 = mocks.slice(0,3), avg = Math.round(last3.reduce((s,h)=>s+h.scaled,0)/last3.length);
  const ready = mocks.length>=2 && mocks[0].scaled>=800 && mocks[1].scaled>=800;
  const verdict = ready ? '✅ Ready to book: your last two mocks are 800+'
    : avg>=PASS() ? '🟡 Passing on average. Aim for two mocks in a row at 800+ before booking'
    : '🔴 Below the pass mark. Work on your weak areas below, then retake a mock';
  const pos = s => Math.max(0, Math.min(100, (s-100)/9));
  el.innerHTML = `<div class="ready-card"><div class="ready-head">🎯 Exam readiness <span class="ready-avg">${avg}<small>/1000 avg of last ${last3.length}</small></span></div>
    <div class="ready-track"><div class="ready-pass" style="left:${pos(PASS())}%"><span>${PASS()}</span></div>
      ${last3.map((h,i)=>`<div class="ready-dot ${i===0?'latest':''}" style="left:${pos(h.scaled)}%" title="${h.scaled}"></div>`).join('')}</div>
    <div class="ready-sub">${verdict}</div></div>`;
}

function renderReviewButtons(){
  const w = Store.allWrong().filter(id=>Bank.byId(id)).length, b = Store.allBookmarks().filter(id=>Bank.byId(id)).length;
  $('#review-wrong-count').textContent = w; $('#review-mark-count').textContent = b;
  $('#review-wrong').classList.toggle('disabled-card', !w); $('#review-marks').classList.toggle('disabled-card', !b);
}

function renderDashboard(){
  const stats = Store.taskStats(), el = $('#dashboard');
  const rows = Object.entries(stats).filter(([k])=>Bank.taxonomy().tasks[k])
    .map(([k,s])=>({k, ...s, pct: Math.round(s.correct/s.total*100)})).sort((a,b)=>a.pct-b.pct || b.total-a.total);
  if(!rows.length){ el.innerHTML=''; return; }
  el.innerHTML = `<h2>🎯 Weak areas <small>by task statement, weakest first · tap to practise</small></h2><div class="dash-list">${rows.map(r=>{
    const cls = r.pct>=75?'good':r.pct>=55?'mid':'low';
    return `<button class="dash-row" data-task="${r.k}"><span class="dash-name"><b>${r.k}</b> ${esc(taskName(r.k))}</span>
      <span class="dash-bar"><span class="dash-fill ${cls}" style="width:${r.pct}%"></span></span>
      <span class="dash-pct ${cls}">${r.pct}%</span><span class="dash-n">${r.correct}/${r.total}</span></button>`;}).join('')}</div>`;
  el.querySelectorAll('.dash-row').forEach(b=> b.onclick = ()=> startStudy(b.dataset.task));
}

function renderHistory(){
  const list = Store.allHistory(), el = $('#history-list');
  if(!list.length){ el.innerHTML = '<p class="empty-note">No tests completed yet.</p>'; return; }
  el.innerHTML = list.map(h=>{
    const pct = Math.round(h.score/h.total*100), t = h.time ? ` · ⏱ ${fmtTime(h.time)}` : '';
    const right = h.scaled ? `<div class="h-score ${h.scaled>=PASS()?'pass':'fail'}">${h.scaled}<small>/1000 · ${pct}%</small></div>`
                           : `<div class="h-score">${h.score}<small>/${h.total} · ${pct}%</small></div>`;
    return `<div class="history-item"><div><div class="h-mode">${esc(modeLabel(h.mode))}${h.topic?' · '+esc(h.topic):''}</div>
      <div class="h-date">${esc(h.date)}${t}</div></div>${right}</div>`;
  }).join('') + '<button class="clear-history" id="clear-hist">Clear history</button>';
  $('#clear-hist').onclick = ()=>{ if(confirm('Clear all score history?')){ Store.clearHistory(); renderHome(); } };
}

/* ================= TOPIC PICKER ================= */
function renderTopics(){
  const tax = Bank.taxonomy(), tasks = Bank.tasks(), stats = Store.taskStats();
  let html = '';
  for (const [dk, d] of Object.entries(tax.domains)){
    html += `<div class="topic-group-label">Domain ${dk} · ${esc(d.name)} <span>${d.weight}%</span></div>`;
    tasks.filter(t=>t.domain===dk).forEach(t=>{
      const s = stats[t.key], acc = s ? ` · ${Math.round(s.correct/s.total*100)}%` : '';
      html += `<button class="topic-btn" data-task="${t.key}"><span><b class="t-key">${t.key}</b> ${esc(t.name)}</span>
        <span class="t-count">${t.count} Qs${acc}</span></button>`;
    });
  }
  $('#topic-list').innerHTML = html;
  $('#topic-list').querySelectorAll('.topic-btn').forEach(b=> b.onclick = ()=> startStudy(b.dataset.task));
}

/* ================= STUDY CARDS ================= */
let cards = null, fc = null;
async function openLearn(){
  try { if(!cards) cards = await fetch('data/cards.json', {cache:'no-store'}).then(r=>r.json()); }
  catch(e){ alert('Could not load the study cards.'); return; }
  renderLearnTopics(); show('learn-topics');
}
function renderLearnTopics(){
  const tax = Bank.taxonomy(); let html = '';
  for (const [dk, d] of Object.entries(tax.domains)){
    html += `<div class="topic-group-label">Domain ${dk} · ${esc(d.name)} <span>${d.weight}%</span></div>`;
    Object.entries(tax.tasks).filter(([,t])=>t.domain===dk).forEach(([k,t])=>{
      const n = (cards.tasks[k]||[]).length; if(!n) return;
      html += `<button class="topic-btn" data-task="${k}"><span><b class="t-key">${k}</b> ${esc(t.name)}</span><span class="t-count">${n} cards</span></button>`;
    });
  }
  $('#learn-list').innerHTML = html;
  $('#learn-list').querySelectorAll('.topic-btn').forEach(b=> b.onclick = ()=>{ fc = {task:b.dataset.task, idx:0}; show('learn-cards'); renderCard(); });
}
function renderCard(){
  const list = cards.tasks[fc.task], c = list[fc.idx], n = list.length;
  $('#fc-counter').textContent = `${fc.idx+1} / ${n}`;
  $('#fc-progress').style.width = ((fc.idx+1)/n*100)+'%';
  $('#fc-meta').textContent = `${fc.task} · ${taskName(fc.task)}`;
  $('#fc-card').innerHTML = `<div class="fc-title">${rich(c.t)}</div><div class="fc-body">${rich(c.b)}</div>
    ${c.x ? `<div class="fc-ex"><b>⚠️ Exam trap</b>${rich(c.x)}</div>` : ''}`;
  $('#fc-prev').style.visibility = fc.idx>0 ? 'visible' : 'hidden';
  $('#fc-next').textContent = fc.idx<n-1 ? 'Next →' : 'Practise this topic →';
}
function stepCard(d){
  const n = cards.tasks[fc.task].length;
  if(d>0 && fc.idx===n-1){ startStudy(fc.task); return; }
  fc.idx = Math.max(0, Math.min(n-1, fc.idx+d)); renderCard(); window.scrollTo(0,0);
}

/* ================= START MODES ================= */
function beginQuiz(o){
  state = { mode:o.mode, questions:o.questions, idx:0, answers:[], locked:[], flags:[],
            reveal:o.reveal, topic:o.topic||null, timed:!!o.timed, elapsed:0,
            limit: o.timed ? Math.round(SECS_PER_Q*o.questions.length/60)*60 : null };
  stopTimer(); if(state.timed) startTimer();
  $('#palette').hidden = true;
  show('quiz'); renderQuestion(); persist();
}
function startStudy(task){
  const r = Bank.topicQuestions(task);
  if(!r.questions.length){ alert('No questions in this topic yet.'); return; }
  Store.markSeen(task, r.questions.map(q=>q.id));
  beginQuiz({mode:'study', questions:r.questions, reveal:true, topic:task});
  state._task = task; state._remaining = r.remaining;
}
function startDaily(){ beginQuiz({mode:'daily', questions:Bank.dailyQuestions(todayStr()), reveal:true}); state._day = todayStr(); }
function startQuick(){ if(confirmReplace()) beginQuiz({mode:'quick', questions:Bank.quickTest(), reveal:false, timed:true}); }
function startFull(){
  if(!confirmReplace()) return;
  if(!confirm('Full mock: 65 questions in 90 minutes, like the real exam.\nYou can flag questions and jump back from the question counter. Start now?')) return;
  beginQuiz({mode:'full', questions:Bank.fullTest(), reveal:false, timed:true});
}
function confirmReplace(){ return !Store.getResume() || confirm('Starting a new test discards your unfinished one. Continue?'); }
function startReview(kind){
  const ids = kind==='wrong' ? Store.allWrong() : Store.allBookmarks();
  const qs = Bank.reviewQuestions(ids); if(!qs.length) return;
  beginQuiz({mode: kind==='wrong' ? 'review_wrong' : 'review_marks', questions:qs, reveal:true});
}

/* ================= RESUME / TIMER ================= */
function persist(){
  if(state && state.timed) Store.saveResume({mode:state.mode, questions:state.questions, answers:state.answers,
    flags:state.flags, idx:state.idx, elapsed:state.elapsed, limit:state.limit});
}
function resumeTest(){
  const r = Store.getResume(); if(!r) return;
  state = {mode:r.mode, questions:r.questions, idx:r.idx||0, answers:r.answers||[], locked:[], flags:r.flags||[],
           reveal:false, timed:true, elapsed:r.elapsed||0, limit:r.limit};
  stopTimer(); startTimer(); show('quiz'); renderQuestion();
}
function startTimer(){
  updateTimer();
  timerId = setInterval(()=>{
    state.elapsed++; updateTimer();
    if(state.elapsed >= state.limit){ stopTimer(); alert('Time is up! Your test is being submitted.'); finishQuiz(); return; }
    if(state.elapsed % 10 === 0) persist();
  }, 1000);
}
function stopTimer(){ if(timerId){ clearInterval(timerId); timerId = null; } }
function updateTimer(){
  const el = $('#timer'); el.style.display = state && state.timed ? 'inline' : 'none';
  if(state && state.timed){ const left = state.limit - state.elapsed; el.textContent = '⏱ '+fmtTime(left); el.classList.toggle('low', left<=300); }
}

/* ================= QUESTION RENDER ================= */
function curQ(){ return state.questions[state.idx]; }
function curAns(){ return state.answers[state.idx]; }

function renderQuestion(){
  const q = curQ(), n = state.questions.length;
  $('#palette-btn').textContent = `${state.idx+1} / ${n}`;
  $('#palette-btn').classList.toggle('clickable', state.timed);
  $('#progress-bar').style.width = (state.idx/n*100)+'%';
  updateTimer();
  const marked = Store.isBookmarked(q.id), flagged = !!state.flags[state.idx];
  const hint = q.type!=='single' ? `<span class="type-chip">${TYPE_HINT[q.type](q.answer.length)}</span>` : '';
  $('#question-area').innerHTML = `
    <div class="q-head"><div class="q-meta">Domain ${q.domain} · ${q.task} ${esc(taskName(q.task))}</div>
      <div class="q-tools">${state.timed ? `<button class="flag-btn ${flagged?'on':''}" id="flag" title="Flag for review">⚑</button>` : ''}
      <button class="bookmark-btn ${marked?'on':''}" id="bm" title="Bookmark for revision">${marked?'★':'☆'}</button></div></div>
    <div class="q-text">${hint}${rich(q.q)}</div>
    <div id="answer-ui"></div><div id="fb-slot"></div>`;
  $('#bm').onclick = ()=>{ const on = Store.toggleBookmark(q.id); $('#bm').textContent = on?'★':'☆'; $('#bm').classList.toggle('on', on); };
  if($('#flag')) $('#flag').onclick = ()=>{ state.flags[state.idx] = !state.flags[state.idx]; $('#flag').classList.toggle('on', state.flags[state.idx]); persist(); if(!$('#palette').hidden) renderPalette(); };
  renderAnswerUi();
  if(state.locked[state.idx]) $('#fb-slot').innerHTML = feedbackHtml(q, curAns());
  renderFooter();
}

function renderAnswerUi(){
  const q = curQ(), a = curAns(), locked = !!state.locked[state.idx], ui = $('#answer-ui');
  if(q.type==='single' || q.type==='multi'){
    const chosen = q.type==='single' ? (a===undefined||a===null ? [] : [a]) : (a||[]);
    ui.innerHTML = `<div class="options ${q.type==='multi'?'multi':''}">${q.options.map((o,i)=>{
      let cls = 'option';
      if(chosen.includes(i)) cls += ' selected';
      if(locked){ cls += ' disabled'; const right = q.type==='single' ? i===q.answer : q.answer.includes(i);
        if(right) cls += ' correct'; else if(chosen.includes(i)) cls += ' wrong'; }
      return `<button class="${cls}" data-i="${i}"><span class="opt-key">${q.type==='multi' ? (chosen.includes(i)?'☑':'☐') : KEYS[i]}</span><span class="opt-text">${rich(o)}</span></button>`;
    }).join('')}</div>`;
    if(!locked) ui.querySelectorAll('.option').forEach(b=> b.onclick = ()=> pickOption(+b.dataset.i));
  }
  else if(q.type==='order'){
    const seq = a || [];
    const pool = q.options.map((o,i)=>i).filter(i=>!seq.includes(i));
    ui.innerHTML = `<div class="order-label">Your order ${locked?'':'<span>(tap a step to remove it)</span>'}</div>
      <ol class="order-seq">${seq.map((i,pos)=>{
        const st = locked ? (q.answer[pos]===i ? ' correct' : ' wrong') : '';
        return `<li><button class="order-item placed${st}" data-pos="${pos}" ${locked?'disabled':''}><span class="ord-n">${pos+1}</span>${rich(q.options[i])}</button></li>`;
      }).join('') || '<li class="order-empty">Tap the steps below in the right sequence</li>'}</ol>
      ${pool.length ? `<div class="order-label">Steps</div><div class="order-pool">${pool.map(i=>`<button class="order-item" data-i="${i}" ${locked?'disabled':''}>${rich(q.options[i])}</button>`).join('')}</div>` : ''}`;
    if(!locked){
      ui.querySelectorAll('.order-pool .order-item').forEach(b=> b.onclick = ()=>{ setAns([...(curAns()||[]), +b.dataset.i]); });
      ui.querySelectorAll('.order-seq .order-item').forEach(b=> b.onclick = ()=>{ const s=(curAns()||[]).slice(); s.splice(+b.dataset.pos,1); setAns(s.length?s:null); });
    }
  }
  else if(q.type==='match'){
    const m = a || q.prompts.map(()=>null);
    ui.innerHTML = `<div class="match-list">${q.prompts.map((p,pi)=>{
      const st = locked ? (m[pi]===q.answer[pi] ? ' correct' : ' wrong') : '';
      return `<div class="match-row${st}"><div class="match-prompt">${rich(p)}</div>
        <select data-p="${pi}" ${locked?'disabled':''}><option value="">Choose…</option>
        ${q.options.map((o,oi)=>`<option value="${oi}" ${m[pi]===oi?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
    }).join('')}</div>`;
    if(!locked) ui.querySelectorAll('select').forEach(s=> s.onchange = ()=>{
      const cur = (curAns() || q.prompts.map(()=>null)).slice();
      cur[+s.dataset.p] = s.value==='' ? null : +s.value;
      setAns(cur.every(v=>v===null) ? null : cur);
    });
  }
}

function setAns(v){ state.answers[state.idx] = v; renderAnswerUi(); renderFooter(); persist(); }

function pickOption(i){
  const q = curQ();
  if(q.type==='single'){
    state.answers[state.idx] = i;
    if(state.reveal) lockCurrent(); else { renderAnswerUi(); renderFooter(); persist(); }
  } else {
    let s = (curAns()||[]).slice();
    if(s.includes(i)) s = s.filter(x=>x!==i);
    else { if(s.length >= q.answer.length) s.shift(); s.push(i); }   // keep at most the required number
    setAns(s.length ? s : null);
  }
}

/* Study-style modes: lock the answer, show feedback, record stats */
function lockCurrent(){
  const q = curQ(), a = curAns();
  if(!state.locked[state.idx]){
    state.locked[state.idx] = true;
    const ok = Bank.isCorrect(q, a);
    Store.recordAnswer(q.task, ok);
    if(!ok) Store.addWrong(q.id); else if(state.mode==='review_wrong') Store.removeWrong(q.id);
  }
  renderAnswerUi();
  $('#fb-slot').innerHTML = feedbackHtml(q, a);
  renderFooter();
  $('#fb-slot').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function solutionHtml(q){
  if(q.type==='order') return `<div class="f-sol"><b>Correct order</b><ol>${q.answer.map(i=>`<li>${rich(q.options[i])}</li>`).join('')}</ol></div>`;
  if(q.type==='match') return `<div class="f-sol"><b>Correct matches</b><ul>${q.prompts.map((p,pi)=>`<li>${rich(p)} → <b>${rich(q.options[q.answer[pi]])}</b></li>`).join('')}</ul></div>`;
  if(q.notes) return `<div class="f-notes">${q.options.map((o,i)=>{
    const right = q.type==='single' ? i===q.answer : q.answer.includes(i);
    return `<div class="note ${right?'right':''}"><b>${right?'✓':'✗'} ${rich(o)}</b><span>${rich(q.notes[i])}</span></div>`;}).join('')}</div>`;
  return '';
}
function reportLink(q){ return `<a class="report" href="${SITE.repo}/issues/new?title=${encodeURIComponent('Question '+q.id)}&body=${encodeURIComponent('Question ID: '+q.id+'\nWhat is wrong:\nSource (AWS docs link):')}" target="_blank" rel="noopener">Report a mistake</a>`; }
function feedbackHtml(q, a){
  const ok = Bank.isCorrect(q, a);
  return `<div class="feedback ${ok?'ok':'no'}"><div class="f-title">${ok?'✓ Correct':'✗ Not quite'}</div>
    <div class="f-exp">${rich(q.explain)}</div>${solutionHtml(q)}
    <div class="f-foot">${q.ref?`<span class="ref">📘 ${rich(q.ref)}</span>`:''}${reportLink(q)}</div></div>`;
}

function renderFooter(){
  const q = curQ(), last = state.idx===state.questions.length-1, locked = !!state.locked[state.idx];
  const answered = Bank.isAnswered(q, curAns());
  let main;
  if(state.reveal && !locked && q.type!=='single'){
    main = `<button class="btn-primary" id="check" ${answered?'':'disabled'}>Check answer</button>`;
  } else {
    const label = last ? (state.reveal ? 'See result' : 'Finish test') : 'Next →';
    main = `<button class="btn-primary" id="next" ${state.reveal && !locked ? 'disabled' : ''}>${label}</button>`;
  }
  const prev = state.idx>0 ? '<button class="btn-ghost" id="prev">← Previous</button>' : '<span></span>';
  $('#quiz-footer').innerHTML = prev + main;
  if($('#prev')) $('#prev').onclick = ()=> go(state.idx-1);
  if($('#check')) $('#check').onclick = lockCurrent;
  if($('#next')) $('#next').onclick = ()=>{
    if(!last) return go(state.idx+1);
    if(!state.reveal){
      const unans = state.questions.filter((qq,i)=>!Bank.isAnswered(qq, state.answers[i])).length;
      const fl = state.flags.filter(Boolean).length;
      const warn = [unans ? `${unans} unanswered` : '', fl ? `${fl} flagged` : ''].filter(Boolean).join(' and ');
      if(warn && !confirm(`You have ${warn}. Finish the test anyway?`)) return;
    }
    finishQuiz();
  };
}
function go(i){ state.idx = i; renderQuestion(); persist(); window.scrollTo(0,0); }

/* Palette: jump to any question in a timed test; shows answered and flagged */
function renderPalette(){
  $('#palette').innerHTML = `<div class="pal-legend"><span class="pl a">answered</span><span class="pl f">⚑ flagged</span><span class="pl">not answered</span></div>
    <div class="pal-grid">${state.questions.map((q,i)=>{
      const cls = [Bank.isAnswered(q, state.answers[i])?'a':'', state.flags[i]?'f':'', i===state.idx?'cur':''].join(' ');
      return `<button class="pal ${cls}" data-i="${i}">${i+1}</button>`;}).join('')}</div>`;
  $('#palette').querySelectorAll('.pal').forEach(b=> b.onclick = ()=>{ $('#palette').hidden = true; go(+b.dataset.i); });
}

/* ================= SCORE ================= */
function finishQuiz(){
  stopTimer();
  const qs = state.questions, isTest = state.timed;
  let score = 0; const doms = {};
  qs.forEach((q,i)=>{
    const ok = Bank.isCorrect(q, state.answers[i]);
    if(ok) score++;
    doms[q.domain] = doms[q.domain] || {n:0, c:0}; doms[q.domain].n++; if(ok) doms[q.domain].c++;
    if(isTest){ Store.recordAnswer(q.task, ok); if(!ok) Store.addWrong(q.id); }
  });
  const total = qs.length, sc = isTest ? scaled(score, total) : null;
  const skipped = qs.filter((q,i)=>!Bank.isAnswered(q, state.answers[i])).length;
  state._result = {isTest, score, total, skipped, doms, scaled: sc};
  if(state.mode==='daily'){ state._result.first = Store.saveDaily(state._day, score, total); state._result.streak = Store.dailyStreak(state._day, prevDay); }
  if(isTest) Store.addTestIds(qs.map(q=>q.id));
  Store.addHistory({mode:state.mode, topic: state.topic ? state.topic+' '+taskName(state.topic) : null, score, total,
    scaled: sc, time: isTest ? state.elapsed : null, date: new Date().toLocaleString(undefined,{dateStyle:'medium', timeStyle:'short'})});
  Store.clearResume();
  $('#back-topics').style.display = state.mode==='study' ? '' : 'none';
  renderScoreCard(); renderReview(); show('score');
}

function renderScoreCard(){
  const r = state._result, pct = Math.round(r.score/r.total*100);
  let big, extra = '';
  if(r.isTest){
    const pass = r.scaled >= PASS();
    big = `<div class="score-big ${pass?'pass':'fail'}">${r.scaled}<small>/1000</small></div>
      <div class="verdict ${pass?'pass':'fail'}">${pass?'PASS':'FAIL'} <span>(pass mark ${PASS()})</span></div>
      <div class="score-pct">${r.score}/${r.total} correct (${pct}%)${r.skipped?` · ${r.skipped} unanswered`:''} · ⏱ ${fmtTime(state.elapsed)} of ${fmtTime(state.limit)}</div>`;
    extra = `<div class="part-table"><div class="part-cap">Score report by domain</div>${Object.keys(Bank.taxonomy().domains).filter(d=>r.doms[d]).map(d=>{
      const p = Math.round(r.doms[d].c/r.doms[d].n*100), meets = p>=70;
      return `<div class="part-row"><span>D${d} ${esc(Bank.taxonomy().domains[d].short)}</span><span>${r.doms[d].c}/${r.doms[d].n} · <b class="${meets?'meets':'needs'}">${meets?'Meets competencies':'Needs improvement'}</b></span></div>`;
    }).join('')}</div><p class="score-note">The real exam uses a scaled score with 15 unscored questions, so treat this as an estimate: 100 + 900 × your share correct.</p>`;
  } else {
    big = `<div class="score-big">${r.score}<small>/${r.total}</small></div><div class="score-pct">${pct}% correct</div>`;
    if(state.mode==='daily') extra = `<div class="score-pct">${r.streak?`🔥 ${r.streak}-day streak`:''}${r.first?'':' · practice re-run (only your first attempt counts)'}</div><div class="score-pct">New 10 questions tomorrow.</div>`;
    if(state.mode==='study') extra = `<div class="score-pct">${state._remaining>0 ? `${state._remaining} new questions left in ${state.topic}. Pick it again for the next set.` : `You have now seen every question in ${state.topic}. The next set starts over.`}</div>`;
  }
  $('#score-card').innerHTML = big + extra;
}

function reviewAnswerHtml(q, a){
  if(q.type==='single' || q.type==='multi'){
    const chosen = q.type==='single' ? (a===undefined||a===null?[]:[a]) : (a||[]);
    return q.options.map((o,j)=>{
      const right = q.type==='single' ? j===q.answer : q.answer.includes(j), picked = chosen.includes(j);
      const tag = right ? (picked ? ' ✓ your answer' : ' ✓ correct') : (picked ? ' ✗ your answer' : '');
      return `<div class="rv-opt ${right?'right':picked?'picked':''}"><b>${KEYS[j]}.</b> ${rich(o)}<span class="rv-tag">${tag}</span>${q.notes?`<div class="rv-note">${rich(q.notes[j])}</div>`:''}</div>`;
    }).join('');
  }
  if(q.type==='order'){
    const yours = (a||[]).map(i=>q.options[i]);
    return `<div class="rv-cols"><div><b>Your order</b><ol>${yours.map((t,p)=>`<li class="${a[p]===q.answer[p]?'ok':'bad'}">${rich(t)}</li>`).join('')||'<li>—</li>'}</ol></div>
      <div><b>Correct order</b><ol>${q.answer.map(i=>`<li>${rich(q.options[i])}</li>`).join('')}</ol></div></div>`;
  }
  return `<div class="rv-match">${q.prompts.map((p,pi)=>{ const y = a ? a[pi] : null, ok = y===q.answer[pi];
    return `<div class="${ok?'ok':'bad'}">${rich(p)} → <b>${rich(q.options[q.answer[pi]])}</b>${ok?' ✓':` <span class="rv-tag">(you: ${y===null||y===undefined?'—':rich(q.options[y])})</span>`}</div>`;}).join('')}</div>`;
}

function renderReview(){
  const qs = state.questions;
  let bad = 0;
  const items = qs.map((q,i)=>{
    const a = state.answers[i], ok = Bank.isCorrect(q, a), none = !Bank.isAnswered(q, a);
    if(!ok) bad++;
    const st = ok ? 'ok' : none ? 'skip' : 'no';
    return `<div class="exp-item st-${st}"><div class="exp-head"><span class="exp-num">${i+1}</span>
      <span class="exp-badge ${st}">${ok?'✓ Correct':none?'— Not answered':'✗ Wrong'}</span>
      ${state.flags[i]?'<span class="exp-flag">⚑</span>':''}<span class="exp-task">${q.task}</span></div>
      <div class="exp-q">${rich(q.q)}</div><div class="rv-opts">${reviewAnswerHtml(q, a)}</div>
      <div class="exp-detail"><span class="lab">💡 Why:</span> ${rich(q.explain)}</div>
      <div class="f-foot">${q.ref?`<span class="ref">📘 ${rich(q.ref)}</span>`:''}${reportLink(q)}</div></div>`;
  });
  $('#explanations').innerHTML = `<h3>Answer review</h3><div class="rv-filter">
      <button class="chip on" data-f="all">All (${qs.length})</button><button class="chip" data-f="bad">Wrong / unanswered (${bad})</button>
      ${state.flags.some(Boolean)?`<button class="chip" data-f="flag">Flagged (${state.flags.filter(Boolean).length})</button>`:''}</div>
    <div id="rv-list">${items.join('')}</div>`;
  $('#explanations').querySelectorAll('.chip').forEach(c=> c.onclick = ()=>{
    $('#explanations').querySelectorAll('.chip').forEach(x=>x.classList.toggle('on', x===c));
    $('#rv-list').className = c.dataset.f==='all' ? '' : 'only-'+c.dataset.f;
  });
  $('#rv-list').querySelectorAll('.exp-item').forEach((el,i)=>{ if(state.flags[i]) el.classList.add('flagged'); });
}

/* ================= SHARE ================= */
async function shareScore(){
  const r = state && state._result; if(!r) return;
  const pct = Math.round(r.score/r.total*100), left = daysToExam();
  const info = {
    heading: 'AWS AI Practitioner practice',
    mode: state.mode==='study' ? `${state.topic} ${taskName(state.topic)}` : modeLabel(state.mode),
    big: r.isTest ? String(r.scaled) : String(r.score), small: r.isTest ? '/1000' : '/'+r.total,
    line: r.isTest ? `${r.scaled>=PASS()?'PASS':'Not yet'} · ${r.score}/${r.total} correct (${pct}%)` : `${pct}% correct`,
    rows: r.isTest ? Object.keys(r.doms).sort().slice(0,5).map(d=>[`D${d} ${Bank.taxonomy().domains[d].short}`, `${r.doms[d].c}/${r.doms[d].n}`]) : [],
    badge: state.mode==='daily' && r.streak ? `🔥 ${r.streak}-day streak` : (left>0 ? `${left} days to my exam` : ''),
    cta: 'Practise free 👇', accent: (r.isTest ? r.scaled>=PASS() : pct>=70) ? '#15803d' : '#4338ca'
  };
  const text = state.mode==='daily' ? `AIF-C01 daily 10: I got ${r.score}/10. Can you beat it?`
    : r.isTest ? `AWS AI Practitioner ${modeLabel(state.mode)}: ${r.scaled}/1000. Practise free:` : `I got ${r.score}/${r.total} in AWS AI Practitioner practice. Practise free:`;
  const btn = $('#share-btn'); btn.disabled = true;
  try { await Share.share(info, text); } finally { btn.disabled = false; }
}

/* ================= OFFLINE + INSTALL + BACKUP ================= */
let installEvt = null;
function setupPwa(){
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    const reg = ()=> navigator.serviceWorker.register('sw.js').catch(()=>{});
    if(document.readyState==='complete') reg(); else window.addEventListener('load', reg);
  }
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); installEvt = e; $('#install-btn').style.display='flex'; });
  window.addEventListener('appinstalled', ()=>{ installEvt = null; $('#install-btn').style.display='none'; });
  $('#install-btn').onclick = async ()=>{ if(!installEvt) return; installEvt.prompt(); try{ await installEvt.userChoice; }catch(e){} installEvt=null; $('#install-btn').style.display='none'; };
}
function backup(){
  const blob = new Blob([JSON.stringify(Store.exportAll(), null, 1)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aif-c01-progress-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function restore(file){
  const rd = new FileReader();
  rd.onload = ()=>{ try{ Store.importAll(JSON.parse(rd.result)); renderHome(); alert('Progress restored.'); }catch(e){ alert('That file is not a backup from this site.'); } };
  rd.readAsText(file);
}

/* ================= WIRING ================= */
function goHome(){ stopTimer(); renderHome(); show('home'); }
function goTopics(){ stopTimer(); renderTopics(); show('topic-picker'); }
function exitQuiz(){
  if(state && state.timed){ persist(); stopTimer(); goHome(); return; }   // timed tests can be resumed later
  if(state && state.mode==='study') goTopics(); else goHome();
}

async function init(){
  setupPwa();
  try { await Bank.load(); }
  catch(e){ $('#home').innerHTML = '<p class="empty-note">Could not load the question bank. If you opened index.html directly, serve the folder instead (see README).</p>'; return; }
  renderHome();
  document.querySelectorAll('.mode-card').forEach(c=> c.onclick = ()=>{
    const m = c.dataset.mode;
    if(m==='learn') openLearn(); else if(m==='study') goTopics(); else if(m==='quick') startQuick(); else if(m==='full') startFull();
  });
  $('#daily-card').onclick = startDaily;
  $('#share-btn').onclick = shareScore;
  $('#quiz-exit').onclick = exitQuiz;
  $('#palette-btn').onclick = ()=>{ if(!state || !state.timed) return; const p = $('#palette'); p.hidden = !p.hidden; if(!p.hidden) renderPalette(); };
  $('#learn-back').onclick = ()=>{ renderLearnTopics(); show('learn-topics'); };
  $('#fc-prev').onclick = ()=> stepCard(-1);
  $('#fc-next').onclick = ()=> stepCard(1);
  $('#back-topics').onclick = goTopics;
  $('#review-wrong').onclick = ()=> startReview('wrong');
  $('#review-marks').onclick = ()=> startReview('marks');
  $('#exam-date').onchange = e=>{ Store.setExamDate(e.target.value); renderDaily(); };
  $('#backup-btn').onclick = backup;
  $('#restore-btn').onclick = ()=> $('#restore-file').click();
  $('#restore-file').onchange = e=>{ if(e.target.files[0]) restore(e.target.files[0]); e.target.value=''; };
  document.querySelectorAll('[data-back]').forEach(b=> b.onclick = ()=>{ b.dataset.back==='home' ? goHome() : show(b.dataset.back); });
  window.addEventListener('beforeunload', ()=>{ if(state && state.timed && !$('#score').classList.contains('active')) persist(); });
}
init();
