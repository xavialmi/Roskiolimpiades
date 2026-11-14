"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Game = { id: string; slug: string; name: string; description: string; icon: string; is_active: boolean };
type Participant = { id: string; display_name: string; avatar_url: string | null; bio: string; is_active: boolean };
type Edition = { id: string; year: number; name: string };
type Tournament = { id: string; name: string; status: string; format: string; edition_id: string; game_id: string };
type Team = { id: string; name: string; description: string };
type Leader = { participant_id: string; display_name: string; avatar_url: string | null; total_points: number; podium_tournaments: number };
type Tab = "inici" | "classificacio" | "jocs" | "participants" | "gestio";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
let client: SupabaseClient | null = null;
function getSupabase() {
  if (!client && supabaseUrl && supabaseKey) client = createClient(supabaseUrl, supabaseKey);
  return client;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "inici", label: "Inici", icon: "⌂" },
  { id: "classificacio", label: "Classificació", icon: "♜" },
  { id: "jocs", label: "Jocs", icon: "◈" },
  { id: "participants", label: "Participants", icon: "♙" },
  { id: "gestio", label: "Gestió", icon: "⚙" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("inici");
  const [games, setGames] = useState<Game[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [editionFilter, setEditionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [newParticipant, setNewParticipant] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingParticipantName, setEditingParticipantName] = useState("");
  const [newGame, setNewGame] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db) { setError("Falten les variables de connexió amb Supabase."); setLoading(false); return; }
    setError("");
    const [g, p, e, t, tm, l] = await Promise.all([
      db.from("games").select("*").eq("is_active", true).order("sort_order"),
      db.from("participants").select("*").eq("is_active", true).order("display_name"),
      db.from("editions").select("*").order("year", { ascending: false }),
      db.from("tournaments").select("*").order("created_at", { ascending: false }),
      db.from("teams").select("*").eq("is_active", true).order("name"),
      db.from("participant_leaderboard").select("*").order("total_points", { ascending: false }).order("display_name"),
    ]);
    const firstError = [g,p,e,t,tm,l].find(x => x.error)?.error;
    if (firstError) setError(firstError.message);
    if (g.data) setGames(g.data as Game[]);
    if (p.data) setParticipants(p.data as Participant[]);
    if (e.data) setEditions(e.data as Edition[]);
    if (t.data) setTournaments(t.data as Tournament[]);
    if (tm.data) setTeams(tm.data as Team[]);
    if (l.data) setLeaders(l.data as Leader[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const syncTabFromHash = () => {
      const target = window.location.hash.replace("#", "");
      if (["inici", "classificacio", "jocs", "participants", "gestio"].includes(target)) setTab(target as Tab);
    };
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  useEffect(() => {
    const db = getSupabase();
    if (!db) { setLoading(false); setError("No s'ha pogut inicialitzar Supabase. Revisa les variables d'entorn de Vercel."); return; }
    void load();
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: authListener } = db.auth.onAuthStateChange((_event, next) => setSession(next));
    const channel = db.channel("roskiolimpiades-live")
      .on("postgres_changes", { event: "*", schema: "public" }, () => { void load(); })
      .subscribe();
    return () => { authListener.subscription.unsubscribe(); void db.removeChannel(channel); };
  }, [load]);

  const isAdmin = session?.user?.app_metadata?.role === "admin";
  const totalPoints = useMemo(() => leaders.reduce((sum, p) => sum + Number(p.total_points || 0), 0), [leaders]);
  const selectedEdition = editions.find(e => e.id === editionFilter);
  const [editionLeaders, setEditionLeaders] = useState<Leader[]>([]);
  useEffect(() => {
    const db = getSupabase();
    if (!db || editionFilter === "all") { setEditionLeaders([]); return; }
    db.from("participant_edition_leaderboard").select("participant_id,display_name,edition_points,podium_tournaments")
      .eq("edition_id", editionFilter).order("edition_points", { ascending: false }).then(({ data }) => {
        setEditionLeaders((data || []).map((x: any) => ({ ...x, total_points: x.edition_points })));
      });
  }, [editionFilter]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); const db = getSupabase(); if (!db) return;
    setLoginBusy(true); setNotice("");
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    setLoginBusy(false);
    if (error) setNotice(error.message);
    else { setSession(data.session); setPassword(""); setNotice(data.user.app_metadata?.role === "admin" ? "Sessió d'organitzador iniciada." : "Compte autenticat, però encara no té permisos d'organitzador."); }
  }
  async function createOrganizerAccount() {
    const db = getSupabase();
    if (!db) return;
    if (email.trim().toLowerCase() !== "xavialmirall4@gmail.com") {
      setNotice("Aquest registre inicial està restringit al correu d'organitzador autoritzat.");
      return;
    }
    if (password.length < 8) {
      setNotice("La contrasenya ha de tenir almenys 8 caràcters.");
      return;
    }
    setSignupBusy(true); setNotice("");
    const { data, error } = await db.auth.signUp({
      email: "xavialmirall4@gmail.com",
      password,
      options: { emailRedirectTo: "https://roskiolimpiades.vercel.app" }
    });
    setSignupBusy(false);
    if (error) { setNotice(error.message); return; }
    setPassword("");
    if (data.session) {
      setSession(data.session);
      setNotice("Compte creat. El rol d'organitzador s'ha assignat automàticament.");
    } else {
      setNotice("T'hem enviat un correu de confirmació. Confirma'l i després inicia sessió amb la contrasenya que acabes de crear.");
    }
  }
  async function signOut() { const db = getSupabase(); if (db) await db.auth.signOut(); setSession(null); }
  async function addParticipant() {
    const db = getSupabase(); const name = newParticipant.trim(); if (!db || !name || !isAdmin) return;
    const { error } = await db.from("participants").insert({ display_name: name });
    if (error) setNotice(error.message); else { setNewParticipant(""); setNotice("Participant afegit."); await load(); }
  }
  async function saveParticipant(id: string) {
    const db = getSupabase();
    const name = editingParticipantName.trim();
    if (!db || !isAdmin || !name) return;
    setNotice("");
    const { error } = await db.from("participants").update({ display_name: name, updated_at: new Date().toISOString() }).eq("id", id).select("id").single();
    if (error) { setNotice("No s'ha pogut actualitzar el participant: " + error.message); return; }
    setEditingParticipantId(null);
    setEditingParticipantName("");
    setNotice("Participant actualitzat correctament.");
    await load();
  }
  async function deleteParticipant(id: string, name: string) {
    const db = getSupabase();
    if (!db || !isAdmin || !window.confirm(`Vols eliminar definitivament ${name}? Si ja té partides o resultats, no es podrà eliminar per protegir l'historial.`)) return;
    setNotice("");
    const { error } = await db.from("participants").delete().eq("id", id).select("id").single();
    if (error) {
      const linked = /foreign key|violates.*constraint|still referenced/i.test(error.message);
      setNotice(linked ? "No es pot eliminar perquè aquest participant ja està vinculat a un torneig o a resultats. Així protegim l'historial." : "No s'ha pogut eliminar el participant: " + error.message);
      return;
    }
    setEditingParticipantId(null);
    setEditingParticipantName("");
    setNotice("Participant eliminat.");
    await load();
  }
  async function addGame() {
    const db = getSupabase(); const name = newGame.trim(); if (!db || !name || !isAdmin) return;
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await db.from("games").insert({ name, slug, description: "Nova competició de les Roskiolimpiades", icon: "🏆", sort_order: 100 });
    if (error) setNotice(error.message); else { setNewGame(""); setNotice("Joc creat."); await load(); }
  }
  async function addTeam() {
    const db = getSupabase(); const name = newTeam.trim(); if (!db || !name || !isAdmin) return;
    const { error } = await db.from("teams").insert({ name });
    if (error) setNotice(error.message); else { setNewTeam(""); setNotice("Equip creat. Els seus membres es vincularan a cada torneig."); await load(); }
  }

  const visibleLeaders = editionFilter === "all" ? leaders : editionLeaders;
  const rankingTitle = editionFilter === "all" ? "Classificació històrica" : "Classificació " + (selectedEdition?.year ?? "");
  const tournamentCount = tournaments.filter(t => t.status !== "cancelled").length;

  return <main className="shell">
    <header className="site-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab("inici"); }}>
        <img className="brand-mark-image" src="/roskiolimpiades-icon.jpg" alt="Roskiolimpiades" />
        <span><small>ROSKIOLIMPIADES</small><strong>La competició continua.</strong></span>
      </a>
      <div className="header-right"><span className="live-dot"/> <span>EDICIÓ OBERTA</span></div>
    </header>

    {error && <div className="alert">{error}</div>}
    {notice && <div className="notice-bar" onClick={() => setNotice("")}>{notice} <span>×</span></div>}

    {tab === "inici" && <section className="page-content">
      <div className="hero-panel">
        <div className="eyebrow">UNA SOLA COMUNITAT · MOLTES COMPETICIONS</div>
        <h1>Benvinguts a les<br/><em>Roskiolimpiades.</em></h1>
        <p>Juga, competeix i deixa empremta a la classificació general.</p>
        <button className="button button-primary" onClick={() => setTab("jocs")}>Explorar els jocs <span>↗</span></button>
        <div className="hero-stamp">ROSKI<br/>OLIMPIADES<br/><b>★ 2026</b></div>
      </div>
      <div className="section-heading"><div><span className="eyebrow">EL QUE ESTÀ PASSANT</span><h2>Les competicions</h2></div><button className="text-button" onClick={() => setTab("jocs")}>Veure tots els jocs ↗</button></div>
      <div className="game-grid">
        {games.slice(0,3).map(game => <button className="game-card" key={game.id} onClick={() => game.slug === "billar" ? location.assign("/billar") : setTab("jocs")}>
          <div className="game-icon">{game.icon}</div><div className="game-card-bottom"><span className="status-chip status-ready">DISPONIBLE</span><h3>{game.name}</h3><p>{game.description}</p><span className="card-arrow">↗</span></div>
        </button>)}
        <button className="game-card game-placeholder" onClick={() => setTab("jocs")}><div className="game-icon">＋</div><div className="game-card-bottom"><span className="status-chip">PRÒXIMAMENT</span><h3>El següent repte</h3><p>Els nous jocs s'afegiran aquí.</p></div></button>
      </div>
      <div className="home-bottom-grid">
        <div className="feature-card"><span className="eyebrow">RÀNQUING GLOBAL</span><h2>Una classificació.<br/>Tots els anys.</h2><p>Els punts s'acumulen edició rere edició. Cada podi compta.</p><button className="text-button" onClick={() => setTab("classificacio")}>Consultar classificació ↗</button></div>
        <div className="quick-stats"><div><strong>{participants.length}</strong><span>Participants</span></div><div><strong>{games.length}</strong><span>Jocs actius</span></div><div><strong>{tournamentCount}</strong><span>Tornejos</span></div></div>
      </div>
    </section>}

    {tab === "classificacio" && <section className="page-content">
      <div className="page-title"><span className="eyebrow">EL PALMARÈS</span><h1>Classificació <em>general.</em></h1><p>Una única classificació individual. Els punts dels tornejos per equips també es reparteixen entre les persones que els formen.</p></div>
      <div className="ranking-toolbar"><div><span className="eyebrow">PUNTS ACUMULATS</span><strong>{visibleLeaders.reduce((s,p)=>s+Number(p.total_points||0),0).toLocaleString("ca-ES")} <small>pts entre tots</small></strong></div><select value={editionFilter} onChange={e => setEditionFilter(e.target.value)}><option value="all">Tots els anys · Històric</option>{editions.map(e => <option key={e.id} value={e.id}>{e.year} · Només aquesta edició</option>)}</select></div>
      <div className="ranking-list"><div className="ranking-head"><span>POS.</span><span>PARTICIPANT</span><span>PODIS</span><span>PUNTS</span></div>
        {loading ? <div className="empty-state">Carregant classificació…</div> : visibleLeaders.length === 0 ? <div className="empty-state">Encara no hi ha punts assignats. Els podis dels tornejos apareixeran aquí.</div> : visibleLeaders.map((person,i)=><div className={"ranking-row "+(i<3?"podium":"")} key={person.participant_id}><span className="rank-number">{String(i+1).padStart(2,"0")}</span><span className="rank-person"><span className="avatar">{person.display_name.slice(0,1).toUpperCase()}</span><b>{person.display_name}</b></span><span className="rank-podiums">{person.podium_tournaments || 0}</span><strong className="rank-points">{Number(person.total_points).toLocaleString("ca-ES")} <small>pts</small></strong></div>)}
      </div>
      <div className="points-key"><span><b>3 pts</b> · 1r lloc</span><span><b>2 pts</b> · 2n lloc</span><span><b>1 pt</b> · 3r lloc</span><span>Empats: repartiment dels punts ocupats</span></div>
    </section>}

    {tab === "jocs" && <section className="page-content">
      <div className="page-title"><span className="eyebrow">EL CATÀLEG</span><h1>Tria el teu <em>joc.</em></h1><p>Cada joc té les seves regles, però tots sumen a la mateixa classificació individual.</p></div>
      <div className="game-grid game-grid-large">
        {games.map(game=><button className="game-card" key={game.id} onClick={() => game.slug === "billar" ? location.assign("/billar") : setNotice("Aquest joc encara no té el seu torneig configurat.")}><div className="game-icon">{game.icon}</div><div className="game-card-bottom"><span className="status-chip status-ready">JOC ACTIU</span><h3>{game.name}</h3><p>{game.description}</p><span className="card-arrow">↗</span></div></button>)}
        <div className="game-card game-placeholder"><div className="game-icon">＋</div><div className="game-card-bottom"><span className="status-chip">PROPERAMENT</span><h3>Nous reptes</h3><p>Afegirem més competicions durant les Roskiolimpiades.</p></div></div>
      </div>
      <div className="info-strip"><b>Com es guanyen punts?</b><span>Els tres primers classificats de cada torneig obtenen 3, 2 i 1 punts. En competicions per equips, cada integrant rep els mateixos punts individualment.</span></div>
    </section>}

    {tab === "participants" && <section className="page-content">
      <div className="page-title"><span className="eyebrow">LA COMUNITAT</span><h1>Tots els <em>participants.</em></h1><p>Un únic registre per a totes les competicions. No cal crear un compte per aparèixer al rànquing.</p></div>
      <div className="participant-summary"><strong>{participants.length}</strong><span>participants registrats</span></div>
      <div className="participant-grid">{participants.map((p,i)=><div className="participant-card" key={p.id}><span className="avatar avatar-large">{p.display_name.slice(0,1).toUpperCase()}</span><div><b>{p.display_name}</b><small>Participant #{String(i+1).padStart(3,"0")}</small></div></div>)}</div>
      {participants.length===0 && <div className="empty-state">Encara no hi ha participants. L'organitzador podrà afegir-los des de Gestió.</div>}
    </section>}

    {tab === "gestio" && <section className="page-content">
      <div className="page-title"><span className="eyebrow">ZONA PRIVADA</span><h1>Panell de <em>gestió.</em></h1><p>Només l'organització pot modificar participants, jocs, equips i resultats.</p></div>
      {!session ? <form className="login-card" onSubmit={signIn}><h2>Accés d'organitzador</h2><label>Correu electrònic<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="organitzador@exemple.com"/></label><label>Contrasenya<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required placeholder="Contrasenya"/></label><button className="button button-primary" disabled={loginBusy}>{loginBusy?"Entrant…":"Iniciar sessió"}</button><button type="button" className="button button-secondary" disabled={signupBusy||loginBusy} onClick={createOrganizerAccount}>{signupBusy?"Creant compte…":"Crear el meu compte d'organitzador"}</button><small>El primer compte està restringit al correu autoritzat. No hi ha registre públic general.</small></form> : !isAdmin ? <div className="login-card"><h2>Falten permisos</h2><p>Aquest usuari ha d'obtenir el rol d'organitzador (app_metadata.role = admin) a Supabase.</p><button className="button button-secondary" onClick={signOut}>Tancar sessió</button></div> : <div className="management-grid">
        <div className="management-card"><div className="section-heading"><h2>Participants</h2><span>{participants.length}</span></div><div className="inline-form"><input value={newParticipant} onChange={e=>setNewParticipant(e.target.value)} placeholder="Nom i cognoms"/><button onClick={addParticipant}>Afegir</button></div><div className="management-participant-list">{participants.map(p=><div className="management-participant" key={p.id}>{editingParticipantId===p.id?<><input className="participant-edit-input" aria-label="Nom del participant" value={editingParticipantName} onChange={e=>setEditingParticipantName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void saveParticipant(p.id);}}/><button onClick={()=>void saveParticipant(p.id)} disabled={!editingParticipantName.trim()}>Desar</button><button className="button button-secondary" onClick={()=>setEditingParticipantId(null)}>×</button></>:<><span>{p.display_name}</span><button className="text-button" onClick={()=>{setEditingParticipantId(p.id);setEditingParticipantName(p.display_name);}}>Editar</button><button className="text-button participant-delete" onClick={()=>void deleteParticipant(p.id,p.display_name)}>Eliminar</button></>}</div>)}</div><small>Registre global compartit per tots els jocs. Els canvis de nom es reflecteixen a tots els tornejos.</small></div>
        <div className="management-card"><div className="section-heading"><h2>Jocs</h2><span>{games.length}</span></div><div className="inline-form"><input value={newGame} onChange={e=>setNewGame(e.target.value)} placeholder="Nom del nou joc"/><button onClick={addGame}>Crear</button></div><small>Els jocs nous quedaran disponibles al catàleg.</small></div>
        <div className="management-card"><div className="section-heading"><h2>Equips</h2><span>{teams.length}</span></div><div className="inline-form"><input value={newTeam} onChange={e=>setNewTeam(e.target.value)} placeholder="Nom de l'equip"/><button onClick={addTeam}>Crear</button></div><small>Els equips conserven identitat i historial; els punts sempre van a les persones.</small></div>
        <div className="management-card"><div className="section-heading"><h2>Edicions</h2><span>{editions.length}</span></div>{editions.map(e=><p key={e.id}>{e.name}</p>)}<small>La classificació històrica no es reinicia mai.</small></div>
        <div className="management-card"><div className="section-heading"><h2>Compte</h2></div><p>{session.user.email}</p><button className="button button-secondary" onClick={signOut}>Tancar sessió</button></div>
      </div>}
    </section>}

    <footer className="site-footer"><span>ROSKIOLIMPIADES</span><span>Una competició. Mil històries.</span></footer>
    <nav className="bottom-dock" aria-label="Navegació principal">
      {tabs.map(item=><button key={item.id} className={tab===item.id?"dock-item active":"dock-item"} onClick={()=>setTab(item.id)}><span className="dock-icon">{item.icon}</span><small>{item.label}</small></button>)}
    </nav>
  </main>;
}
