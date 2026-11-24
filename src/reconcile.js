const snapshotRecord = a => ({id:a.id,started:a.started,ended:a.ended||null,finished:a.finished,snapshot:JSON.parse(JSON.stringify(a))});
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// onSelected runs immediately after the replacement is saved, so a later
// failure does not leave the UI holding the old version of the attempt.
export async function reconcile({history, current, isCurrent, confirmCloud, saveLocal, normalize, onSelected}) {
  const ensureCurrent = () => { if (!isCurrent()) throw Error('account changed'); };
  ensureCurrent();
  const pending = history.pendingAttempts(), candidates = [...pending];
  if (current?.id && !pending.some(x=>x.id===current.id)) candidates.push(snapshotRecord(current));
  let selected = current;
  for (const item of candidates) {
    const remote = await history.getAttempt(item.id, {cloudOnly:true});
    ensureCurrent();
    if (remote && !equal(remote.snapshot,item.snapshot)) {
      if (confirmCloud()) {
        if (selected?.id === item.id) {
          const replacement = normalize(remote.snapshot);
          if (!replacement) throw Error('invalid cloud attempt');
          saveLocal(remote.snapshot);
          selected = replacement;
          onSelected(selected);
        }
        history.discardPending(item.id);
      } else if (!pending.some(x=>x.id===item.id)) {
        await history.saveAttempt(item,{queueOnly:true});
        ensureCurrent();
      }
    }
  }
  await history.syncPending();
  ensureCurrent();
  return selected;
}
