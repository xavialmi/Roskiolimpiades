"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Player = { id:string; name:string; rests:number; wins:number; losses:number; ballsFor:number; ballsAgainst:number };
type Match = { id:string; round:number; roundId:string; a:[string,string]; b:[string,string]; scoreA:number; scoreB:number; winner:"A"|"B"|null; blackEarly:boolean; blackTeam:"A"|"B"|null; done:boolean };
type Round = { id:string; number:number; status:string };
type Pairing = { a:[string,string]; b:[string,string]; rests:string[] };
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const TOURNAMENT_ID="b2d04ab7-f421-4110-82e2-0d08efd25cd1";
const shuffle=<T,>(items:T[])=>[...items].sort(()=>Math.random()-.5);
const pairKey=(a:string,b:string)=>[a,b].sort().join(":");

function createPairing(players:Player[],matches:Match[]):Pairing|null {
  if(players.length<4)return null;
  const min=Math.min(...players.map(p=>p.rests));
  const pool=players.filter(p=>p.rests<=min+1);
  let best:{chosen:Player[];teams:[Player[],Player[]];cost:number}|null=null;
  for(let k=0;k<900;k++){
    const chosen=shuffle(pool).slice(0,4);
    if(chosen.length<4)continue;
    for(const perm of shuffle([[0,1,2,3],[0,2,1,3],[0,3,1,2]])){
      const teams:[[Player,Player],[Player,Player]]=[[chosen[perm[0]],chosen[perm[1]]],[chosen[perm[2]],chosen[perm[3]]]];
      let cost=0;
      for(const old of matches){
        const oldPairs=[old.a,old.b];
        for(const team of teams)if(oldPairs.some(x=>pairKey(x[0],x[1])===pairKey(team[0].id,team[1].id)))cost+=12;
        for(const x of teams[0])for(const y of teams[1]){
          if(oldPairs.some(pair=>pair.includes(x.id)&&pair.includes(y.id)))cost+=3;
        }
      }
      if(!best||cost<best.cost)best={chosen,teams,cost};
    }
  }
  if(!best)return null;
  const used=new Set(best.chosen.map(p=>p.id));
  return {a:[best.teams[0][0].id,best.teams[0][1].id],b:[best.teams[1][0].id,best.teams[1][1].id],rests:players.filter(p=>!used.has(p.id)).map(p=>p.id)};
}

