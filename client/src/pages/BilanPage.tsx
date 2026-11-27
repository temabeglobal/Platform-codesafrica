import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Download, FileDown, Loader2, Pencil, Save, Star } from 'lucide-react';
import { useEvents } from '../events';
import { daysUntil, fmtDate } from '../demo';
import {
  EVAL_KINDS, averageOf, fmtScore, kindDef, scoreColor, scoreOf, statsOf, subjectsOf, verdict,
  type EvalEntry, type EvalKind, type Evaluation, type Subject,
} from '../evaluation';
import EvalModal, { Stars } from '../components/EvalModal';
import { saveBlob } from '../excel';

/* Bilan & évaluation : après chaque événement, le bilan chiffré (tiré des autres modules), le bilan général
   et la performance des équipes, intervenants, prestataires et partenaires. Rapport en PDF et export Excel. */

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} $`;
const LINKS: Record<EvalKind, { to: string; label: string }> = {
  equipe: { to: '/equipe', label: 'Équipe' },
  intervenant: { to: '/thematiques', label: 'Programme' },
  prestataire: { to: '/prestataires', label: 'Prestataires' },
  partenaire: { to: '/sponsors', label: 'Sponsors' },
};

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4 min-w-0">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="font-display text-3xl tracking-wide mt-1 truncate" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function BilanView() {
  const { current, data, updateEvaluation } = useEvents();
  const ev = data.evaluation;
  const expected = Number(current.attendees) || 0;
  const stats = statsOf(data, expected);
  const subjects = subjectsOf(data);
  const [kind, setKind] = useState<EvalKind>('equipe');
  const [editing, setEditing] = useState<Subject | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'word' | null>(null);
  const [error, setError] = useState('');
  const close = useCallback(() => setEditing(null), []);
  const flash = (m: string) => { setToast(`${m} — enregistré sur cet appareil`); setTimeout(() => setToast(''), 4000); };

  const ended = daysUntil(current.end || current.start) < 0;
  // Bilan général : on remplit un brouillon, puis on l'enregistre avec le bouton.
  // S'il reste des modifications en quittant la page ou en changeant d'événement, elles sont enregistrées quand même.
  type General = Pick<Evaluation, 'attendance' | 'satisfaction' | 'strengths' | 'improvements' | 'recommendations'>;
  const generalOf = (e: Evaluation): General => ({ attendance: e.attendance, satisfaction: e.satisfaction, strengths: e.strengths, improvements: e.improvements, recommendations: e.recommendations });
  const [draft, setDraft] = useState<General>(() => generalOf(ev));
  const dirty = JSON.stringify(draft) !== JSON.stringify(generalOf(ev));
  const set = (patch: Partial<General>) => setDraft((d) => ({ ...d, ...patch }));
  const pending = useRef({ dirty, draft, updateEvaluation });
  pending.current = { dirty, draft, updateEvaluation };
  useEffect(() => {
    setDraft(generalOf(ev));
    return () => { const p = pending.current; if (p.dirty) p.updateEvaluation((e) => ({ ...e, ...p.draft })); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);
  // Fermeture de l'onglet avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const saveGeneral = () => {
    updateEvaluation((e) => ({ ...e, ...draft, strengths: draft.strengths.trim(), improvements: draft.improvements.trim(), recommendations: draft.recommendations.trim() }));
    setDraft((d) => ({ ...d, strengths: d.strengths.trim(), improvements: d.improvements.trim(), recommendations: d.recommendations.trim() }));
    setToast('Bilan général enregistré sur cet appareil'); setTimeout(() => setToast(''), 4000);
  };
  const entryOf = (s: Subject) => ev.entries[s.key];
  const rated = (s: Subject) => scoreOf(entryOf(s)) !== undefined;
  const ofKind = (k: EvalKind) => subjects.filter((s) => s.kind === k);
  const overall = averageOf(subjects.map(entryOf));
  const shown = ofKind(kind);
  const kindAvg = averageOf(shown.map(entryOf));

  const save = (e: EvalEntry) => {
    if (!editing) return;
    const key = editing.key, name = editing.name;
    updateEvaluation((x) => ({ ...x, entries: { ...x.entries, [key]: e } }));
    setEditing(null);
    flash(`Évaluation de ${name} enregistrée`);
  };

  const report = async () => {
    setBusy('pdf'); setError('');
    try {
      const { downloadBilanPdf } = await import('../bilanPdf');
      await downloadBilanPdf(current, data);
    } catch (e) { setError(`Le rapport n’a pas pu être créé : ${(e as Error).message}`); }
    setBusy(null);
  };
  const exportAs = async (format: 'excel' | 'word') => {
    setBusy(format); setError('');
    try {
      const { buildBilan } = await import('../bilanFiles');
      const { blob, name } = await buildBilan(format, current, data);
      saveBlob(blob, name);
    } catch (e) { setError(`L’export ${format === 'word' ? 'Word' : 'Excel'} a échoué : ${(e as Error).message}`); }
    setBusy(null);
  };

  const field = 'w-full rounded-xl bg-[var(--sand)] px-4 py-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500';
  const btn = 'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold disabled:opacity-50';

  return (
    <div className="space-y-6">
      {!ended && (
        <div className="flex items-start gap-3 rounded-2xl bg-royal-50 ring-1 ring-royal-200 text-royal-800 px-4 py-3 text-sm">
          <CalendarClock size={18} className="shrink-0 mt-0.5" />
          <p>L’événement se termine le {fmtDate(current.end || current.start)} {(current.end || current.start).slice(0, 4)}. L’évaluation se fait surtout après, mais vous pouvez la préparer dès maintenant.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {subjects.filter(rated).length} fiche{subjects.filter(rated).length > 1 ? 's' : ''} remplie{subjects.filter(rated).length > 1 ? 's' : ''} sur {subjects.length}
          {overall !== undefined && <> · note moyenne <strong style={{ color: scoreColor(overall) }}>{fmtScore(overall)} / 5</strong></>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportAs('excel')} disabled={!!busy} className={`${btn} bg-white ring-1 ring-ink-200 hover:bg-ink-50`}>
            {busy === 'excel' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Excel
          </button>
          <button type="button" onClick={() => exportAs('word')} disabled={!!busy} className={`${btn} bg-white ring-1 ring-ink-200 hover:bg-ink-50`}>
            {busy === 'word' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Word
          </button>
          <button type="button" onClick={report} disabled={!!busy} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>
            {busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Rapport PDF
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {/* Bilan chiffré : calculé à partir des autres modules */}
      <section className="tile p-6">
        <div className="eyebrow text-ink-500 mb-4">Bilan chiffré</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Figure label="Participants" value={stats.attendance !== undefined ? stats.attendance.toLocaleString('fr-FR') : '—'}
            sub={`${expected ? `${expected.toLocaleString('fr-FR')} attendus` : 'Nombre attendu non renseigné'}${stats.attendanceRate !== undefined ? ` · ${stats.attendanceRate} %` : ''}`} />
          <Figure label="Budget dépensé" value={money(stats.spent)}
            sub={stats.planned ? `${stats.budgetRate} % de ${money(stats.planned)} · ${stats.gap > 0 ? `dépassement de ${money(stats.gap)}` : `reste ${money(-stats.gap)}`}` : 'Aucun budget prévu'}
            tone={stats.gap > 0 ? '#c0262d' : undefined} />
          <Figure label="Tâches terminées" value={stats.tasks ? `${stats.tasksDone} / ${stats.tasks}` : '—'} sub={stats.tasksRate !== undefined ? `${stats.tasksRate} %` : 'Aucune tâche'} />
          <Figure label="Programme" value={`${stats.sessions} session${stats.sessions > 1 ? 's' : ''}`}
            sub={`${stats.speakersConfirmed} intervenant${stats.speakersConfirmed > 1 ? 's' : ''} confirmé${stats.speakersConfirmed > 1 ? 's' : ''} · ${stats.speakersAbsent} empêché${stats.speakersAbsent > 1 ? 's' : ''}`} />
          <Figure label="Sponsoring reçu" value={money(stats.sponsorAmount)} sub={`${stats.sponsorsPaid} sponsor${stats.sponsorsPaid > 1 ? 's' : ''} payé${stats.sponsorsPaid > 1 ? 's' : ''} sur ${stats.sponsorsConfirmed} confirmé${stats.sponsorsConfirmed > 1 ? 's' : ''}`} />
          <Figure label="Badges émis" value={String(stats.badges)} sub={`${stats.people} personne${stats.people > 1 ? 's' : ''} dans les équipes`} />
          <Figure label="Satisfaction générale" value={ev.satisfaction ? `${ev.satisfaction} / 5` : '—'} sub={ev.satisfaction ? verdict(ev.satisfaction) : 'À noter ci-dessous'} tone={ev.satisfaction ? scoreColor(ev.satisfaction) : undefined} />
          <Figure label="Note moyenne des fiches" value={overall !== undefined ? `${fmtScore(overall)} / 5` : '—'} sub={verdict(overall)} tone={overall !== undefined ? scoreColor(overall) : undefined} />
        </div>
      </section>

      {/* Bilan général : saisi par l'organisation */}
      <section className="tile p-6">
        <div className="eyebrow text-ink-500 mb-4">Bilan général</div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-xs font-semibold text-ink-600 mb-1.5">Nombre réel de participants</span>
            <input type="number" min={0} inputMode="numeric" className={`${field} h-11 py-0`} placeholder={expected ? `${expected} attendus` : 'ex. 650'}
              value={draft.attendance ?? ''} onChange={(e) => set({ attendance: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) })} />
          </label>
          <div>
            <span className="block text-xs font-semibold text-ink-600 mb-1.5">Satisfaction générale</span>
            <div className="h-11 flex items-center gap-3">
              <Stars label="Satisfaction générale" size={26} value={draft.satisfaction} onChange={(n) => set({ satisfaction: n })} />
              <span className="text-sm text-ink-500">{draft.satisfaction ? verdict(draft.satisfaction) : 'Non notée'}</span>
            </div>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {([
            ['strengths', 'Points forts', 'Ce qui a très bien fonctionné…'],
            ['improvements', 'Points à améliorer', 'Retards, difficultés, manques…'],
            ['recommendations', 'Recommandations pour la prochaine édition', 'Ce qu’il faut changer, garder, prévoir…'],
          ] as const).map(([key, label, ph]) => (
            <label key={key} className="block">
              <span className="block text-xs font-semibold text-ink-600 mb-1.5">{label}</span>
              <textarea rows={5} className={`${field} resize-y`} placeholder={ph} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 mt-4">
          <p role="status" className={`text-sm ${dirty ? 'text-amber-700' : 'text-ink-500'}`}>
            {dirty ? 'Modifications pas encore enregistrées' : 'Tout est enregistré sur cet appareil'}
          </p>
          <button type="button" onClick={saveGeneral} disabled={!dirty}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition ${dirty ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 cursor-default'}`}>
            {dirty ? <><Save size={16} /> Enregistrer</> : <><Check size={16} /> Enregistré</>}
          </button>
        </div>
      </section>

      {/* Performance : une fiche par équipe, intervenant, prestataire, partenaire */}
      <section className="tile p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="eyebrow text-ink-500">Performance</div>
          {kindAvg !== undefined && <span className="text-sm text-ink-600">Moyenne {kindDef(kind).label.toLowerCase()} : <strong style={{ color: scoreColor(kindAvg) }}>{fmtScore(kindAvg)} / 5</strong></span>}
        </div>
        <div role="tablist" aria-label="Que voulez-vous évaluer ?" className="flex flex-wrap gap-1.5 mb-4">
          {EVAL_KINDS.map((k) => {
            const list = ofKind(k.id), on = k.id === kind;
            return (
              <button key={k.id} type="button" role="tab" aria-selected={on} onClick={() => setKind(k.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
                {k.label} <span className={on ? 'text-accent-400' : 'text-ink-500'}>{list.filter(rated).length}/{list.length}</span>
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl bg-[var(--sand)] p-6 text-sm text-ink-600 text-center">
            Rien à évaluer ici pour l’instant. Les fiches viennent du module <Link to={LINKS[kind].to} className="font-semibold text-brand-700 underline">{LINKS[kind].label}</Link>
            {kind === 'prestataire' && ' (prestataires confirmés ou payés)'}{kind === 'partenaire' && ' (partenaires et sponsors confirmés)'}.
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {shown.map((s) => {
              const e = entryOf(s), n = scoreOf(e);
              return (
                <li key={s.key} className="py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-ink-500 truncate">{s.detail}</div>
                    {e?.comment && <div className="text-xs text-ink-600 mt-1 line-clamp-2 italic">« {e.comment} »</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {e?.again && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${e.again === 'Oui' ? 'bg-emerald-50 text-emerald-800' : e.again === 'Non' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                      {e.again === 'Oui' ? 'À reconduire' : e.again === 'Non' ? 'À ne pas reconduire' : 'Avec réserves'}
                    </span>}
                    <Stars label={`Note de ${s.name}`} value={n} size={16} />
                    <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: scoreColor(n) }}>{fmtScore(n)}</span>
                    <button type="button" onClick={() => setEditing(s)}
                      className={`${btn} py-2 ${n === undefined ? 'bg-brand-500 text-white hover:bg-brand-600' : 'ring-1 ring-ink-200 hover:bg-ink-50'}`}>
                      {n === undefined ? <><Star size={15} /> Évaluer</> : <><Pencil size={15} /> Modifier</>}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EvalModal subject={editing} initial={editing ? entryOf(editing) : undefined} eventName={current.name} onClose={close} onSubmit={save} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
          <Check size={16} className="text-accent-400" /> {toast}
        </div>
      )}
    </div>
  );
}
