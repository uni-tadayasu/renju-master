/* Renju Master — original bounded iterative-deepening alpha-beta engine.
   Evaluation shares are heuristic estimates, NOT calibrated probabilities. */
'use strict';
if(typeof importScripts==='function') importScripts('rules.js');
const Rules=typeof RenjuRules!=='undefined'?RenjuRules:require('./rules.js');
const N=15,COUNT=225,MATE=10000000,DIRS=[[1,0],[0,1],[1,1],[1,-1]];
const LINES=[],CELL_LINES=Array.from({length:COUNT},()=>[]);
for(const [dx,dy] of DIRS){
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const px=x-dx,py=y-dy;if(px>=0&&px<N&&py>=0&&py<N)continue;
    const line=[];for(let a=x,b=y;a>=0&&a<N&&b>=0&&b<N;a+=dx,b+=dy)line.push(b*N+a);
    if(line.length>=5){const id=LINES.length;LINES.push(line);line.forEach(p=>CELL_LINES[p].push(id));}
  }
}
const NEAR=Array.from({length:COUNT},(_,i)=>{const a=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=i%N+dx,y=Math.floor(i/N)+dy;if(x>=0&&x<N&&y>=0&&y<N&&(dx||dy))a.push(y*N+x);}return a;});
let seed=0x72564f31;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const Z=Array.from({length:COUNT},()=>[0,random(),random()]);
const Z2=Array.from({length:COUNT},()=>[0,random(),random()]);
const SHAPES=[[/\.XXXX\./g,85000],[/\.XXX\./g,2400],[/\.XX\.X\./g,1700],[/\.X\.XX\./g,1700],[/\.XX\./g,120],[/\.X\.X\./g,95],[/\.X\.\.X\./g,55]];
function lineValue(board,line,color,rule){
  let s='#';for(const p of line)s+=board[p]===color?'X':board[p]===0?'.':'#';s+='#';let value=0;
  const runs=s.match(/X+/g)||[];for(const run of runs)if(run.length>=5&&(rule!=='renju'||color===2||run.length===5))value+=1500000;
  for(const [re,score] of SHAPES){re.lastIndex=0;let match;while((match=re.exec(s))){value+=score;re.lastIndex=match.index+1;}}
  // Five-cell windows cover every straight and broken four, including same-line forks.
  const seen=new Set();for(let j=1;j<s.length-5;j++){
    const w=s.slice(j,j+5);if(w.includes('#'))continue;
    const xs=(w.match(/X/g)||[]).length;if(xs!==4)continue;
    const hole=w.indexOf('.');const positions=[];for(let k=0;k<5;k++)if(k!==hole)positions.push(j+k);
    const key=positions.join(',');if(!seen.has(key)){seen.add(key);value+=10000;}
  }
  return value;
}
function point(board,i,c,rule){
  board[i]=c;let win=false,over=false,fours=0,open4=0,threes=0,twos=0;
  for(const [dx,dy] of DIRS){
    let s='';for(let k=-5;k<=5;k++){const x=i%N+dx*k,y=Math.floor(i/N)+dy*k;s+=x<0||x>=N||y<0||y>=N?'#':board[y*N+x]===c?'X':board[y*N+x]===0?'.':'#';}
    let l=5,r=5;while(l>0&&s[l-1]==='X')l--;while(r<10&&s[r+1]==='X')r++;
    const len=r-l+1;if(len>=5){if(rule!=='renju'||c===2||len===5)win=true;else over=true;}
    const sets=new Map();
    for(let j=1;j<=5;j++){
      const w=s.slice(j,j+5);if(w.includes('#')||(w.match(/X/g)||[]).length!==4)continue;
      const hole=j+w.indexOf('.');if(rule==='renju'&&c===1){const t=s.slice(0,hole)+'X'+s.slice(hole+1);let a=hole,b=hole;while(a>0&&t[a-1]==='X')a--;while(b<10&&t[b+1]==='X')b++;if(b-a+1!==5)continue;}
      const key=[];for(let k=j;k<j+5;k++)if(s[k]==='X')key.push(k);const id=key.join(',');sets.set(id,(sets.get(id)||0)+1);
    }
    fours+=sets.size;for(const v of sets.values())if(v>=2)open4++;
    if(/\.XXX\.|\.XX\.X\.|\.X\.XX\./.test(s))threes++;
    if(/\.XX\.|\.X\.X\.|\.X\.\.X\./.test(s))twos++;
  }
  board[i]=0;
  let value=win?MATE:open4?350000:fours>=2?280000:fours&&threes?90000:threes>=2?38000:fours?16000:threes?3200:twos?twos*230:10;
  if(over&&!win)value=-MATE;
  return {value,win,fours,open4,threes,twos};
}
function analyze(request){
  const started=performance.now(),budget=Math.max(40,Math.min(10000,Number(request.budget)||950)),deadline=started+budget;
  const board=Array.from(request.board||[]),rule=request.rule==='freestyle'?'freestyle':'renju',rootTurn=request.turn===2?2:1;
  if(board.length!==225||board.some(v=>v!==0&&v!==1&&v!==2))throw new Error('盤面データが不正です');
  let nodes=0,hash=0,hash2=0,total=[0,0,0],completedDepth=0,tt=new Map();
  const lineScores=LINES.map(line=>[0,lineValue(board,line,1,rule),lineValue(board,line,2,rule)]);
  lineScores.forEach(v=>{total[1]+=v[1];total[2]+=v[2];});board.forEach((v,i)=>{if(v){hash^=Z[i][v];hash2^=Z2[i][v];}});
  const timeout={timeout:true};function check(){if(performance.now()>=deadline)throw timeout;}
  function change(i,c){
    const old=board[i];if(old){hash^=Z[i][old];hash2^=Z2[i][old];}if(c){hash^=Z[i][c];hash2^=Z2[i][c];}board[i]=c;
    for(const id of CELL_LINES[i])for(let color=1;color<=2;color++){total[color]-=lineScores[id][color];lineScores[id][color]=lineValue(board,LINES[id],color,rule);total[color]+=lineScores[id][color];}
  }
  function value(){
    let bw=1,ww=1;const style=request.style;
    if(style==='attack'){if(rootTurn===1)bw=1.1;else ww=1.1;}
    if(style==='defense'){if(rootTurn===1)ww=1.1;else bw=1.1;}
    return Math.max(-MATE/2,Math.min(MATE/2,total[1]*bw-total[2]*ww));
  }
  function generate(turn,limit,preferred){
    const mask=new Uint8Array(COUNT);let count=0;
    for(let i=0;i<COUNT;i++)if(board[i]){count++;for(const p of NEAR[i])if(!board[p])mask[p]=1;}
    if(!count)return [{index:112,rank:1,attack:{value:10},defend:{value:10}}];
    const moves=[],wins=[],danger=[];
    for(let i=0;i<COUNT;i++)if(mask[i]){
      check();const attack=point(board,i,turn,rule),defend=point(board,i,3-turn,rule);
      const center=14-Math.abs(i%15-7)-Math.abs(Math.floor(i/15)-7);
      const rank=attack.value+defend.value*(request.style==='defense'?1.12:.9)+center*(request.style==='center'?35:3)+(i===preferred?50:0);
      const move={index:i,rank,attack,defend};moves.push(move);
      if(attack.win&&Rules.legal(board,i,turn,rule).ok)wins.push(move);
      if(defend.win&&Rules.legal(board,i,3-turn,rule).ok)danger.push(move);
    }
    if(wins.length)return wins.sort((a,b)=>b.rank-a.rank);
    const source=danger.length?danger:moves.sort((a,b)=>b.rank-a.rank),legal=[];
    for(const move of source){check();if(Rules.legal(board,move.index,turn,rule).ok){legal.push(move);if(legal.length>=limit)break;}}
    if(!legal.length&&danger.length){for(const move of moves.sort((a,b)=>b.rank-a.rank)){check();if(Rules.legal(board,move.index,turn,rule).ok){legal.push(move);break;}}}
    return legal;
  }
  function search(turn,depth,alpha,beta,ply,last){
    nodes++;check();
    if(last>=0){const color=board[last],won=Rules.rows(board,last,color).some(r=>rule==='renju'&&color===1?r.length===5:r.length>=5);if(won)return -(MATE-ply);}
    if(depth<=0)return value()*(turn===1?1:-1);
    const key=(hash>>>0)+':'+(hash2>>>0)+':'+turn,record=tt.get(key),originalAlpha=alpha;
    if(record&&record.depth>=depth){if(record.flag===0)return record.score;if(record.flag===1)alpha=Math.max(alpha,record.score);else beta=Math.min(beta,record.score);if(alpha>=beta)return record.score;}
    const moves=generate(turn,ply<3?10:7,record&&record.move);
    if(!moves.length)return board.some(v=>!v)?-(MATE-ply):0;
    if(moves[0].attack.win)return MATE-ply-1;
    let best=-Infinity,bestMove=moves[0].index;
    for(const move of moves){
      change(move.index,turn);let score;
      try{score=-search(3-turn,depth-1,-beta,-alpha,ply+1,move.index);}finally{change(move.index,0);}
      if(score>best){best=score;bestMove=move.index;}alpha=Math.max(alpha,score);if(alpha>=beta)break;
    }
    if(tt.size>30000)tt.clear();tt.set(key,{depth,score:best,move:bestMove,flag:best<=originalAlpha?2:best>=beta?1:0});return best;
  }
  let roots=[],ranked=[],pv=[],bestMove=-1,blackScore=value();
  // A legal fallback is available before expensive search or a deadline abort.
  const fallback=[];
  for(let i=0;i<COUNT;i++)if(!board[i]){const neighbors=NEAR[i].reduce((n,p)=>n+(board[p]?1:0),0);fallback.push({index:i,priority:neighbors*20-Math.abs(i%15-7)-Math.abs(Math.floor(i/15)-7)});}
  fallback.sort((a,b)=>b.priority-a.priority);
  for(const m of fallback)if(Rules.legal(board,m.index,rootTurn,rule).ok){bestMove=m.index;break;}
  try{
    roots=generate(rootTurn,18,-1);
    if(roots.length){
      bestMove=roots[0].index;
      ranked=roots.map(m=>({index:m.index,score:0,meta:m}));
      if(roots[0].attack.win){blackScore=(rootTurn===1?1:-1)*(MATE-1);ranked=roots.map(m=>({index:m.index,score:blackScore,meta:m}));completedDepth=1;}
      else{
        for(let depth=1;depth<=12;depth++){
          const current=[];let alpha=-Infinity;
          for(const move of roots){
            check();change(move.index,rootTurn);let score;
            try{score=-search(3-rootTurn,depth-1,-Infinity,-alpha,1,move.index);}finally{change(move.index,0);}
            current.push({index:move.index,score:score*(rootTurn===1?1:-1),meta:move});alpha=Math.max(alpha,score);
          }
          current.sort((a,b)=>(b.score-a.score)*(rootTurn===1?1:-1));ranked=current;bestMove=ranked[0].index;blackScore=ranked[0].score;completedDepth=depth;
          roots.sort((a,b)=>current.findIndex(m=>m.index===a.index)-current.findIndex(m=>m.index===b.index));
          if(Math.abs(blackScore)>MATE-100)break;
        }
      }
    }
  }catch(error){if(error!==timeout)throw error;}
  if(!completedDepth&&bestMove>=0){change(bestMove,rootTurn);blackScore=value();change(bestMove,0);if(ranked.length)ranked[0].score=blackScore;}
  function explanation(m){
    if(!m)return '周囲の石のつながりと相手の脅威を比較した候補です。';
    if(m.attack.win)return '五連を完成させる決着手です。';
    if(m.defend.win)return '相手の五連を防ぐ受けが最優先です。';
    if(m.attack.open4)return '両端に勝ち筋のある四を作ります。';
    if(m.attack.fours&&m.attack.threes)return '四と三を組み合わせ、攻めをつなげます。';
    if(m.attack.fours)return '四を作り、相手に受けを迫ります。';
    if(m.attack.threes)return '三を育て、複数方向への展開を狙います。';
    if(m.defend.threes)return '相手の三の発展を抑え、反撃の余地を作ります。';
    return '中央の連携と、次の攻め・受けの広さを確保します。';
  }
  if(bestMove>=0){
    pv=[bestMove];const added=[];let turn=rootTurn,idx=bestMove;
    for(let d=0;d<Math.min(completedDepth,8);d++){
      if(idx<0||board[idx]||!Rules.legal(board,idx,turn,rule).ok)break;
      board[idx]=turn;hash^=Z[idx][turn];hash2^=Z2[idx][turn];added.push(idx);turn=3-turn;
      if(d+1>=completedDepth)break;
      const next=tt.get((hash>>>0)+':'+(hash2>>>0)+':'+turn);if(!next)break;idx=next.move;if(!board[idx]&&Rules.legal(board,idx,turn,rule).ok)pv.push(idx);else break;
    }
    for(let j=added.length-1;j>=0;j--){const i=added[j];hash^=Z[i][board[i]];hash2^=Z2[i][board[i]];board[i]=0;}
  }
  const bestMeta=roots.find(m=>m.index===bestMove);
  const candidates=ranked.slice(0,3).map(m=>({index:m.index,score:m.score,reason:explanation(m.meta)}));
  if(bestMove>=0&&!candidates.length)candidates.push({index:bestMove,score:blackScore,reason:explanation(bestMeta)});
  const blackShare=Math.round(50+49*Math.tanh(blackScore/45000));
  return {id:request.id,type:'result',move:bestMove,score:Math.round(blackScore),blackShare,depth:completedDepth,nodes,elapsed:Math.round(performance.now()-started),candidates,pv,reason:explanation(bestMeta)};
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=function(event){try{self.postMessage(analyze(event.data));}catch(error){self.postMessage({id:event.data&&event.data.id,type:'error',message:error.message||'解析に失敗しました'});}};
if(typeof module!=='undefined'&&module.exports)module.exports={analyze};
