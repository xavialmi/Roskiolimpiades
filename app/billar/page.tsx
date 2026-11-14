"use client";

import { useEffect, useMemo, useState } from "react";\nimport { createClient } from "@supabase/supabase-js";

type Player = { id:string; name:string; rests:number; wins:number; losses:number; ballsFor:number; ballsAgainst:number };
type Match = { id:string; round:number; a:[string,string]; b:[string,string]; scoreA:number; scoreB:number; winner:"A"|"B"|null; blackEarly:boolean; done:boolean };
type Tournament = { players:Player[]; matches:Match[]; round:number; started:boolean; joinCode:string };
const KEY="roskiolimpiades-bola8-v1";\nconst db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const uid=()=>Math.random().toString(36).slice(2,10);
const fresh=():Tournament=>({players:[],matches:[],round:0,started:false,joinCode:Math.random().toString(36).slice(2,8).toUpperCase()});
const shuffle=<T,>(a:T[])=>[...a].sort(()=>Math.random()-.5);

function createPairing(players:Player[],matches:Match[],round:number){
 if(players.length<4)return null;
 const min=Math.min(...players.map(p=>p.rests));
 const pool=players.filter(p=>p.rests<=min+1);
 let best:any=null;
 const pairKey=(a:string,b:string)=>[a,b].sort().join(":");
 for(let k=0;k<700;k++){
  const chosen=shuffle(pool).slice(0,4);if(chosen.length<4)continue;
  const [p1,p2,p3,p4]=shuffle(chosen);
  const variants=[[ [p1,p2],[p3,p4] ],[ [p1,p3],[p2,p4] ],[ [p1,p4],[p2,p3] ]];
  for(const t of variants){
   let cost=0;
   for(const m of matches){
    const old=[m.a,m.b];
    for(const team of t){if(old.some(o=>pairKey(o[0],o[1])===pairKey(team[0].id,team[1].id)))cost+=12;}
    for(const x of t[0])for(const y of t[1])if(old.some(o=>o.includes(x.id)&&o.includes(y.id)&&!(o.includes(x.id)&&o.includes(y.id))))cost+=3;
   }
   if(!best||cost<best.cost)best={chosen,teams:t,cost};
  }
 }
 if(!best)return null;
 const ids=new Set(best.chosen.map((p:Player)=>p.id));
 return {match:{id:uid(),round,a:[best.teams[0][0].id,best.teams[0][1].id] as [string,string],b:[best.teams[1][0].id,best.teams[1][1].id] as [string,string],scoreA:0,scoreB:0,winner:null,blackEarly:false,done:false} as Match,rests:players.filter(p=>!ids.has(p.id)).map(p=>p.id)};
}

