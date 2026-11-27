import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import EnvBanner from './EnvBanner';
import OfflineBanner from './OfflineBanner';
import Sonia from './Sonia';
import CloudAccount from './CloudAccount';
import { dashboard, groups, moduleAt, modulesOf } from '../modules';

const tabBase = 'shrink-0 flex items-center gap-2 px-2.5 sm:px-4 py-3 text-[13px] sm:text-sm rounded-t-2xl transition';
const tabActive = 'bg-white/15 backdrop-blur-sm text-white font-semibold shadow-[inset_0_-3px_0_#00a3cc]';
const tabIdle = 'text-white/80 hover:text-white hover:bg-white/10';

export default function Layout() {
  const { pathname } = useLocation();
  const current = moduleAt(pathname);
  const activeGroup = current?.group;
  // Dans une fiche (ex. une tâche), on masque les onglets du module : le bouton « Retour » suffit.
  const inDetail = !!current && pathname.replace(/\/$/, '') !== current.path;

  // Mouvement progressif : la ligne du titre suit le défilement (sans à-coup) et
  // s'estompe en glissant sous le bandeau d'environnement. Aucune mise en page recalculée.
  const barRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [spacer, setSpacer] = useState(0);
  // Menu plus large que l'écran : flèches et fondu sur les bords pour montrer qu'il continue.
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setEdges({ left: nav.scrollLeft > 4, right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4 });
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => { nav.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);
  // L'onglet actif reste visible quand on change de page.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"], .is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeGroup, pathname]);
  const scrollNav = (dir: 1 | -1) => navRef.current?.scrollBy({ left: dir * Math.max(navRef.current.clientWidth * 0.6, 160), behavior: 'smooth' });
  useLayoutEffect(() => {
    const bar = barRef.current, slide = slideRef.current, title = titleRef.current, nav = navRef.current;
    if (!bar || !slide || !title || !nav) return;
    let shift = 0, current = 0, target = 0, raf = 0;
    const measure = () => { setSpacer(bar.offsetHeight); shift = Math.max(nav.offsetTop - 6, 0); target = Math.min(window.scrollY, shift); };
    // Lissage : on rattrape la cible de 18 % par image, ce qui donne un mouvement amorti.
    const tick = () => {
      current += (target - current) * 0.18;
      if (Math.abs(target - current) < 0.3) current = target;
      slide.style.transform = `translate3d(0, ${-current}px, 0)`;
      title.style.opacity = String(shift ? 1 - (current / shift) * 0.9 : 1);
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => { target = Math.min(window.scrollY, shift); if (!raf) raf = requestAnimationFrame(tick); };
    measure(); current = target; tick();
    const ro = new ResizeObserver(() => { measure(); onScroll(); });
    ro.observe(bar);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);

  return (
    <div className="min-h-screen">
      <div ref={barRef} className="fixed top-0 inset-x-0 z-40">
        <div className="relative z-10"><EnvBanner /><OfflineBanner /></div>
        <div ref={slideRef} className="will-change-transform">
          {/* Bandeau assombri de 40 % : fond #00131a × 0,6 et motif 0,14 × 0,6. */}
          <header className="relative overflow-hidden bg-[#000b10] text-white">
            <div className="pattern bg-[#2a98b8] opacity-[0.084]" />
            <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-4 md:pt-5">
              <div ref={titleRef} className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-display leading-none tracking-wide text-[26px] md:text-4xl">
                    CODES Africa
                  </div>
                  <div className="eyebrow text-white/70 mt-2 hidden sm:block">Planning event</div>
                </div>
                <CloudAccount />
              </div>
              <div className="relative mt-4">
              <nav ref={navRef} aria-label="Menu principal" className="flex gap-1 overflow-x-auto -mx-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <NavLink to="/" end className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabIdle}`}>
                  <dashboard.icon size={16} className="hidden sm:block" />
                  <span className="sm:hidden">{dashboard.short}</span><span className="hidden sm:inline">{dashboard.label}</span>
                </NavLink>
                {groups.map((g) => (
                  <NavLink key={g.id} to={modulesOf(g.id)[0].path} className={`${tabBase} ${activeGroup === g.id ? `${tabActive} is-active` : tabIdle}`}>
                    <g.icon size={16} className="hidden sm:block" />
                    {g.short ? <><span className="sm:hidden">{g.short}</span><span className="hidden sm:inline">{g.label}</span></> : g.label}
                  </NavLink>
                ))}
              </nav>
              {edges.left && (
                <div className="absolute inset-y-0 -left-1 flex items-center pr-8 bg-gradient-to-r from-[#000b10] via-[#000b10]/85 to-transparent">
                  <button type="button" onClick={() => scrollNav(-1)} aria-label="Voir les menus précédents" title="Menus précédents"
                    className="w-8 h-8 rounded-full grid place-items-center bg-brand-500 text-white shadow-lg hover:bg-brand-600 transition"><ChevronLeft size={18} /></button>
                </div>
              )}
              {edges.right && (
                <div className="absolute inset-y-0 -right-1 flex items-center pl-8 bg-gradient-to-l from-[#000b10] via-[#000b10]/85 to-transparent">
                  <button type="button" onClick={() => scrollNav(1)} aria-label="Voir les autres menus" title="Autres menus"
                    className="w-8 h-8 rounded-full grid place-items-center bg-brand-500 text-white shadow-lg hover:bg-brand-600 transition animate-[nudge_1.6s_ease-in-out_2]"><ChevronRight size={18} /></button>
                </div>
              )}
              </div>
            </div>
          </header>
          <div className="chevron-band" />
        </div>
      </div>
      <div style={{ height: spacer }} aria-hidden />

      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Sous-onglets seulement si la famille a plusieurs modules (Équipe et WMT sont directement dans le menu). */}
        {activeGroup && !inDetail && modulesOf(activeGroup).length > 1 && (
          <nav className="flex gap-2 overflow-x-auto mb-6 [scrollbar-width:none]" aria-label="Modules de la famille">
            {modulesOf(activeGroup).map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `shrink-0 flex items-center gap-2 text-sm px-4 py-2 rounded-full transition ${
                    isActive ? 'bg-brand-950 text-white' : 'bg-white/70 text-brand-900 hover:bg-white'
                  }`
                }
              >
                <Icon size={15} /> {label}
              </NavLink>
            ))}
          </nav>
        )}
        <Outlet />
      </main>
      <Sonia />
    </div>
  );
}
