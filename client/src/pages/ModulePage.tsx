import type { ModuleDef } from '../modules';
import EventSwitcher from '../components/EventSwitcher';
import WmtPage from './WmtPage';
import AccreditationView from './AccreditationPage';
import ExposantsView from './ExposantsPage';
import BilanView from './BilanPage';
import TaskCalendarView from './TaskCalendar';
import { HorairesView, ModerateursView, ThematiquesView } from './ProgrammePage';
import { BudgetView, CommunicationView, Pipeline, ProvidersView, TasksView, TeamsView } from './views';

function Body({ m }: { m: ModuleDef }) {
  switch (m.path) {
    case '/taches': return <TasksView />;
    case '/calendrier': return <TaskCalendarView />;
    case '/horaires': return <HorairesView />;
    case '/thematiques': return <ThematiquesView />;
    case '/moderateurs': return <ModerateursView />;
    case '/organisation': return <BudgetView />;
    case '/partenaires': return <Pipeline kind="partenaires" />;
    case '/sponsors': return <Pipeline kind="sponsors" />;
    case '/exposants': return <ExposantsView />;
    case '/prestataires': return <ProvidersView />;
    case '/communication': return <CommunicationView />;
    case '/equipe': return <TeamsView />;
    case '/accreditations': return <AccreditationView />;
    case '/wmt-academy': return <WmtPage />;
    case '/bilan': return <BilanView />;
    default:
      return (
        <div className="tile p-8">
          <div className="eyebrow text-ink-500 mb-4">Prévu dans ce module</div>
          <ul className="grid sm:grid-cols-2 gap-3">
            {m.features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm"><span className="w-2 h-2 rotate-45 bg-brand-500" />{f}</li>
            ))}
          </ul>
        </div>
      );
  }
}

export default function ModulePage({ module: m }: { module: ModuleDef }) {
  return (
    <div>
      <div className="relative z-20 flex mb-6"><EventSwitcher /></div>
      <h1 className="font-display text-5xl md:text-7xl leading-[0.95] tracking-wide">{m.label}</h1>
      <p className="text-ink-500 mt-3 mb-8 max-w-xl">{m.description}</p>
      <Body m={m} />
      <p className="mt-8 text-xs text-ink-500">Maquette de design — données d’exemple, non réelles.</p>
    </div>
  );
}
