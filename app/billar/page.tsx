"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Player = { id:string; name:string; rests:number; played:number; wins:number; losses:number; ballsFor:number; ballsAgainst:number };
type Match = { id:string; round:number; roundId:string; a:[string,string]; b:[string,string]; scoreA:number; scoreB:number; winner:"A"|"B"|null; blackEarly:boolean; blackTeam:"A"|"B"|null; done:boolean };
type Round = { id:string; number:number; status:string };
type Pairing = { a:[string,string]; b:[string,string]; rests:string[] };
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const TOURNAMENT_ID="b2d04ab7-f421-4110-82e2-0d08efd25cd1";
const shuffle=<T,>(items:T[])=>[...items].sort(()=>Math.random()-.5);
const pairKey=(a:string,b:string)=>[a,b].sort().join(":");

function combinations<T,>(items:T[],size:number):T[][] {
  const result:T[][]=[];
  function visit(from:number,chosen:T[]){
    if(chosen.length===size){result.push(chosen);return;}
    for(let i=from;i<=items.length-(size-chosen.length);i++)visit(i+1,[...chosen,items[i]]);
  }
  visit(0,[]);
  return result;
}

function createSchedule(players:Player[]):Pairing[] {
  const edges=combinations(players,2).map(pair=>[pair[0].id,pair[1].id] as [string,string]);
  const n=edges.length;
  const full=(1n<<BigInt(n))-1n;
  function solve(mask:bigint,memo:Set<string>):[number,number][]|null {
    if(mask===0n)return [];
    const key=mask.toString();
    if(memo.has(key))return null;
    let first=-1;
    for(let i=0;i<n;i++)if(mask&(1n<<BigInt(i))){first=i;break;}
    if(first<0)return [];
    const bit=1n<<BigInt(first),a=edges[first],candidates:number[]=[];
    for(let j=first+1;j<n;j++)if(mask&(1n<<BigInt(j))){
      const b=edges[j];
      if(a[0]!==b[0]&&a[0]!==b[1]&&a[1]!==b[0]&&a[1]!==b[1])candidates.push(j);
    }
    candidates.sort(()=>Math.random()-.5);
    for(const j of candidates){
      const rest=solve(mask^bit^(1n<<BigInt(j)),memo);
      if(rest)return [[first,j],...rest];
    }
    if(mask.toString(2).replace(/0/g,"").length%2===1){
      const rest=solve(mask^bit,memo);
      if(rest)return rest;
    }
    memo.add(key);return null;
  }
  for(let attempt=0;attempt<30;attempt++){
    const shuffled=shuffle(edges);
    edges.splice(0,edges.length,...shuffled);
    const result=solve(full,new Set());
    if(result)return result.map(([i,j])=>{
      const a=edges[i],b=edges[j];
      return {a,b,rests:players.filter(p=>![...a,...b].includes(p.id)).map(p=>p.id)};
    });
  }
  return [];
}