export default function Home(){
 const [data,setData]=useState<Tournament>(fresh);const [selectedGlobal,setSelectedGlobal]=useState("");const [globalPlayers,setGlobalPlayers]=useState<{id:string;name:string}[]>([]);const [tab,setTab]=useState<"torneig"|"classificacio"|"historial">("torneig");const [loaded,setLoaded]=useState(false);const [roundsToGenerate,setRoundsToGenerate]=useState(8);
 useEffect(()=>{try{const v=localStorage.getItem(KEY);if(v)setData(JSON.parse(v));}catch{}setLoaded(true);db.from("participants").select("id,display_name").eq("is_active",true).order("display_name").then(({data})=>setGlobalPlayers((data||[]).map((p:any)=>({id:p.id,name:p.display_name}))));const channel=db.channel("billar-global-players").on("postgres_changes",{event:"*",schema:"public",table:"participants"},()=>{db.from("participants").select("id,display_name").eq("is_active",true).order("display_name").then(({data})=>setGlobalPlayers((data||[]).map((p:any)=>({id:p.id,name:p.display_name}))));}).subscribe();return()=>{void db.removeChannel(channel);};},[]);
 useEffect(()=>{if(loaded)localStorage.setItem(KEY,JSON.stringify(data));},[data,loaded]);
 const players=data.players;const playerName=(id:string)=>players.find(p=>p.id===id)?.name??"Jugador";
 const current=data.matches.find(m=>m.round===data.round);
 const standings=useMemo(()=>[...players].sort((a,b)=>b.wins-a.wins||((b.ballsFor-b.ballsAgainst)-(a.ballsFor-a.ballsAgainst))||b.ballsFor-a.ballsFor||a.name.localeCompare(b.name)),[players]);
 const addPlayer=()=>{const selected=globalPlayers.find(p=>p.id===selectedGlobal);if(!selected||players.some(p=>p.id===selected.id))return;setData(d=>({...d,players:[...d.players,{id:selected.id,name:selected.name,rests:0,wins:0,losses:0,ballsFor:0,ballsAgainst:0}]}));setSelectedGlobal("");};
 const removePlayer=(id:string)=>setData(d=>({...d,players:d.players.filter(p=>p.id!==id)}));
 const nextRound=()=>{if(players.length<4||(current&&!current.done))return;const existing=data.matches.find(m=>m.round===data.round+1);if(existing){setData(d=>({...d,round:d.round+1}));return;}const p=createPairing(players,data.matches,data.round+1);if(!p)return;setData(d=>({...d,round:d.round+1,matches:[...d.matches,p.match],players:d.players.map(x=>p.rests.includes(x.id)?{...x,rests:x.rests+1}:x),started:true}));};\n const generateAllRounds=()=>{if(players.length<4||data.started)return;let simulated=[...players];let generated=[...data.matches];let made=0;for(let r=1;r<=roundsToGenerate;r++){const p=createPairing(simulated,generated,r);if(!p)break;generated.push(p.match);simulated=simulated.map(x=>p.rests.includes(x.id)?{...x,rests:x.rests+1}:x);made++;}if(made>0)setData(d=>({...d,round:1,matches:generated,players:simulated,started:true}));};
 const saveResult=(id:string,scoreA:number,scoreB:number,blackEarly:boolean,blackTeam:"A"|"B")=>{
  if(scoreA<0||scoreB<0||scoreA>7||scoreB>7||(!blackEarly&&scoreA===scoreB))return;
  setData(d=>{const old=d.matches.find(m=>m.id===id);if(!old)return d;const winner: "A"|"B"=blackEarly?(blackTeam==="A"?"B":"A"):(scoreA>scoreB?"A":"B");
   const updated=d.matches.map(m=>m.id===id?{...m,scoreA,scoreB,winner,blackEarly,done:true}:m);
   const wins=winner==="A"?old.a:old.b;const losses=winner==="A"?old.b:old.a;
   const ps=d.players.map(p=>{if(wins.includes(p.id))return {...p,wins:p.wins+1,ballsFor:p.ballsFor+(winner==="A"?scoreA:scoreB),ballsAgainst:p.ballsAgainst+(winner==="A"?scoreB:scoreA)};if(losses.includes(p.id))return {...p,losses:p.losses+1,ballsFor:p.ballsFor+(winner==="A"?scoreB:scoreA),ballsAgainst:p.ballsAgainst+(winner==="A"?scoreA:scoreB)};return p;});
   return {...d,matches:updated,players:ps};
  });
 };
 const undoLast=()=>{const last=[...data.matches].reverse().find(m=>m.done);if(!last||!confirm("Anul·lar l'últim resultat?"))return;setData(d=>({...d,players:d.players.map(p=>{const won=(last.winner==="A"?last.a:last.b).includes(p.id),lost=(last.winner==="A"?last.b:last.a).includes(p.id);if(!won&&!lost)return p;const f=won?(last.winner==="A"?last.scoreA:last.scoreB):(last.winner==="A"?last.scoreB:last.scoreA);const ag=won?(last.winner==="A"?last.scoreB:last.scoreA):(last.winner==="A"?last.scoreA:last.scoreB);return {...p,wins:p.wins-(won?1:0),losses:p.losses-(lost?1:0),ballsFor:p.ballsFor-f,ballsAgainst:p.ballsAgainst-ag};}),matches:d.matches.map(m=>m.id===last.id?{...m,done:false,winner:null,scoreA:0,scoreB:0,blackEarly:false}:m)}));};
 const reset=()=>{if(confirm("Esborrar el torneig actual i començar de zero?"))setData(fresh());};
 const played=players.reduce((s,p)=>s+p.wins+p.losses,0)/2;
 return <main className="app">
  <a href="/" className="back-home">← Tots els jocs</a><header className="topbar"><div className="brand"><div className="logo">R</div><div><div className="eyebrow">ROSKIOLIMPIADES</div><h1>Club de billar · Bola 8</h1></div></div><div className="pill">● TORNEIG {data.started?"EN MARXA":"PREPARAT"}</div></header>
  <section className="hero"><div><div className="eyebrow">AMERICANA · PARELLES ROTATIVES</div><h2>Que comenci el joc.</h2><p>Una taula, parelles noves i una classificació individual.</p></div><button className="secondary" onClick={reset}>Reiniciar torneig ↻</button></section>
  <section className="stats"><div className="stat"><span>Participants</span><strong>{players.length}</strong></div><div className="stat"><span>Ronda actual</span><strong>{data.round}</strong></div><div className="stat"><span>Partides jugades</span><strong>{played}</strong></div><div className="stat"><span>Codi del torneig</span><strong style={{fontSize:23,letterSpacing:2}}>{data.joinCode}</strong></div></section>
  <nav className="tabs">{([["torneig","Torneig"],["classificacio","Classificació"],["historial","Historial"]] as const).map(([key,label])=><button key={key} className={tab===key?"tab active":"tab"} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  {tab==="torneig"&&<div className="grid">
   <section className="panel"><div className="roundhead"><h3>Participants <span className="muted">({players.length})</span></h3><span className="tag">ORGANITZADOR</span></div>
    {!data.started&&<div className="addrow"><select className="field" value={selectedGlobal} onChange={e=>setSelectedGlobal(e.target.value)}><option value="">Selecciona un participant global…</option>{globalPlayers.filter(p=>!players.some(x=>x.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="primary" onClick={addPlayer} disabled={!selectedGlobal}>Afegir +</button></div>{globalPlayers.length===0&&<p className="notice">Primer crea els participants a la secció Participants de la portada.</p>}}
    <div className="list">{players.length===0?<div className="empty"><strong>Encara no hi ha participants</strong>Afegeix un mínim de 4 jugadors per començar.</div>:players.map((p,i)=><div className="person" key={p.id}><div className="row"><span className="muted">{String(i+1).padStart(2,"0")}</span><b>{p.name}</b></div><div className="row"><small>{p.wins}V · {p.losses}D · {p.rests} descansos</small>{!data.started&&<button className="mini" onClick={()=>removePlayer(p.id)}>×</button>}</div></div>)}</div>
    {players.length>=4&&!data.started&&<p className="notice">S'escullen els quatre jugadors amb menys descansos i s'intenten evitar companys i rivals repetits.</p>}
   </section>
   <section className="panel"><div className="roundhead"><h3>{data.round?"Ronda "+data.round:"Primera ronda"}</h3><span className="tag">{current?.done?"FINALITZADA":current?"EN JOC":"A PUNT"}</span></div>
    {!current?<div className="empty"><strong>La taula espera jugadors</strong>Genera una ronda per sortejar dues parelles.</div>:<MatchCard match={current} playerName={playerName} onSave={saveResult}/>}
    <div style={{display:"flex",gap:8,marginTop:15,flexWrap:"wrap"}}>{!data.started&&<><label className="round-count">Rondes <input className="field" type="number" min="1" max="60" value={roundsToGenerate} onChange={e=>setRoundsToGenerate(Math.max(1,Math.min(60,Number(e.target.value)||1)))}/></label><button className="primary" disabled={players.length<4} onClick={generateAllRounds}>Generar totes les rondes →</button></>}<button className="primary" disabled={players.length<4||(!!current&&!current.done)} onClick={nextRound}>{current?"Següent ronda":"Generar primera ronda"} →</button><button className="secondary" onClick={undoLast}>Desfer últim resultat</button></div>
    {current&&<div className="notice">Descansen: {players.filter(p=>!current.a.includes(p.id)&&!current.b.includes(p.id)).map(p=>p.name).join(", ")||"Ningú"}. Els descansos es reparteixen equilibradament.</div>}
   </section>
  </div>}
  {tab==="classificacio"&&<section className="panel"><div className="roundhead"><h3>Classificació individual</h3><span className="tag">EN DIRECTE</span></div><div className="list">{standings.length===0?<div className="empty">La classificació apareixerà quan afegeixis participants.</div>:standings.map((p,i)=><div className="standing" key={p.id}><div className="rank">{i+1}</div><div className="name">{p.name}</div><div className="metric"><b>{p.wins}</b><small>GUANYADES</small></div><div className="metric"><b>{p.ballsFor-p.ballsAgainst>0?"+":""}{p.ballsFor-p.ballsAgainst}</b><small>DIF. BOLES</small></div><div className="metric"><b>{p.ballsFor}</b><small>A FAVOR</small></div><div className="metric"><b>{p.rests}</b><small>DESCANSOS</small></div></div>)}</div><p className="notice">Desempat: partides guanyades → diferència de boles → boles a favor. L'enfrontament directe s'aplicarà quan sigui inequívoc.</p></section>}
  {tab==="historial"&&<section className="panel"><h3>Resultats per ronda</h3>{data.matches.length===0?<div className="empty">Encara no s'ha jugat cap partida.</div>:<div className="list">{[...data.matches].reverse().map(m=><div className="match" key={m.id}><div style={{minWidth:68}}><div className="tag">RONDA {m.round}</div><small className="muted">{m.done?"Finalitzada":"Pendent"}</small></div><div className="teams"><div className="team">{playerName(m.a[0])} + {playerName(m.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(m.b[0])} + {playerName(m.b[1])}</div></div><b>{m.done?m.scoreA+" – "+m.scoreB:"—"}</b>{m.blackEarly&&<span className="tag">NEGRA</span>}</div>)}</div>}</section>}
  <p className="notice">Versió inicial · Les dades es guarden en aquest dispositiu. La sincronització entre dispositius i l'accés dels participants s'activaran quan acabem de connectar la base de dades.</p>
 </main>;
}

function MatchCard({match,playerName,onSave}:{match:Match;playerName:(id:string)=>string;onSave:(id:string,a:number,b:number,black:boolean,blackTeam:"A"|"B")=>void}){
 const [a,setA]=useState("0");const [b,setB]=useState("0");const [black,setBlack]=useState(false);const [blackTeam,setBlackTeam]=useState<"A"|"B">("A");
 return <div><div className="teams" style={{padding:"20px 0"}}><div className="team">{playerName(match.a[0])}<br/><span className="muted">+</span><br/>{playerName(match.a[1])}</div><div className="versus">VS</div><div className="team">{playerName(match.b[0])}<br/><span className="muted">+</span><br/>{playerName(match.b[1])}</div></div>{match.done?<div className="empty"><strong>{match.winner==="A"?"Guanya parella A":"Guanya parella B"}</strong>{match.scoreA} – {match.scoreB}{match.blackEarly?" · Negra encaixada prematurament":""}</div>:<><div className="score" style={{justifyContent:"center",margin:"12px 0"}}><label className="muted">Parella A</label><input className="field" type="number" min="0" max="7" value={a} onChange={e=>setA(e.target.value)}/><span className="muted">–</span><input className="field" type="number" min="0" max="7" value={b} onChange={e=>setB(e.target.value)}/><label className="muted">Parella B</label></div><label className="row muted" style={{fontSize:12,marginBottom:12}}><input type="checkbox" checked={black} onChange={e=>setBlack(e.target.checked)}/> Negra encaixada abans d'hora (derrota automàtica)</label>{black&&<div className="row" style={{marginBottom:12}}><span className="muted">Quina parella ha encaixat la negra?</span><select className="field" value={blackTeam} onChange={e=>setBlackTeam(e.target.value as "A"|"B")}><option value="A">Parella A</option><option value="B">Parella B</option></select></div>}<button className="primary" style={{width:"100%"}} onClick={()=>onSave(match.id,Number(a),Number(b),black,blackTeam)}>Guardar resultat</button><p className="notice">Introdueix les boles legals encaixades abans del tir de la negra. La negra no suma ni resta boles.</p></>}</div>;
}
