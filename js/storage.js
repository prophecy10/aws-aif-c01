/* storage.js — all persistence lives in this browser's localStorage (no backend, nothing uploaded) */
const Store = (() => {
  const P = 'aifc01_';
  const K = {
    hist:   P+'history_v1',    // completed attempts
    resume: P+'resume_v1',     // one unfinished timed test
    wrong:  P+'wrong_v1',      // ids answered wrongly (leave once answered right in review)
    mark:   P+'bookmarks_v1',  // bookmarked ids
    stats:  P+'taskstats_v1',  // per task statement {correct,total}
    daily:  P+'daily_v1',      // {'YYYY-MM-DD': {score,total}}
    seen:   P+'seen_v1',       // ids already served in topic practice (no-repeat sets)
    exam:   P+'examdate_v1',   // 'YYYY-MM-DD' chosen by the user
    mocks:  P+'mockids_v1'     // question ids of the last few timed tests, so new tests prefer fresh questions
  };

  function get(k, def){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? def; }catch(e){ return def; } }
  function set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function del(k){ try{ localStorage.removeItem(k); }catch(e){} }

  /* History */
  const allHistory = () => get(K.hist, []);
  function addHistory(entry){ const l = allHistory(); l.unshift(entry); set(K.hist, l.slice(0,100)); }
  const clearHistory = () => del(K.hist);

  /* Resume */
  const saveResume = s => set(K.resume, s);
  const getResume = () => get(K.resume, null);
  const clearResume = () => del(K.resume);

  /* Mistakes and bookmarks: ids only; the question text always comes from the current bank,
     so corrections reach saved lists automatically */
  const allWrong = () => get(K.wrong, []);
  function addWrong(id){ set(K.wrong, [id, ...allWrong().filter(x=>x!==id)].slice(0,500)); }
  function removeWrong(id){ set(K.wrong, allWrong().filter(x=>x!==id)); }
  const allBookmarks = () => get(K.mark, []);
  const isBookmarked = id => allBookmarks().includes(id);
  function toggleBookmark(id){
    const l = allBookmarks(), on = !l.includes(id);
    set(K.mark, on ? [id, ...l] : l.filter(x=>x!==id));
    return on;
  }

  /* Per task statement accuracy */
  function recordAnswer(task, correct){
    const s = get(K.stats, {});
    s[task] = s[task] || {correct:0, total:0};
    s[task].total++; if(correct) s[task].correct++;
    set(K.stats, s);
  }
  const taskStats = () => get(K.stats, {});

  /* Topic practice: remember what was served so the next set brings new questions */
  const seen = () => get(K.seen, {});
  function markSeen(task, ids){ const s = seen(); s[task] = [...new Set([...(s[task]||[]), ...ids])]; set(K.seen, s); }
  function resetSeen(task){ const s = seen(); delete s[task]; set(K.seen, s); }

  /* Daily 10 */
  const allDaily = () => get(K.daily, {});
  const getDaily = day => allDaily()[day] || null;
  function saveDaily(day, score, total){
    const d = allDaily(); if(d[day]) return false;      // first attempt only
    d[day] = {score, total};
    const keys = Object.keys(d).sort(); while(keys.length > 400) delete d[keys.shift()];
    set(K.daily, d); return true;
  }
  function dailyStreak(today, prevDay){
    const d = allDaily(); let day = d[today] ? today : prevDay(today), n = 0;
    while(d[day]){ n++; day = prevDay(day); }
    return n;
  }

  /* Recently served timed-test questions (last 4 tests) */
  const recentTestIds = () => new Set(get(K.mocks, []).flat());
  function addTestIds(ids){ set(K.mocks, [ids, ...get(K.mocks, [])].slice(0,4)); }

  /* Exam date */
  const getExamDate = () => get(K.exam, '');
  const setExamDate = v => v ? set(K.exam, v) : del(K.exam);

  /* Backup and restore every key this site owns */
  function exportAll(){
    const out = {site:'aif-c01-practice', exported:new Date().toISOString(), data:{}};
    Object.values(K).forEach(k=>{ const v = localStorage.getItem(k); if(v!==null) out.data[k] = v; });
    return out;
  }
  function importAll(obj){
    if(!obj || obj.site!=='aif-c01-practice' || typeof obj.data!=='object') throw new Error('Not a backup from this site');
    const allowed = new Set(Object.values(K));
    Object.entries(obj.data).forEach(([k,v])=>{ if(allowed.has(k) && typeof v==='string') localStorage.setItem(k, v); });
  }

  return { allHistory, addHistory, clearHistory, saveResume, getResume, clearResume,
           allWrong, addWrong, removeWrong, allBookmarks, isBookmarked, toggleBookmark,
           recordAnswer, taskStats, seen, markSeen, resetSeen,
           getDaily, saveDaily, dailyStreak, recentTestIds, addTestIds, getExamDate, setExamDate, exportAll, importAll };
})();
