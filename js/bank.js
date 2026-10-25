/* bank.js — loads the question bank and builds quizzes weighted like the real exam.

   Question shape (data/questions.json, built by tools/build_bank.py):
     { id, domain:"1", task:"1.1", type:"single"|"multi"|"order"|"match", difficulty,
       q, options:[...], answer, prompts?:[...], notes?:[...], explain, ref }
   answer: single → index · multi → sorted indices · order → option indices in the right sequence
           match → for each prompt, the index of its option */
const Bank = (() => {
  let tax = null, qs = [], byIdMap = new Map();

  async function load(){
    if (qs.length) return;
    const [t, b] = await Promise.all([
      fetch('data/_taxonomy.json', {cache:'no-store'}).then(r=>r.json()),
      fetch('data/questions.json', {cache:'no-store'}).then(r=>r.json())
    ]);
    tax = t; qs = b.questions || [];
    qs.forEach(q => byIdMap.set(q.id, q));
  }

  const taxonomy = () => tax;
  const all = () => qs;
  const byId = id => byIdMap.get(id) || null;

  function shuffle(a, rnd=Math.random){
    a = a.slice();
    for (let i=a.length-1; i>0; i--){ const j = Math.floor(rnd()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; }
    return a;
  }

  /* Shuffle options (and keep the answer pointing at the same option). Matching keeps prompt order. */
  function prepare(q, rnd=Math.random){
    const perm = shuffle(q.options.map((_,i)=>i), rnd);      // perm[newIndex] = oldIndex
    const where = old => perm.indexOf(old);
    const out = {...q, options: perm.map(i=>q.options[i])};
    if (q.notes) out.notes = perm.map(i=>q.notes[i]);
    if (q.type==='single') out.answer = where(q.answer);
    else if (q.type==='multi') out.answer = q.answer.map(where).sort((a,b)=>a-b);
    else out.answer = q.answer.map(where);                    // order and match: position-wise
    return out;
  }

  function isCorrect(q, ans){
    if (ans===undefined || ans===null) return false;
    if (q.type==='single') return ans===q.answer;
    if (!Array.isArray(ans) || ans.length!==q.answer.length) return false;
    const a = q.type==='multi' ? ans.slice().sort((x,y)=>x-y) : ans;
    return a.every((v,i)=>v===q.answer[i]);
  }
  function isAnswered(q, ans){
    if (ans===undefined || ans===null) return false;
    if (q.type==='single') return true;
    if (q.type==='multi') return Array.isArray(ans) && ans.length===q.answer.length;
    return Array.isArray(ans) && ans.length===q.answer.length && ans.every(v=>v!==null && v!==undefined);
  }

  /* Split n questions across domains by exam weight (largest remainder → sums exactly to n) */
  function domainQuota(n){
    const d = tax.domains, keys = Object.keys(d);
    const raw = keys.map(k => ({k, x: n*d[k].weight/100}));
    raw.forEach(r => r.n = Math.floor(r.x));
    let left = n - raw.reduce((s,r)=>s+r.n, 0);
    raw.slice().sort((a,b)=>(b.x-b.n)-(a.x-a.n) || b.x-a.x).forEach(r=>{ if(left>0){ r.n++; left--; } });
    return Object.fromEntries(raw.map(r=>[r.k, r.n]));
  }

  /* Timed tests: weighted by domain, preferring questions not seen in the last few tests */
  function weightedTest(n){
    const recent = Store.recentTestIds();
    let picked = [];
    for (const [dom, k] of Object.entries(domainQuota(n))){
      const pool = shuffle(qs.filter(q=>q.domain===dom));
      const fresh = pool.filter(q=>!recent.has(q.id)), old = pool.filter(q=>recent.has(q.id));
      picked = picked.concat(fresh.concat(old).slice(0, k));
    }
    return shuffle(picked).map(q=>prepare(q));
  }
  const quickTest = () => weightedTest(20);
  const fullTest = () => weightedTest(tax.exam.questions);

  /* Topic practice: up to 20 questions of one task statement, new ones first */
  function topicQuestions(task){
    const seen = new Set(Store.seen()[task] || []);
    const pool = qs.filter(q=>q.task===task);
    let fresh = pool.filter(q=>!seen.has(q.id));
    let restarted = false;
    if (!fresh.length){ Store.resetSeen(task); fresh = pool; restarted = true; }
    const set = shuffle(fresh).slice(0, 20);
    return {questions: set.map(q=>prepare(q)), remaining: fresh.length - set.length, total: pool.length, restarted};
  }

  function tasks(){
    const count = {};
    qs.forEach(q => count[q.task] = (count[q.task]||0) + 1);
    return Object.entries(tax.tasks).map(([k,t])=>({key:k, ...t, count: count[k]||0}));
  }

  /* Daily 10: the same set for everyone on a given date (pools sorted by id, seeded by the date) */
  function seededRng(str){
    let h = 1779033703 ^ str.length;
    for (let i=0;i<str.length;i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h<<13 | h>>>19; }
    let a = h >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1 | a);
      t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t; return ((t ^ t>>>14) >>> 0) / 4294967296; };
  }
  function dailyQuestions(day){
    const rnd = seededRng('aifc01-daily:'+day);
    let out = [];
    for (const [dom, k] of Object.entries(domainQuota(10))){
      const pool = qs.filter(q=>q.domain===dom).sort((x,y)=> x.id<y.id?-1:x.id>y.id?1:0);
      out = out.concat(shuffle(pool, rnd).slice(0, k));
    }
    return shuffle(out, rnd).map(q=>prepare(q, rnd));
  }

  /* Mistakes / bookmarks from saved ids (ids no longer in the bank are dropped) */
  const reviewQuestions = ids => shuffle(ids.map(byId).filter(Boolean)).map(q=>prepare(q));

  return { load, taxonomy, all, byId, prepare, isCorrect, isAnswered, domainQuota,
           quickTest, fullTest, topicQuestions, tasks, dailyQuestions, reviewQuestions };
})();