export default function BilliardsPage(){
  const [players,setPlayers]=useState<Player[]>([]);
  const [globalPlayers,setGlobalPlayers]=useState<{id:string;name:string}[]>([]);
  const [matches,setMatches]=useState<Match[]>([]);
  const [rounds,setRounds]=useState<Round[]>([]);
  const [activeRound,setActiveRound]=useState(1);
  const [selectedGlobals,setSelectedGlobals]=useState<string[]>([]);
  const [roundsToGenerate,setRoundsToGenerate]=useState(0);
  const [editingPlayer,setEditingPlayer]=useState<string|null>(null);
  const [editingName,setEditingName]=useState("");
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
    const [peopleRes,entriesRes,roundsRes,tournamentRes]=await Promise.all([
      db.from("participants").select("id,display_name").eq("is_active",true).order("display_name"),
      db.from("tournament_entries").select("participant_id,participants!inner(id,display_name)").eq("tournament_id",TOURNAMENT_ID),
      db.from("tournament_rounds").select("id,round_number,status").eq("tournament_id",TOURNAMENT_ID).order("round_number"),
      db.from("tournaments").select("status").eq("id",TOURNAMENT_ID).single()
    ]);
    const roundIds=(roundsRes.data||[]).map((r:any)=>r.id);
    const [matchesRes,restsRes]=roundIds.length?await Promise.all([
      db.from("tournament_matches").select("id,round_id,score_a,score_b,winner_side,early_black,black_loser_side,status").in("round_id",roundIds).order("created_at"),
      db.from("tournament_round_resting").select("round_id,participant_id").in("round_id",roundIds)
    ]):[
      {data:[],error:null} as any,
      {data:[],error:null} as any
    ];
    const matchIds=(matchesRes.data||[]).map((m:any)=>m.id);
    const actualLinks=matchIds.length?await db.from("tournament_match_participants").select("match_id,participant_id,side,position_in_side").in("match_id",matchIds):{data:[],error:null} as any;
    const err=[peopleRes,entriesRes,roundsRes,tournamentRes,matchesRes,restsRes,actualLinks].find(x=>x.error)?.error;
    if(err){setNotice(err.message);setLoading(false);return;}
    const people=(peopleRes.data||[]).map((p:any)=>({id:p.id,name:p.display_name}));
    setGlobalPlayers(people);
    const selected=(entriesRes.data||[]).map((e:any)=>({id:e.participants.id,name:e.participants.display_name,rests:0,played:0,wins:0,losses:0,ballsFor:0,ballsAgainst:0}));
    const roundRows=(roundsRes.data||[]) as any[];
    const roundNumberById=new Map(roundRows.map(r=>[r.id,r.round_number]));
    const grouped=new Map<string,{a:string[];b:string[]}>();
    for(const link of actualLinks.data||[]){
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
    for(const m of matchRows){for(const id of [...m.a,...m.b]){const p=stats.get(id);if(p)p.played++;}}
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
  const suggestedRounds=useMemo(()=>players.length>=4?Math.floor((players.length*(players.length-1)/2)/2):0,[players.length]);
  useEffect(()=>{if(!started)setRoundsToGenerate(suggestedRounds);},[suggestedRounds,started]);
  const standings=useMemo(()=>[...players].sort((a,b)=>b.wins-a.wins||((b.ballsFor-b.ballsAgainst)-(a.ballsFor-a.ballsAgainst))||b.ballsFor-a.ballsFor||a.name.localeCompare(b.name)),[players]);
  const playerName=(id:string)=>players.find(p=>p.id===id)?.name??globalPlayers.find(p=>p.id===id)?.name??"Participant";
  const played=matches.filter(m=>m.done).length;
  const allDone=rounds.length>0&&matches.length===rounds.length&&matches.every(m=>m.done);

  async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice("");const {data,error}=await db.auth.signInWithPassword({email,password});setBusy(false);if(error)setNotice(error.message);else{setSession(data.session);setPassword("");setNotice(data.user.app_metadata?.role==="admin"?"Sessió d'organitzador iniciada.":"Aquest compte no té permisos d'organitzador.");}}
  async function signOut(){await db.auth.signOut();setSession(null);}

  async function addPlayers(){
    if(!isAdmin||!selectedGlobals.length||started)return;
    setBusy(true);setNotice("");
    const ids=selectedGlobals.filter(id=>!players.some(p=>p.id===id));
    const {error}=await db.from("tournament_entries").insert(ids.map(participant_id=>({tournament_id:TOURNAMENT_ID,participant_id})));
    setBusy(false);
    if(error)setNotice(error.message);else{setSelectedGlobals([]);setNotice(`${ids.length} participants inscrits al torneig.`);await load();}
  }
  async function savePlayerName(id:string){
    if(!isAdmin||!editingName.trim())return;
    setBusy(true);setNotice("");
    const {error}=await db.from("participants").update({display_name:editingName.trim()}).eq("id",id);
    setBusy(false);
    if(error)setNotice(error.message);else{setNotice("Participant actualitzat.");setEditingPlayer(null);await load();}
  }
  async function removePlayer(id:string){
    if(!isAdmin||started)return;
    const {error}=await db.from("tournament_entries").delete().eq("tournament_id",TOURNAMENT_ID).eq("participant_id",id);
    if(error)setNotice(error.message);else await load();
  }

  async function generateRounds(count:number){
    if(!isAdmin||players.length<4||started||count<1)return;
    setBusy(true);setNotice("");
    const schedule=createSchedule(players);
    if(!schedule.length){setBusy(false);setNotice("No s'ha pogut construir un calendari sense repetir parelles. Torna-ho a provar.");return;}
    const generated=schedule.slice(0,Math.min(count,schedule.length));
    if(generated.length<count){setBusy(false);setNotice("El màxim calendari vàlid per a "+players.length+" participants és de "+schedule.length+" rondes. No es crearan rondes amb parelles repetides.");return;}
    const {data:roundRows,error:roundError}=await db.from("tournament_rounds").insert(generated.map((_,i)=>({tournament_id:TOURNAMENT_ID,round_number:i+1,status:"scheduled"}))).select("id,round_number");
    if(roundError||!roundRows){setBusy(false);setNotice(roundError?.message||"No s'han pogut crear les rondes.");return;}
    const idByNumber=new Map(roundRows.map((r:any)=>[r.round_number,r.id]));
    const {data:matchRows,error:matchError}=await db.from("tournament_matches").insert(generated.map((_,i)=>({round_id:idByNumber.get(i+1),table_number:1,status:"scheduled"}))).select("id,round_id");
    if(matchError||!matchRows){await db.from("tournament_rounds").delete().in("id",roundRows.map((r:any)=>r.id));setBusy(false);setNotice(matchError?.message||"Error creant les partides.");return;}
    const links:any[]=[],resting:any[]=[];
    generated.forEach((p,i)=>{
      const roundId=idByNumber.get(i+1),match=matchRows.find((m:any)=>m.round_id===roundId);
      if(!match)return;
      p.a.forEach((id,pos)=>links.push({match_id:match.id,participant_id:id,side:"A",position_in_side:pos+1}));
      p.b.forEach((id,pos)=>links.push({match_id:match.id,participant_id:id,side:"B",position_in_side:pos+1}));
      p.rests.forEach(id=>resting.push({round_id:roundId,participant_id:id}));
    });
    const [linkRes,restRes]=await Promise.all([db.from("tournament_match_participants").insert(links),db.from("tournament_round_resting").insert(resting)]);
    if(linkRes.error||restRes.error){await db.from("tournament_rounds").delete().in("id",roundRows.map((r:any)=>r.id));setBusy(false);setNotice(linkRes.error?.message||restRes.error?.message||"Error guardant els descansos.");return;}
    await db.from("tournaments").update({status:"in_progress"}).eq("id",TOURNAMENT_ID);
    setBusy(false);setNotice("Calendari generat: "+generated.length+" rondes, sense repetir cap parella.");await load();
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

  async function resetRounds(){
    if(!isAdmin||!started||tournamentStatus==="completed"||busy)return;
    const ok=confirm("Vols reiniciar les rondes? S'esborraran tots els emparellaments, descansos i resultats del calendari actual. Es mantindran els participants inscrits i podràs generar un calendari nou.");
    if(!ok)return;
    setBusy(true);setNotice("");
    const roundIds=rounds.map(r=>r.id);
    const matchIds=matches.map(m=>m.id);
    if(matchIds.length){
      const {error}=await db.from("tournament_match_participants").delete().in("match_id",matchIds);
      if(error){setBusy(false);setNotice("No s'han pogut eliminar els participants de les partides: "+error.message);return;}
    }
    if(roundIds.length){
      const {error}=await db.from("tournament_round_resting").delete().in("round_id",roundIds);
      if(error){setBusy(false);setNotice("No s'han pogut eliminar els descansos: "+error.message);return;}
    }
    if(matchIds.length){
      const {error}=await db.from("tournament_matches").delete().in("id",matchIds);
      if(error){setBusy(false);setNotice("No s'han pogut eliminar les partides: "+error.message);return;}
    }
    if(roundIds.length){
      const {error}=await db.from("tournament_rounds").delete().in("id",roundIds);
      if(error){setBusy(false);setNotice("No s'han pogut eliminar les rondes: "+error.message);return;}
    }
    const {error}=await db.from("tournaments").update({status:"draft"}).eq("id",TOURNAMENT_ID);
    setBusy(false);
    if(error){setNotice("Calendari eliminat, però no s'ha pogut actualitzar l'estat: "+error.message);return;}
    setActiveRound(1);
    setNotice("Rondes reiniciades. Els participants continuen inscrits; ja pots generar un calendari nou.");
    await load();
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
        {isAdmin&&!started&&<div className="participant-picker"><div className="picker-actions"><b>Selecciona qui jugarà</b><div><button type="button" className="mini" onClick={()=>setSelectedGlobals(globalPlayers.filter(p=>!players.some(x=>x.id===p.id)).map(p=>p.id))}>Tots</button><button type="button" className="mini" onClick={()=>setSelectedGlobals([])}>Netejar</button></div></div><div className="picker-list">{globalPlayers.filter(p=>!players.some(x=>x.id===p.id)).map(p=><label className="picker-option" key={p.id}><input type="checkbox" checked={selectedGlobals.includes(p.id)} onChange={e=>setSelectedGlobals(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/><span>{p.name}</span></label>)}</div><button className="primary picker-submit" onClick={addPlayers} disabled={!selectedGlobals.length||busy}>Afegir seleccionats ({selectedGlobals.length}) +</button></div>}
        {isAdmin&&globalPlayers.length===0&&<p className="notice">Afegeix primer participants des de la secció Gestió.</p>}
        <div className="list">{players.length===0?<div className="empty"><strong>Encara no hi ha participants</strong>L'organitzador ha d'inscriure un mínim de quatre persones.</div>:players.map((p,i)=><div className="person" key={p.id}><div className="person-main"><div className="row"><span className="muted">{String(i+1).padStart(2,"0")}</span>{editingPlayer===p.id?<input className="field edit-name" aria-label="Nom del participant" value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void savePlayerName(p.id);}}/>:<b>{p.name}</b>}</div><small>{p.played} partits · {p.wins}V · {p.losses}D · {p.rests} descansos</small></div>{isAdmin&&<div className="person-actions">{editingPlayer===p.id?<><button className="mini" onClick={()=>void savePlayerName(p.id)} disabled={busy||!editingName.trim()}>Desar</button><button className="mini" onClick={()=>setEditingPlayer(null)}>Cancel·lar</button></>:<button className="mini" onClick={()=>{setEditingPlayer(p.id);setEditingName(p.name);}}>Editar</button>}{!started&&<button className="mini remove" onClick={()=>void removePlayer(p.id)}>Eliminar</button>}</div>}</div>)}</div>
        {isAdmin&&!started&&players.length>=4&&<p className="notice">El calendari evita repetir company de parella i enfrontaments entre les mateixes dues parelles. Els descansos es reparteixen al llarg del calendari.</p>}
      </section>
      <section className="panel"><div className="roundhead"><h3>Rondes del torneig</h3><span className="tag">{rounds.filter(r=>r.status==="completed").length}/{rounds.length} COMPLETES</span></div>
        {!started?<div className="empty"><strong>Encara no hi ha rondes</strong>Inscriu almenys quatre participants, tria quantes rondes voleu jugar i genera el calendari complet.</div>:<><div className="tabs">{rounds.map(r=><button key={r.id} className={activeRound===r.number?"tab active":"tab"} onClick={()=>setActiveRound(r.number)}>R{r.number}</button>)}</div>{current?<MatchCard key={current.id} match={current} playerName={playerName} isAdmin={isAdmin} onSave={saveResult}/>:<div className="empty">No s'ha trobat la partida d'aquesta ronda.</div>}<div className="notice">Descansen: {players.filter(p=>!current?.a.includes(p.id)&&!current?.b.includes(p.id)).map(p=>p.name).join(", ")||"Ningú"}</div></>}
        {isAdmin&&!started&&<div style={{display:"flex",gap:8,marginTop:15,alignItems:"center",flexWrap:"wrap"}}><label className="round-count">Rondes (màxim recomanat: {suggestedRounds}) <input className="field" type="number" min="1" max="60" value={roundsToGenerate} onChange={e=>setRoundsToGenerate(Math.max(1,Math.min(60,Number(e.target.value)||1)))}/></label><button className="primary" disabled={players.length<4||busy} onClick={()=>generateRounds(roundsToGenerate)}>{busy?"Generant…":"Generar totes les rondes →"}</button></div>}
        {isAdmin&&started&&<div style={{display:"flex",gap:8,marginTop:15,flexWrap:"wrap"}}><button className="primary" disabled={busy||activeRound>=rounds.length} onClick={nextRound}>Següent ronda →</button><button className="secondary" disabled={busy||played===0||tournamentStatus==="completed"} onClick={undoLast}>Desfer últim resultat</button><button className="danger" disabled={busy||tournamentStatus==="completed"} onClick={resetRounds}>Reiniciar rondes ↻</button></div>}
        {isAdmin&&allDone&&tournamentStatus!=="completed"&&<button className="primary" style={{width:"100%",marginTop:12}} disabled={busy} onClick={finalizeTournament}>Tancar torneig i publicar podi</button>}
        {isAdmin&&tournamentStatus==="completed"&&<p className="notice">Podi publicat i punts incorporats a la classificació general.</p>}
      </section>
    </div>}
    <section className="panel" style={{marginTop:16}}><div className="roundhead"><h3>Classificació del billar</h3><span className="tag">INDIVIDUAL</span></div><div className="list">{standings.length===0?<div className="empty">La classificació apareixerà quan hi hagi participants.</div>:standings.map((p,i)=><div className="standing" key={p.id}><div className="rank">{i+1}</div><div className="name">{p.name}</div><div className="metric"><b>{p.wins}</b><small>VICTÒRIES</small></div><div className="metric"><b>{p.ballsFor-p.ballsAgainst>0?"+":""}{p.ballsFor-p.ballsAgainst}</b><small>DIF. BOLES</small></div><div className="metric"><b>{p.ballsFor}</b><small>A FAVOR</small></div></div>)}</div><p className="notice">Desempat: victòries → diferència de boles → boles a favor. En cas d'igualtat total, els participants comparteixen la posició i els punts del podi.</p></section>
    <section className="panel" style={{marginTop:16}}><div className="roundhead"><h3>Historial de partides</h3><span className="tag">{matches.length} PARTIDES</span></div>{matches.length===0?<div className="empty">Les partides apareixeran aquí quan es generin les rondes.</div>:<div className="list">{[...matches].sort((a,b)=>b.round-a.round).map(m=><div className="match" key={m.id}><div><div className="tag">RONDA {m.round}</div><small className="muted">{m.done?"Finalitzada":"Pendent"}</small></div><div className="teams"><div className="team">{playerName(m.a[0])} + {playerName(m.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(m.b[0])} + {playerName(m.b[1])}</div></div><b>{m.done?m.scoreA+" – "+m.scoreB:"—"}</b>{m.blackEarly&&<span className="tag">NEGRA</span>}</div>)}</div>}</section>
    {!isAdmin&&<section className="panel" style={{marginTop:16}}><h3>Accés d'organitzador</h3><form className="list" onSubmit={signIn}><input className="field" type="email" required placeholder="Correu electrònic" value={email} onChange={e=>setEmail(e.target.value)}/><input className="field" type="password" required placeholder="Contrasenya" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary" disabled={busy}>{busy?"Entrant…":"Iniciar sessió"}</button></form></section>}
    {isAdmin&&<button className="secondary" style={{marginTop:14}} onClick={signOut}>Tancar sessió</button>}
    <p className="notice">Les rondes i els resultats es guarden a Supabase i s'actualitzen en directe a tots els dispositius.</p>
    <nav className="bottom-dock" aria-label="Navegació principal">
      <a className="dock-item" href="/#inici"><span className="dock-icon">⌂</span><small>Inici</small></a>
      <a className="dock-item" href="/#classificacio"><span className="dock-icon">♜</span><small>Classificació</small></a>
      <a className="dock-item active" href="/#jocs"><span className="dock-icon">◈</span><small>Jocs</small></a>
      <a className="dock-item" href="/#participants"><span className="dock-icon">♙</span><small>Participants</small></a>
      <a className="dock-item" href="/#gestio"><span className="dock-icon">⚙</span><small>Gestió</small></a>
    </nav>
  </main>;
}

function MatchCard({match,playerName,isAdmin,onSave}:{match:Match;playerName:(id:string)=>string;isAdmin:boolean;onSave:(id:string,a:number,b:number,black:boolean,blackTeam:"A"|"B")=>void}){
  const [a,setA]=useState(String(match.scoreA));const [b,setB]=useState(String(match.scoreB));const [black,setBlack]=useState(match.blackEarly);const [blackTeam,setBlackTeam]=useState<"A"|"B">(match.blackTeam||"A");
  useEffect(()=>{setA(String(match.scoreA));setB(String(match.scoreB));setBlack(match.blackEarly);setBlackTeam(match.blackTeam||"A");},[match.id,match.scoreA,match.scoreB,match.blackEarly,match.blackTeam]);
  return <div><div className="teams" style={{padding:"20px 0"}}><div className="team">{playerName(match.a[0])}<br/><span className="muted">+</span><br/>{playerName(match.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(match.b[0])}<br/><span className="muted">+</span><br/>{playerName(match.b[1])}</div></div>{match.done?<div className="empty"><strong>{match.winner==="A"?"Guanya parella A":"Guanya parella B"}</strong>{match.scoreA} – {match.scoreB}{match.blackEarly?" · Negra encaixada prematurament":""}</div>:isAdmin?<><div className="score" style={{justifyContent:"center",margin:"12px 0"}}><label className="muted">Parella A</label><input className="field" type="number" min="0" max="7" value={a} onChange={e=>setA(e.target.value)}/><span className="muted">–</span><input className="field" type="number" min="0" max="7" value={b} onChange={e=>setB(e.target.value)}/><label className="muted">Parella B</label></div><label className="row muted" style={{fontSize:12,marginBottom:12}}><input type="checkbox" checked={black} onChange={e=>setBlack(e.target.checked)}/> Negra encaixada abans d'hora (derrota automàtica)</label>{black&&<div className="row" style={{marginBottom:12}}><span className="muted">Quina parella ha encaixat la negra?</span><select className="field" value={blackTeam} onChange={e=>setBlackTeam(e.target.value as "A"|"B")}><option value="A">Parella A</option><option value="B">Parella B</option></select></div>}<button className="primary" style={{width:"100%"}} onClick={()=>onSave(match.id,Number(a),Number(b),black,blackTeam)}>Guardar resultat</button><p className="notice">Introdueix les boles legals encaixades abans del tir de la negra. La negra no suma ni resta boles.</p></>:<div className="empty">Partida pendent de resultat.</div>}</div>;
}