export default function BilliardsPage(){
  const [players,setPlayers]=useState<Player[]>([]);
  const [globalPlayers,setGlobalPlayers]=useState<{id:string;name:string}[]>([]);
  const [matches,setMatches]=useState<Match[]>([]);
  const [rounds,setRounds]=useState<Round[]>([]);
  const [activeRound,setActiveRound]=useState(1);
  const [selectedGlobal,setSelectedGlobal]=useState("");
  const [roundsToGenerate,setRoundsToGenerate]=useState(8);
  const [session,setSession]=useState<any>(null);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [tournamentStatus,setTournamentStatus]=useState("draft");
  const isAdmin=session?.user?.app_metadata?.role==="admin";

  const load=useCallback(async()=>{
    setLoading(true);
    const [peopleRes,entriesRes,roundsRes,matchesRes,linksRes,restsRes,tournamentRes]=await Promise.all([
      db.from("participants").select("id,display_name").eq("is_active",true).order("display_name"),
      db.from("tournament_entries").select("participant_id,participants!inner(id,display_name)").eq("tournament_id",TOURNAMENT_ID),
      db.from("tournament_rounds").select("id,round_number,status").eq("tournament_id",TOURNAMENT_ID).order("round_number"),
      db.from("tournament_matches").select("id,round_id,score_a,score_b,winner_side,early_black,black_loser_side,status").order("created_at"),
      db.from("tournament_match_participants").select("match_id,participant_id,side,position_in_side"),
      db.from("tournament_round_resting").select("round_id,participant_id"),
      db.from("tournaments").select("status").eq("id",TOURNAMENT_ID).single()
    ]);
    const err=[peopleRes,entriesRes,roundsRes,matchesRes,linksRes,restsRes,tournamentRes].find(x=>x.error)?.error;
    if(err){setNotice(err.message);setLoading(false);return;}
    const people=(peopleRes.data||[]).map((p:any)=>({id:p.id,name:p.display_name}));
    setGlobalPlayers(people);
    const selected=(entriesRes.data||[]).map((e:any)=>({id:e.participants.id,name:e.participants.display_name,rests:0,wins:0,losses:0,ballsFor:0,ballsAgainst:0}));
    const roundRows=(roundsRes.data||[]) as any[];
    const roundNumberById=new Map(roundRows.map(r=>[r.id,r.round_number]));
    const grouped=new Map<string,{a:string[];b:string[]}>();
    for(const link of linksRes.data||[]){
      const item=grouped.get(link.match_id)||{a:[],b:[]};
      (link.side==="A"?item.a:item.b)[Number(link.position_in_side)-1]=link.participant_id;
      grouped.set(link.match_id,item);
    }
    const matchRows:Match[]=(matchesRes.data||[]).map((m:any)=>{
      const pair=grouped.get(m.id)||{a:[],b:[]};
      return {id:m.id,round:roundNumberById.get(m.round_id)||1,roundId:m.round_id,a:[pair.a[0],pair.a[1]] as [string,string],b:[pair.b[0],pair.b[1]] as [string,string],scoreA:m.score_a,scoreB:m.score_b,winner:m.winner_side,blackEarly:m.early_black,blackTeam:m.black_loser_side,done:m.status==="completed"};
    });
    const restsByRound=new Map<string,string[]>();
    for(const r of restsRes.data||[])restsByRound.set(r.round_id,[...(restsByRound.get(r.round_id)||[]),r.participant_id]);
    const stats=new Map(selected.map(p=>[p.id,{...p}]));
    for(const r of roundRows){
      for(const id of restsByRound.get(r.id)||[]){const p=stats.get(id);if(p)p.rests++;}
    }
    for(const m of matchRows.filter(x=>x.done)){
      const winner=m.winner==="A"?m.a:m.b;
      const loser=m.winner==="A"?m.b:m.a;
      const winnerFor=m.winner==="A"?m.scoreA:m.scoreB;
      const winnerAgainst=m.winner==="A"?m.scoreB:m.scoreA;
      for(const id of winner){const p=stats.get(id);if(p){p.wins++;p.ballsFor+=winnerFor;p.ballsAgainst+=winnerAgainst;}}
      for(const id of loser){const p=stats.get(id);if(p){p.losses++;p.ballsFor+=winnerAgainst;p.ballsAgainst+=winnerFor;}}
    }
    setPlayers([...stats.values()]);
    setMatches(matchRows);
    setRounds(roundRows.map(r=>({id:r.id,number:r.round_number,status:r.status})));
    setTournamentStatus(tournamentRes.data?.status||"draft");
    if(roundRows.length){
      const firstOpen=roundRows.find(r=>r.status!=="completed")?.round_number;
      setActiveRound(firstOpen||roundRows[roundRows.length-1].round_number);
    }else setActiveRound(1);
    setLoading(false);
  },[]);

  useEffect(()=>{
    db.auth.getSession().then(({data})=>setSession(data.session));
    const {data:auth}=db.auth.onAuthStateChange((_event,next)=>setSession(next));
    void load();
    const channel=db.channel("billar-tournament-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"tournament_entries"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"tournament_rounds"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"tournament_matches"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"tournament_match_participants"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"tournament_round_resting"},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"participants"},()=>void load())
      .subscribe();
    return()=>{auth.subscription.unsubscribe();void db.removeChannel(channel);};
  },[load]);

  const current=matches.find(m=>m.round===activeRound);
  const started=rounds.length>0;
  const standings=useMemo(()=>[...players].sort((a,b)=>b.wins-a.wins||((b.ballsFor-b.ballsAgainst)-(a.ballsFor-a.ballsAgainst))||b.ballsFor-a.ballsFor||a.name.localeCompare(b.name)),[players]);
  const playerName=(id:string)=>players.find(p=>p.id===id)?.name??globalPlayers.find(p=>p.id===id)?.name??"Participant";
  const played=matches.filter(m=>m.done).length;
  const allDone=rounds.length>0&&matches.length===rounds.length&&matches.every(m=>m.done);

  async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice("");const {data,error}=await db.auth.signInWithPassword({email,password});setBusy(false);if(error)setNotice(error.message);else{setSession(data.session);setPassword("");setNotice(data.user.app_metadata?.role==="admin"?"Sessió d'organitzador iniciada.":"Aquest compte no té permisos d'organitzador.");}}
  async function signOut(){await db.auth.signOut();setSession(null);}

  async function addPlayer(){
    if(!isAdmin||!selectedGlobal)return;
    setBusy(true);
    const {error}=await db.from("tournament_entries").insert({tournament_id:TOURNAMENT_ID,participant_id:selectedGlobal});
    setBusy(false);
    if(error)setNotice(error.message);else{setSelectedGlobal("");setNotice("Participant inscrit al torneig.");await load();}
  }
  async function removePlayer(id:string){
    if(!isAdmin||started)return;
    const {error}=await db.from("tournament_entries").delete().eq("tournament_id",TOURNAMENT_ID).eq("participant_id",id);
    if(error)setNotice(error.message);else await load();
  }

  async function generateRounds(count:number){
    if(!isAdmin||players.length<4||started||count<1)return;
    setBusy(true);setNotice("");
    let simulated=players.map(p=>({...p}));
    const generated:Pairing[]=[];
    const historical:Match[]=[];
    for(let n=0;n<count;n++){
      const p=createPairing(simulated,historical);
      if(!p)break;
      generated.push(p);
      const used=new Set([...p.a,...p.b]);
      simulated=simulated.map(x=>({...x,rests:x.rests+(p.rests.includes(x.id)?1:0)}));
      historical.push({id:"sim-"+n,round:n+1,roundId:"",a:p.a,b:p.b,scoreA:0,scoreB:0,winner:null,blackEarly:false,blackTeam:null,done:false});
    }
    if(!generated.length){setBusy(false);setNotice("No s'han pogut generar rondes amb aquests participants.");return;}
    const {data:roundRows,error:roundError}=await db.from("tournament_rounds").insert(generated.map((_,i)=>({tournament_id:TOURNAMENT_ID,round_number:i+1,status:"scheduled"}))).select("id,round_number");
    if(roundError||!roundRows){setBusy(false);setNotice(roundError?.message||"No s'han pogut crear les rondes.");return;}
    const idByNumber=new Map(roundRows.map((r:any)=>[r.round_number,r.id]));
    const matchPayload=generated.map((p,i)=>({round_id:idByNumber.get(i+1),table_number:1,status:"scheduled"}));
    const {data:matchRows,error:matchError}=await db.from("tournament_matches").insert(matchPayload).select("id,round_id");
    if(matchError||!matchRows){
      await db.from("tournament_rounds").delete().in("id",roundRows.map((r:any)=>r.id));
      setBusy(false);setNotice(matchError?.message||"Error creant les partides.");return;
    }
    const links:any[]=[];
    const resting:any[]=[];
    generated.forEach((p,i)=>{
      const roundId=idByNumber.get(i+1);
      const match=matchRows.find((m:any)=>m.round_id===roundId);
      if(!match)return;
      p.a.forEach((id,pos)=>links.push({match_id:match.id,participant_id:id,side:"A",position_in_side:pos+1}));
      p.b.forEach((id,pos)=>links.push({match_id:match.id,participant_id:id,side:"B",position_in_side:pos+1}));
      p.rests.forEach(id=>resting.push({round_id:roundId,participant_id:id}));
    });
    const [linkRes,restRes]=await Promise.all([
      db.from("tournament_match_participants").insert(links),
      resting.length?db.from("tournament_round_resting").insert(resting):Promise.resolve({error:null} as any)
    ]);
    if(linkRes.error||restRes.error){
      await db.from("tournament_rounds").delete().in("id",roundRows.map((r:any)=>r.id));
      setBusy(false);setNotice(linkRes.error?.message||restRes.error?.message||"Error guardant els descansos.");return;
    }
    await db.from("tournaments").update({status:"in_progress"}).eq("id",TOURNAMENT_ID);
    setBusy(false);setNotice("Totes les rondes s'han generat i guardat a la base de dades.");
    await load();
  }

  async function nextRound(){
    const next=activeRound+1;
    if(rounds.some(r=>r.number===next)){setActiveRound(next);return;}
    if(!started)await generateRounds(1);
  }

  async function saveResult(id:string,scoreA:number,scoreB:number,blackEarly:boolean,blackTeam:"A"|"B"){
    if(!isAdmin)return;
    if(scoreA<0||scoreB<0||scoreA>7||scoreB>7||(!blackEarly&&scoreA===scoreB)){setNotice("Revisa el marcador: ha de ser entre 0 i 7 i no pot acabar empatat.");return;}
    const old=matches.find(m=>m.id===id);if(!old)return;
    const winner:"A"|"B"=blackEarly?(blackTeam==="A"?"B":"A"):(scoreA>scoreB?"A":"B");
    setBusy(true);
    const {error}=await db.from("tournament_matches").update({score_a:scoreA,score_b:scoreB,winner_side:winner,early_black:blackEarly,black_loser_side:blackEarly?blackTeam:null,status:"completed"}).eq("id",id);
    if(!error)await db.from("tournament_rounds").update({status:"completed"}).eq("id",old.roundId);
    setBusy(false);
    if(error)setNotice(error.message);else{setNotice("Resultat guardat i sincronitzat.");await load();}
  }

  async function undoLast(){
    if(!isAdmin)return;
    const last=[...matches].filter(m=>m.done).sort((a,b)=>b.round-a.round)[0];
    if(!last||!confirm("Anul·lar l'últim resultat?"))return;
    setBusy(true);
    const {error}=await db.from("tournament_matches").update({score_a:0,score_b:0,winner_side:null,early_black:false,black_loser_side:null,status:"scheduled"}).eq("id",last.id);
    if(!error)await db.from("tournament_rounds").update({status:"scheduled"}).eq("id",last.roundId);
    setBusy(false);
    if(error)setNotice(error.message);else{setNotice("Últim resultat anul·lat.");await load();}
  }

  async function finalizeTournament(){
    if(!isAdmin||!allDone||tournamentStatus==="completed")return;
    const existing=await db.from("tournament_awards").select("id").eq("tournament_id",TOURNAMENT_ID).limit(1);
    if(existing.data?.length){setNotice("Aquest torneig ja té un podi publicat. No es duplicaran els punts.");return;}
    const awards:{tournament_id:string;participant_id:string;placement:number}[]=[];
    let index=0;
    while(index<standings.length&&index<3){
      const first=standings[index];
      const same=(p:Player)=>p.wins===first.wins&&(p.ballsFor-p.ballsAgainst)===(first.ballsFor-first.ballsAgainst)&&p.ballsFor===first.ballsFor;
      const group=standings.filter(same);
      const placement=index+1;
      if(placement<=3)group.forEach(p=>awards.push({tournament_id:TOURNAMENT_ID,participant_id:p.id,placement}));
      index+=group.length;
    }
    if(!awards.length){setNotice("No hi ha resultats per publicar.");return;}
    setBusy(true);
    const {error}=await db.from("tournament_awards").insert(awards);
    if(!error)await db.from("tournaments").update({status:"completed"}).eq("id",TOURNAMENT_ID);
    setBusy(false);
    if(error)setNotice(error.message);else{setNotice("Podi publicat. Els punts ja compten a la classificació general.");await load();}
  }

  return <main className="app">
    <a href="/" className="back-home">← Tots els jocs</a>
    <header className="topbar"><div className="brand"><div className="logo">R</div><div><div className="eyebrow">ROSKIOLIMPIADES</div><h1>Club de billar · Bola 8</h1></div></div><div className="pill">● {tournamentStatus==="completed"?"TORNEIG FINALITZAT":started?"TORNEIG EN MARXA":"TORNEIG PREPARAT"}</div></header>
    <section className="hero"><div><div className="eyebrow">AMERICANA · PARELLES ROTATIVES</div><h2>Que comenci el joc.</h2><p>Una taula, parelles noves i una classificació individual.</p></div><div className="pill">{isAdmin?session.user.email:"Consulta pública"}</div></section>
    {notice&&<div className="panel" style={{marginBottom:14}}>{notice}</div>}
    <section className="stats"><div className="stat"><span>Participants</span><strong>{players.length}</strong></div><div className="stat"><span>Rondes</span><strong>{rounds.length}</strong></div><div className="stat"><span>Partides jugades</span><strong>{played}</strong></div><div className="stat"><span>Pendents</span><strong>{matches.length-played}</strong></div></section>
    <nav className="tabs"><button className="tab active">Torneig</button><a className="tab" href="/#classificacio">Classificació general ↗</a></nav>
    {loading?<div className="empty">Carregant dades del torneig…</div>:<div className="grid">
      <section className="panel"><div className="roundhead"><h3>Participants <span className="muted">({players.length})</span></h3><span className="tag">{isAdmin?"ORGANITZADOR":"LECTURA"}</span></div>
        {isAdmin&& !started&&<div className="addrow"><select className="field" value={selectedGlobal} onChange={e=>setSelectedGlobal(e.target.value)}><option value="">Selecciona un participant global…</option>{globalPlayers.filter(p=>!players.some(x=>x.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="primary" onClick={addPlayer} disabled={!selectedGlobal||busy}>Afegir +</button></div>}
        {isAdmin&&globalPlayers.length===0&&<p className="notice">Afegeix primer participants des de la secció Gestió.</p>}
        <div className="list">{players.length===0?<div className="empty"><strong>Encara no hi ha participants</strong>L'organitzador ha d'inscriure un mínim de quatre persones.</div>:players.map((p,i)=><div className="person" key={p.id}><div className="row"><span className="muted">{String(i+1).padStart(2,"0")}</span><b>{p.name}</b></div><div className="row"><small>{p.wins}V · {p.losses}D · {p.rests} descansos</small>{isAdmin&&!started&&<button className="mini" onClick={()=>removePlayer(p.id)}>×</button>}</div></div>)}</div>
        {isAdmin&&!started&&players.length>=4&&<p className="notice">El sorteig prioritza qui ha descansat menys i intenta evitar repetir companys i rivals.</p>}
      </section>
      <section className="panel"><div className="roundhead"><h3>Rondes del torneig</h3><span className="tag">{rounds.filter(r=>r.status==="completed").length}/{rounds.length} COMPLETES</span></div>
        {!started?<div className="empty"><strong>Encara no hi ha rondes</strong>Inscriu els participants i genera el calendari sencer d'una vegada.</div>:<><div className="tabs">{rounds.map(r=><button key={r.id} className={activeRound===r.number?"tab active":"tab"} onClick={()=>setActiveRound(r.number)}>R{r.number}</button>)}</div>{current?<MatchCard key={current.id} match={current} playerName={playerName} isAdmin={isAdmin} onSave={saveResult}/>:<div className="empty">No s'ha trobat la partida d'aquesta ronda.</div>}<div className="notice">Descansen: {players.filter(p=>!current?.a.includes(p.id)&&!current?.b.includes(p.id)).map(p=>p.name).join(", ")||"Ningú"}</div></>}
        {isAdmin&&!started&&<div style={{display:"flex",gap:8,marginTop:15,alignItems:"center",flexWrap:"wrap"}}><label className="round-count">Nombre de rondes <input className="field" type="number" min="1" max="60" value={roundsToGenerate} onChange={e=>setRoundsToGenerate(Math.max(1,Math.min(60,Number(e.target.value)||1)))}/></label><button className="primary" disabled={players.length<4||busy} onClick={()=>generateRounds(roundsToGenerate)}>{busy?"Generant…":"Generar totes les rondes →"}</button></div>}
        {isAdmin&&started&&<div style={{display:"flex",gap:8,marginTop:15,flexWrap:"wrap"}}><button className="primary" disabled={busy||activeRound>=rounds.length} onClick={nextRound}>Següent ronda →</button><button className="secondary" disabled={busy||played===0} onClick={undoLast}>Desfer últim resultat</button></div>}
        {isAdmin&&allDone&&tournamentStatus!=="completed"&&<button className="primary" style={{width:"100%",marginTop:12}} disabled={busy} onClick={finalizeTournament}>Tancar torneig i publicar podi</button>}
        {isAdmin&&tournamentStatus==="completed"&&<p className="notice">Podi publicat i punts incorporats a la classificació general.</p>}
      </section>
    </div>}
    <section className="panel" style={{marginTop:16}}><div className="roundhead"><h3>Classificació del billar</h3><span className="tag">INDIVIDUAL</span></div><div className="list">{standings.length===0?<div className="empty">La classificació apareixerà quan hi hagi participants.</div>:standings.map((p,i)=><div className="standing" key={p.id}><div className="rank">{i+1}</div><div className="name">{p.name}</div><div className="metric"><b>{p.wins}</b><small>VICTÒRIES</small></div><div className="metric"><b>{p.ballsFor-p.ballsAgainst>0?"+":""}{p.ballsFor-p.ballsAgainst}</b><small>DIF. BOLES</small></div><div className="metric"><b>{p.ballsFor}</b><small>A FAVOR</small></div></div>)}</div><p className="notice">Desempat: victòries → diferència de boles → boles a favor. En cas d'igualtat total, els participants comparteixen la posició i els punts del podi.</p></section>
    <section className="panel" style={{marginTop:16}}><div className="roundhead"><h3>Historial de partides</h3><span className="tag">{matches.length} PARTIDES</span></div>{matches.length===0?<div className="empty">Les partides apareixeran aquí quan es generin les rondes.</div>:<div className="list">{[...matches].sort((a,b)=>b.round-a.round).map(m=><div className="match" key={m.id}><div><div className="tag">RONDA {m.round}</div><small className="muted">{m.done?"Finalitzada":"Pendent"}</small></div><div className="teams"><div className="team">{playerName(m.a[0])} + {playerName(m.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(m.b[0])} + {playerName(m.b[1])}</div></div><b>{m.done?m.scoreA+" – "+m.scoreB:"—"}</b>{m.blackEarly&&<span className="tag">NEGRA</span>}</div>)}</div>}</section>
    {!isAdmin&&<section className="panel" style={{marginTop:16}}><h3>Accés d'organitzador</h3><form className="list" onSubmit={signIn}><input className="field" type="email" required placeholder="Correu electrònic" value={email} onChange={e=>setEmail(e.target.value)}/><input className="field" type="password" required placeholder="Contrasenya" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={busy}>{busy?"Entrant…":"Iniciar sessió"}</button></form></section>}
    {isAdmin&&<button className="secondary" style={{marginTop:14}} onClick={signOut}>Tancar sessió</button>}
    <p className="notice">Les rondes i els resultats es guarden a Supabase i s'actualitzen en directe a tots els dispositius.</p>
  </main>;
}

function MatchCard({match,playerName,isAdmin,onSave}:{match:Match;playerName:(id:string)=>string;isAdmin:boolean;onSave:(id:string,a:number,b:number,black:boolean,blackTeam:"A"|"B")=>void}){
  const [a,setA]=useState(String(match.scoreA));const [b,setB]=useState(String(match.scoreB));const [black,setBlack]=useState(match.blackEarly);const [blackTeam,setBlackTeam]=useState<"A"|"B">(match.blackTeam||"A");
  useEffect(()=>{setA(String(match.scoreA));setB(String(match.scoreB));setBlack(match.blackEarly);setBlackTeam(match.blackTeam||"A");},[match.id,match.scoreA,match.scoreB,match.blackEarly,match.blackTeam]);
  return <div><div className="teams" style={{padding:"20px 0"}}><div className="team">{playerName(match.a[0])}<br/><span className="muted">+</span><br/>{playerName(match.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(match.b[0])}<br/><span className="muted">+</span><br/>{playerName(match.b[1])}</div></div>{match.done?<div className="empty"><strong>{match.winner==="A"?"Guanya parella A":"Guanya parella B"}</strong>{match.scoreA} – {match.scoreB}{match.blackEarly?" · Negra encaixada prematurament":""}</div>:isAdmin?<><div className="score" style={{justifyContent:"center",margin:"12px 0"}}><label className="muted">Parella A</label><input className="field" type="number" min="0" max="7" value={a} onChange={e=>setA(e.target.value)}/><span className="muted">–</span><input className="field" type="number" min="0" max="7" value={b} onChange={e=>setB(e.target.value)}/><label className="muted">Parella B</label></div><label className="row muted" style={{fontSize:12,marginBottom:12}}><input type="checkbox" checked={black} onChange={e=>setBlack(e.target.checked)}/> Negra encaixada abans d'hora (derrota automàtica)</label>{black&&<div className="row" style={{marginBottom:12}}><span className="muted">Quina parella ha encaixat la negra?</span><select className="field" value={blackTeam} onChange={e=>setBlackTeam(e.target.value as "A"|"B")}><option value="A">Parella A</option><option value="B">Parella B</option></select></div>}<button className="primary" style={{width:"100%"}} onClick={()=>onSave(match.id,Number(a),Number(b),black,blackTeam)}>Guardar resultat</button><p className="notice">Introdueix les boles legals encaixades abans del tir de la negra. La negra no suma ni resta boles.</p></>:<div className="empty">Partida pendent de resultat.</div>}</div>;
}
