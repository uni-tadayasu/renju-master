/* 連珠名人 — dependency-free, browser-local study room. */
'use strict';
(() => {
const $=id=>document.getElementById(id), $$=q=>[...document.querySelectorAll(q)], R=RenjuRules;
const KEY='renju-master.v1', LIBKEY='renju-master.strategies.v1';
const defaults={autoAnalyze:true,confirmMoves:matchMedia('(pointer:coarse)').matches,showHints:true,showNumbers:false,soundEnabled:true,narration:false,speechRate:1,budget:950};
let state={history:[],cursor:0,side:1,mode:'coach',rule:'renju',openingId:'free',evaluations:{},settings:{...defaults}}, customs=[];
let board=Array(225).fill(0), terminal={winner:0,draw:false,line:[]}, result=null, resultKey='', worker=null, seq=0, busy=false, timer=null, toastTimer=null, pending=-1, hover=-1, keyboard=112, confirmAction=null, importKind='game', canvasSize=0, dpr=1, audioCtx=null, persistenceWarning=false;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800)}
function safeText(text,max=300){return typeof text==='string'?text.slice(0,max):''}
function validHistory(moves,rule){
 if(!Array.isArray(moves)||moves.length>225)throw Error('棋譜は最大225手です。');
 const b=Array(225).fill(0);let ended=false;
 for(let n=0;n<moves.length;n++){const i=moves[n];if(ended)throw Error('終局後の着手が含まれています。');const check=R.legal(b,i,n%2+1,rule);if(!check.ok)throw Error(`${n+1}手目：${check.reason}`);b[i]=n%2+1;const out=R.outcome(b,i,rule);ended=!!(out.winner||out.draw)}return moves.slice();
}
function normalizeRecord(data){
 if(!data||typeof data!=='object')throw Error('データ形式が正しくありません。');
 const rule=data.rule==='freestyle'?'freestyle':'renju',history=validHistory(data.history,rule);
 return {history,cursor:Number.isInteger(data.cursor)?Math.min(history.length,Math.max(0,data.cursor)):history.length,rule,openingId:safeText(data.openingId,80)||'free',side:data.side===2?2:1};
}
function storageWrite(){try{localStorage.setItem(KEY,JSON.stringify({...state,evaluations:Object.fromEntries(Object.entries(state.evaluations).slice(-226))}));}catch(e){if(!persistenceWarning){persistenceWarning=true;toast('保存領域を利用できません。棋譜JSONを書き出して保存してください。')}}}
function libraryWrite(){try{localStorage.setItem(LIBKEY,JSON.stringify(customs));return true}catch(e){toast('戦法の保存に失敗しました。書き出しでバックアップしてください。');return false}}
function loadStorage(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved){const rec=normalizeRecord(saved);state={...state,...rec,mode:['coach','computer','studio'].includes(saved.mode)?saved.mode:'coach',evaluations:saved.evaluations&&typeof saved.evaluations==='object'?saved.evaluations:{},settings:{...defaults,...saved.settings}};state.settings.narration=false;state.settings.budget=[950,2800,4800].includes(+state.settings.budget)?+state.settings.budget:950;}}catch(e){console.warn('Saved game was not restored:',e.message)}
 try{const list=JSON.parse(localStorage.getItem(LIBKEY)||'[]');if(Array.isArray(list))customs=list.slice(0,300).flatMap(s=>{try{return [{...normalizeRecord(s),id:safeText(s.id,90),name:safeText(s.name,40)||'マイ戦法',note:safeText(s.note,500),created:safeText(s.created,40),evaluation:Number.isFinite(s.evaluation)?s.evaluation:null}]}catch{return []}})}catch(e){console.warn('Strategy library was not restored:',e.message)}
}
const turn=()=>state.cursor%2+1, colorName=c=>c===1?'黒':'白';
const positionKey=()=>`${state.rule}|${state.history.slice(0,state.cursor).join(',')}`;
function opening(){return RENJU_OPENINGS.find(o=>o.id===state.openingId)||RENJU_LESSONS.find(o=>o.id===state.openingId)||customs.find(o=>o.id===state.openingId)||{id:'free',name:'自由に打つ',kind:'自由研究',description:'一手ずつ、可能性をひらく。AIと盤面を読み解きましょう。',plan:'まずは中央から。石のつながりと、相手の狙いを意識します。',style:'balanced'}}
function rebuild(){board.fill(0);state.history.slice(0,state.cursor).forEach((i,n)=>board[i]=n%2+1);terminal=R.outcome(board,state.history[state.cursor-1],state.rule);pending=-1;result=null;resultKey='';}
function stopAnalysis(){clearTimeout(timer);seq++;if(worker){worker.terminate();worker=null;}busy=false;$('analysisBadge').classList.remove('busy');}
function changed({autoOpponent=false,message=''}={}){stopAnalysis();rebuild();storageWrite();render();if(message)toast(message);if(terminal.winner||terminal.draw){speak(terminal.winner?`${colorName(terminal.winner)}の勝ちです。`:'引き分けです。');return}if(state.settings.autoAnalyze||(autoOpponent&&state.mode==='computer'&&turn()!==state.side))timer=setTimeout(()=>analyze(autoOpponent&&state.mode==='computer'&&turn()!==state.side),90);}
function addMove(index,source='human'){
 if(terminal.winner||terminal.draw){toast('終局しています。一手戻すか、新しい対局を始めてください。');return false}
 if(source==='human'&&state.mode==='computer'&&turn()!==state.side){toast('AIの手番です。「この手を打つ」で続けられます。');return false}
 const check=R.legal(board,index,turn(),state.rule);if(!check.ok){toast(check.reason);speak(check.reason);return false}
 const c=turn();state.history=state.history.slice(0,state.cursor);state.history.push(index);state.cursor++;Object.keys(state.evaluations).forEach(k=>{if(+k>=state.cursor)delete state.evaluations[k]});
 clickSound();changed({autoOpponent:true});if(!terminal.winner&&!terminal.draw)speak(`${state.cursor}手目、${colorName(c)}、${R.coord(index)}。`);return true;
}
function selectCell(i){if(i<0||i>=225)return;keyboard=i;const check=R.legal(board,i,turn(),state.rule);if(!check.ok){toast(check.reason);return}if(state.settings.confirmMoves){pending=i;renderPending();drawBoard();}else addMove(i)}
function undo(){if(!state.cursor)return;state.cursor--;changed({message:'一手戻しました。黒白どちらの着手も戻せます。'});}
function redo(){if(state.cursor>=state.history.length)return;state.cursor++;changed();}
function goTo(cursor){state.cursor=Math.max(0,Math.min(state.history.length,cursor));changed();}
function renderPending(){const show=pending>=0;$('confirmButton').hidden=!show;if(show)$('confirmButton').querySelector('span').textContent=`${R.coord(pending)} に ${colorName(turn())}を打つ`}
function setMode(mode){if(!['coach','computer','studio'].includes(mode))return;state.mode=mode;pending=-1;stopAnalysis();result=null;storageWrite();render();if(state.settings.autoAnalyze||mode==='computer')analyze(mode==='computer'&&turn()!==state.side);if(mode==='studio')toast('盤面を編集し、AIと検討して名前を付けて保存できます。')}
function setSide(side){state.side=side;storageWrite();render();if(state.mode==='computer')analyze(turn()!==state.side);else toast(`あなたを${side===1?'先手・黒':'後手・白'}に設定しました。`)}
function requestReplace(action,message){if(state.history.length){confirmAction=action;$('newMessage').textContent=message||'今の棋譜は置き換わります。必要なら「棋譜」からJSONを書き出してください。';$('newDialog').showModal()}else action()}
function newGame(id=state.openingId){const op=RENJU_OPENINGS.find(o=>o.id===id)||RENJU_LESSONS.find(o=>o.id===id);state.openingId=op?id:'free';state.history=op&&op.moves?op.moves.slice():[];state.cursor=state.history.length;state.evaluations={};changed({autoOpponent:true});}
function selectOpening(id){$('openingDialog').close();requestReplace(()=>newGame(id),'選んだ珠型・手筋テーマで新しく研究を始めます。今の棋譜が必要なら先に保存してください。')}
function render(){
 const c=turn(),end=terminal.winner||terminal.draw,op=opening();
 document.body.dataset.mode=state.mode;document.body.classList.toggle('studio-mode',state.mode==='studio');
 $$('.mode-tab').forEach(b=>{const on=b.dataset.mode===state.mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
 $$('[data-side]').forEach(b=>{const on=+b.dataset.side===state.side;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
 $('ruleSelect').value=state.rule;$('ruleCaption').textContent=state.rule==='renju'?'黒の禁手あり · 交換手順なしの練習用':'双方、五連以上で勝ち · 禁手なし';
 $('mobileRules').textContent=state.rule==='renju'?'連珠':'自由五目';$('mobileSideLabel').textContent=state.side===1?'先手・黒':'後手・白';$('mobileSideStone').className=`stone ${state.side===1?'black':'white'}`;
 $('turnStone').className=`stone ${c===1?'black':'white'}`;$('turnTitle').textContent=end?(terminal.winner?`${colorName(terminal.winner)}の勝ち`:'引き分け'):`${colorName(c)}の手番${state.mode==='computer'?(c===state.side?' · あなた':' · AI'):''}`;
 $('turnSubtitle').textContent=end?'棋譜を戻して、別の一手も研究できます。':state.mode==='studio'?'ひらめきを試して、あなたの戦法へ。':state.cursor===0?'最初の一手を、天元から。':state.mode==='coach'?`あなたは${colorName(state.side)}。相手の着手も盤面に入力。`:'候補の理由を読み、次の一手を。';
 $('moveCounter').innerHTML=`第 <b>${Math.min(225,state.cursor+(end?0:1))}</b> 手`;
 $('openingName').textContent=op.name;$('openingKind').textContent=op.kind||(op.history?'独自戦法':'研究テーマ');$('openingDescription').textContent=op.description||op.note||'保存した局面から、さらに続きを磨いていきましょう。';$('strategyPlan').textContent=op.plan||'AI候補を比較し、相手の応手まで研究しましょう。';$('mobileOpeningName').textContent=op.name;
 $('customCount').textContent=customs.length;$('undoButton').disabled=!state.cursor;$('redoButton').disabled=state.cursor>=state.history.length;$('analyzeButton').disabled=!!end;$('playBestButton').disabled=!!end;
 $('studioTools').hidden=state.mode!=='studio';$('historyTitle').textContent=state.mode==='studio'?'独自戦法を保存':'棋譜';
 $('coordinatesToggle').textContent=`手数表示 ${state.settings.showNumbers?'ON':'OFF'}`;$('coordinatesToggle').setAttribute('aria-pressed',String(state.settings.showNumbers));
 renderHistory();renderPending();renderAnalysis();updateSettings();resizeBoard();
}
function renderHistory(){
 const box=$('historyList');box.replaceChildren();const start=Math.max(0,state.cursor-6),finish=Math.min(state.history.length,Math.max(state.cursor,start+6));
 if(!finish){const s=document.createElement('span');s.className='subtle';s.textContent='ここから、あなたの一局が始まります。';box.append(s)}
 for(let n=start;n<finish;n++)box.append(moveChip(n));
 if($('recordDialog').open)renderFullHistory();
}
function moveChip(n){const b=document.createElement('button');b.className=`move-chip${n+1===state.cursor?' current':''}${n>=state.cursor?' future':''}`;b.innerHTML=`<small>${n+1}</small><i class="stone ${n%2?'white':'black'}"></i><span>${R.coord(state.history[n])}</span>`;b.title=`${n+1}手目まで戻る`;b.onclick=()=>goTo(n+1);return b}
function renderFullHistory(){const b=$('fullHistory');b.replaceChildren();const start=document.createElement('button');start.className='move-chip';start.textContent='開始局面';start.onclick=()=>goTo(0);b.append(start);for(let n=0;n<state.history.length;n++)b.append(moveChip(n));}
function estimate(score){return Math.round(50+49*Math.tanh(score/45000))}
function renderAnalysis(){
 const end=terminal.winner||terminal.draw,valid=result&&resultKey===positionKey();
 $('analysisBadge').innerHTML=busy?'<i></i>THINKING':`<i></i>${end?'FINISHED':valid?'ANALYZED':'READY'}`;$('analysisBadge').classList.toggle('busy',busy);
 $('bestCoord').textContent=end?'—':valid&&result.move>=0?R.coord(result.move):busy?'…':'—';
 $('bestType').textContent=end?(terminal.winner?'対局終了':'引き分け'):valid?shortReason(result.reason):busy?'先を読んでいます':'ヒントを解析';
 $('hintReason').textContent=end?'一手戻して、分岐する未来を検討できます。':valid?result.reason:busy?'攻めと守りの候補を比較しています。':'AIヒントを押すと、次の一手とその狙いを提案します。';
 $('hintReason').title=valid?result.reason:'';
 $('searchTime').textContent=valid?`${(result.elapsed/1000).toFixed(2)} 秒`:'—';$('searchDepth').textContent=valid?`${result.depth}手`:'—';$('searchNodes').textContent=valid?`${result.nodes.toLocaleString()} 局面`:'端末内で解析';
 $('analyzeButton').querySelector('span').textContent=busy?'再解析':'AIヒント';
 const value=end?(terminal.winner?(terminal.winner===1?100:0):50):valid?result.blackShare:Number.isFinite(state.evaluations[state.cursor])?state.evaluations[state.cursor]:50;
 $('blackValue').textContent=value;$('whiteValue').textContent=100-value;$('evalFill').style.width=`${value}%`;$('evalMeter').setAttribute('aria-valuenow',value);
 $('evalLabel').textContent=end?'終局':busy?'解析中':!valid?'未解析':value>=64?'黒優勢':value<=36?'白優勢':'互角';
 const list=$('candidateList');list.replaceChildren();
 if(valid)for(const [rank,m] of result.candidates.entries()){const b=document.createElement('button');b.className='candidate-item';b.innerHTML=`<span class="candidate-rank">0${rank+1}</span><span class="candidate-coord">${R.coord(m.index)}</span><span class="candidate-description"></span><span class="candidate-score">黒 ${estimate(m.score)}</span>`;b.querySelector('.candidate-description').textContent=shortReason(m.reason);b.title=m.reason;b.onclick=()=>{pending=m.index;keyboard=m.index;renderPending();drawBoard();toast(`${R.coord(m.index)}：${m.reason}`)};list.append(b)}
 else{const p=document.createElement('p');p.className='subtle';p.textContent=busy?'候補を比較中…':'AIの解析結果がここに表示されます。';list.append(p)}
 const vals=Object.entries(state.evaluations).filter(([n,v])=>+n<=state.cursor&&Number.isFinite(v)).map(([n,v])=>[+n,v]).sort((a,b)=>a[0]-b[0]);
 if(valid&&!vals.some(v=>v[0]===state.cursor))vals.push([state.cursor,value]);
 const max=Math.max(1,state.cursor);$('evalChartLine').setAttribute('d',vals.length?vals.map(([n,v],i)=>`${i?'L':'M'}${n/max*260} ${36-v*.34}`).join(' '):'M0 19H260');
}
function shortReason(reason=''){return reason.includes('決着')?'五連を完成':reason.includes('防ぐ')?'五連を防ぐ':reason.includes('両端')?'棒四を作る':reason.includes('四と三')?'四三を狙う':reason.includes('四を')?'四で先手を取る':reason.includes('三を育')?'三を育てる':reason.includes('抑え')?'相手の展開を抑える':'連携を広げる'}
function analyze(play=false){
 if(terminal.winner||terminal.draw)return;
 stopAnalysis();const id=++seq,key=positionKey();busy=true;result=null;renderAnalysis();drawBoard();
 try{worker=new Worker('engine.worker.js');}catch(e){analysisError('解析を開始できません。GitHub PagesなどのHTTPSサイトから開いてください。');return}
 worker.onerror=e=>{e.preventDefault();if(id===seq)analysisError('AI解析の読み込みに失敗しました。ファイル一式を確認し、再解析してください。')};
 worker.onmessage=e=>{const data=e.data;if(id!==seq||key!==positionKey())return;if(data.type==='error'){analysisError(data.message||'AI解析に失敗しました。');return}if(data.type!=='result')return;
 busy=false;worker.terminate();worker=null;result=data;resultKey=key;state.evaluations[state.cursor]=data.blackShare;storageWrite();renderAnalysis();drawBoard();
 if(play&&data.move>=0){setTimeout(()=>{if(id===seq&&key===positionKey())addMove(data.move,'ai')},110)}else if(state.settings.narration)speak(`${colorName(turn())}の候補は${R.coord(data.move)}。${data.reason}${data.blackShare>=64?'黒が優勢です。':data.blackShare<=36?'白が優勢です。':'形勢は互角です。'}`);
 };
 worker.postMessage({id,board:board.slice(),turn:turn(),rule:state.rule,budget:+state.settings.budget,style:opening().style||'balanced'});
}
function analysisError(message){stopAnalysis();result=null;renderAnalysis();$('analysisBadge').textContent='ERROR';$('hintReason').textContent=message;toast(message)}
function playBest(){if(result&&resultKey===positionKey()&&result.move>=0)addMove(result.move,'ai');else analyze(true)}
function resizeBoard(){
 const fit=$('boardFit'),rect=fit.getBoundingClientRect(),padding=getComputedStyle(fit);const available=Math.max(65,Math.floor(Math.min(rect.width-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight),rect.height-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom))));
 const frame=$('boardFrame');frame.style.width=`${available}px`;frame.style.height=`${available}px`;
 const c=$('board'),size=c.getBoundingClientRect().width;
 if(size<1)return;dpr=Math.min(3,window.devicePixelRatio||1);canvasSize=size;c.width=Math.round(size*dpr);c.height=Math.round(size*dpr);drawBoard();
}
function drawBoard(){
 if(!canvasSize)return;const c=$('board'),ctx=c.getContext('2d'),s=canvasSize,p=s*.061,step=(s-2*p)/14;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,s,s);
 const wood=ctx.createLinearGradient(0,0,s,s);wood.addColorStop(0,'#ecd2a5');wood.addColorStop(.5,'#e5c28b');wood.addColorStop(1,'#d6b178');ctx.fillStyle=wood;ctx.fillRect(0,0,s,s);
 // Deterministic fine wood grain keeps the playable grid perfectly crisp.
 ctx.lineWidth=.45;for(let k=0;k<200;k++){let y=(k*3.713)%s;ctx.strokeStyle=`rgba(129,88,38,${k%4===0?.045:.022})`;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(s*.3,y+Math.sin(k)*5,s*.6,y-2,s,y+Math.cos(k)*4);ctx.stroke()}
 ctx.strokeStyle='#725b398c';ctx.lineWidth=Math.max(.6,s/780);for(let n=0;n<15;n++){let v=p+n*step;ctx.beginPath();ctx.moveTo(p,v);ctx.lineTo(s-p,v);ctx.moveTo(v,p);ctx.lineTo(v,s-p);ctx.stroke()}
 ctx.strokeStyle='#5d48297d';ctx.lineWidth=1;ctx.strokeRect(p,p,s-2*p,s-2*p);
 ctx.fillStyle='#614c2d';for(const [x,y]of[[3,3],[11,3],[7,7],[3,11],[11,11]]){ctx.beginPath();ctx.arc(p+x*step,p+y*step,Math.max(1.6,s/190),0,Math.PI*2);ctx.fill()}
 ctx.fillStyle='#967b50';ctx.font=`${Math.max(7.5,s*.017)}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';for(let n=0;n<15;n++){ctx.fillText(String.fromCharCode(65+n),p+n*step,p*.38);ctx.fillText(String.fromCharCode(65+n),p+n*step,s-p*.34);ctx.fillText(String(15-n),p*.37,p+n*step);ctx.fillText(String(15-n),s-p*.35,p+n*step)}
 const center=i=>[p+(i%15)*step,p+Math.floor(i/15)*step];
 const stone=(i,color,alpha=1,number=null)=>{const [x,y]=center(i),r=step*.435;ctx.save();ctx.globalAlpha=alpha;ctx.shadowColor='#32220c65';ctx.shadowBlur=step*.12;ctx.shadowOffsetY=step*.10;ctx.shadowOffsetX=step*.025;let grad=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.1,x+r*.16,y+r*.23,r*1.25);if(color===1){grad.addColorStop(0,'#5f615b');grad.addColorStop(.35,'#303530');grad.addColorStop(.78,'#151d18');grad.addColorStop(1,'#0b120e')}else{grad.addColorStop(0,'#fffef8');grad.addColorStop(.55,'#f7f6eb');grad.addColorStop(1,'#c8cabc')}ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle=color===1?'#0c170c55':'#b4b6a460';ctx.lineWidth=.7;ctx.stroke();if(number!==null){ctx.fillStyle=color===1?'#e6e9d4':'#4c5941';ctx.font=`500 ${step*.36}px ${getComputedStyle(document.body).fontFamily}`;ctx.fillText(number,x,y+.5)}ctx.restore()};
 state.history.slice(0,state.cursor).forEach((i,n)=>stone(i,n%2+1,1,state.settings.showNumbers?n+1:null));
 if(state.cursor&&!state.settings.showNumbers){const i=state.history[state.cursor-1],[x,y]=center(i);ctx.fillStyle=board[i]===1?'#dfc48a':'#879b71';ctx.beginPath();ctx.arc(x,y,step*.09,0,Math.PI*2);ctx.fill()}
 if(terminal.line.length){const [x1,y1]=center(terminal.line[0]),[x2,y2]=center(terminal.line.at(-1));ctx.strokeStyle='#b39a50';ctx.lineWidth=step*.09;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
 if(result&&resultKey===positionKey()&&state.settings.showHints&&!terminal.winner&&!terminal.draw){result.candidates.forEach((m,n)=>{if(board[m.index])return;const [x,y]=center(m.index);ctx.save();ctx.strokeStyle=n===0?'#886a24':'#8e7f56aa';ctx.fillStyle=n===0?'#ead8a7dd':'#ecd5a777';ctx.lineWidth=n===0?1.6:1;ctx.setLineDash(n===0?[]:[2,3]);ctx.beginPath();ctx.arc(x,y,step*.35,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=n===0?'#6e561b':'#88744e';ctx.font=`600 ${step*.33}px Georgia,serif`;ctx.fillText(n+1,x,y+.4);ctx.restore()})}
 const preview=pending>=0?pending:hover;if(preview>=0&&!board[preview]&&!terminal.winner&&!terminal.draw){stone(preview,turn(),.40);const[x,y]=center(preview);ctx.strokeStyle='#446e4c';ctx.lineWidth=1.4;ctx.strokeRect(x-step*.46,y-step*.46,step*.92,step*.92)}
 if(document.activeElement===c){const[x,y]=center(keyboard);ctx.strokeStyle='#315d43';ctx.lineWidth=1.7;ctx.setLineDash([3,2]);ctx.strokeRect(x-step*.49,y-step*.49,step*.98,step*.98);ctx.setLineDash([])}
 c.setAttribute('aria-label',`15路盤、${state.cursor}手。${terminal.winner?colorName(terminal.winner)+'の勝ち':colorName(turn())+'の手番'}。選択位置${R.coord(keyboard)}。矢印キーで移動、Enterで着手。`);
}
function hit(e){const r=$('board').getBoundingClientRect(),s=r.width,p=s*.061,step=(s-2*p)/14,x=(e.clientX-r.left-p)/step,y=(e.clientY-r.top-p)/step;if(x<-.5||x>14.5||y<-.5||y>14.5)return-1;return Math.round(y)*15+Math.round(x)}
function clickSound(){if(!state.settings.soundEnabled)return;try{audioCtx ||= new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(950,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(240,audioCtx.currentTime+.05);gain.gain.setValueAtTime(.10,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.065);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.07)}catch{}}
function speak(text){if(!state.settings.narration||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=+state.settings.speechRate||1;const voices=speechSynthesis.getVoices(),v=voices.find(v=>v.lang==='ja-JP')||voices.find(v=>v.lang.startsWith('ja'));if(v)u.voice=v;speechSynthesis.speak(u)}catch{}}
function toggleNarration(on){if(!('speechSynthesis'in window)){toast('このブラウザは音声案内に対応していません。');state.settings.narration=false}else{state.settings.narration=on;if(on)speak('連珠名人。音声案内を開始します。');else speechSynthesis.cancel()}updateSettings();storageWrite()}
function updateSettings(){for(const k of ['autoAnalyze','confirmMoves','showHints','showNumbers','soundEnabled','narration'])$(k).checked=!!state.settings[k];$('speechRate').value=String(state.settings.speechRate);$('budgetSelect').value=String(state.settings.budget);$('voiceToggle').classList.toggle('voice-active',!!state.settings.narration);$('voiceToggle').setAttribute('aria-label',`音声案内を${state.settings.narration?'無効':'有効'}にする`);$('voiceToggle').setAttribute('aria-pressed',String(!!state.settings.narration))}
function miniBoard(moves){const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.classList.add('mini-board');svg.setAttribute('viewBox','0 0 70 70');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(NS,'path');let d='';for(let n=0;n<5;n++){const p=11+n*12;d+=`M11 ${p}H59M${p} 11V59`}path.setAttribute('d',d);path.setAttribute('stroke','#9c8157');svg.append(path);(moves||[]).forEach((i,n)=>{const x=i%15,y=Math.floor(i/15);const c=document.createElementNS(NS,'circle');c.setAttribute('cx',35+(x-7)*12);c.setAttribute('cy',35+(y-7)*12);c.setAttribute('r',4.5);c.setAttribute('fill',n%2?'#fffff2':'#253a2e');c.setAttribute('stroke',n%2?'#b1ad92':'#183025');svg.append(c)});return svg}
function renderOpenings(){const q=$('openingSearch').value.trim().toLowerCase(),filter=$('openingFilter').value,grid=$('openingGrid');grid.replaceChildren();const choices=[{id:'free',name:'自由に打つ',kind:'自由研究',description:'ゼロから、自分の一局を。',moves:[]},...RENJU_OPENINGS,...RENJU_LESSONS.map(o=>({...o,kind:'lesson'}))];for(const op of choices){if(filter!=='all'&&op.kind!==filter)continue;if(q&&!`${op.name} ${op.reading||''} ${op.id} ${op.description} ${op.plan||''}`.toLowerCase().includes(q))continue;const b=document.createElement('button');b.className=`opening-choice${op.id===state.openingId?' active':''}`;const name=document.createElement('b');name.textContent=op.name;const tag=document.createElement('span');tag.className='tag';tag.textContent=op.kind==='lesson'?'手筋':op.id==='free'?'自由':op.id;const desc=document.createElement('span');desc.textContent=op.description;b.append(tag,miniBoard(op.moves),name,desc);b.onclick=()=>selectOpening(op.id);grid.append(b)}if(!grid.children.length){const p=document.createElement('p');p.className='subtle';p.textContent='見つかりません。別のキーワードで検索してください。';grid.append(p)}}
function openOpenings(){renderOpenings();$('openingDialog').showModal()}
function saveStrategy(){if(!state.cursor){toast('盤面に石を置いてから保存してください。');return}const name=$('strategyName').value.trim();if(!name){$('strategyName').focus();toast('独自戦法の名前を入力してください。');return}if(customs.length>=300){toast('保存は300件までです。不要な戦法を整理してください。');return}const s={id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,rule:state.rule,side:state.side,history:state.history.slice(0,state.cursor),cursor:state.cursor,openingId:state.openingId,note:`${opening().name}を基に研究。`,evaluation:result&&resultKey===positionKey()?result.blackShare:null,created:new Date().toISOString()};customs.unshift(s);if(libraryWrite()){toast(`「${name}」を保存しました。`);$('strategyName').value='';$('customCount').textContent=customs.length}}
function renderLibrary(){const box=$('libraryList');box.replaceChildren();if(!customs.length){const el=document.createElement('div');el.className='library-empty';el.innerHTML='<div class="empty-title">まだ見ぬ一手を、ここに。</div><p>戦法工房で盤面を作り、名前を付けて保存すると<br>あなたの戦法がここに並びます。</p>';box.append(el);return}for(const s of customs){const card=document.createElement('article');card.className='saved-card';const h=document.createElement('h3');h.textContent=s.name;const p=document.createElement('p');p.textContent=`${s.history.length}手 · ${s.rule==='renju'?'連珠':'自由五目'} · ${s.evaluation===null?'未解析':`保存時の黒評価指数 ${s.evaluation}`}　${s.note||''}`;const actions=document.createElement('div');actions.className='saved-actions';const open=document.createElement('button');open.className='primary-button';open.textContent='続きを研究';open.onclick=()=>{$('libraryDialog').close();requestReplace(()=>{const rec=normalizeRecord(s);Object.assign(state,rec,{mode:'studio',openingId:s.id,evaluations:{}});changed();},'保存した戦法に切り替えます。今の棋譜が必要なら先に保存してください。')};const del=document.createElement('button');del.className='delete-saved';del.textContent='削除';del.onclick=()=>{confirmAction=()=>{customs=customs.filter(v=>v.id!==s.id);libraryWrite();renderLibrary();render()};$('newMessage').textContent=`「${s.name}」をマイ戦法から削除します。必要なら先に戦法を書き出してください。`;$('newConfirm').textContent='削除する';$('newDialog').querySelector('h2').textContent='この戦法を削除しますか？';$('newDialog').showModal()};actions.append(open,del);card.append(h,p,actions);box.append(card)}}
function download(name,data,type){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportGame(){download(`Renju_Master_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({format:'renju-master-game',version:1,...state,settings:undefined},null,2),'application/json');toast('棋譜JSONを書き出しました。')}
function exportLibrary(){download('Renju_Master_Strategies.json',JSON.stringify({format:'renju-master-strategies',version:1,strategies:customs},null,2),'application/json')}
function openFile(kind){importKind=kind;$('fileInput').value='';$('fileInput').click()}
async function importFile(file){if(!file)return;if(file.size>2000000){toast('読み込めるJSONは2MBまでです。');return}try{const data=JSON.parse(await file.text());if(importKind==='library'){if(data.format!=='renju-master-strategies'||!Array.isArray(data.strategies))throw Error('戦法書き出しファイルを選んでください。');if(data.strategies.length+customs.length>300)throw Error('合計300件までです。');const validated=data.strategies.map((s,n)=>({...normalizeRecord(s),id:`custom-${Date.now()}-${n}`,name:safeText(s.name,40)||'読み込んだ戦法',note:safeText(s.note,500),created:new Date().toISOString(),evaluation:Number.isFinite(s.evaluation)?Math.max(0,Math.min(100,s.evaluation)):null}));customs.push(...validated);libraryWrite();renderLibrary();render();toast(`${validated.length}件の戦法を読み込みました。`)}else{if(data.format!=='renju-master-game')throw Error('連珠名人の棋譜JSONを選んでください。');const rec=normalizeRecord(data);$('recordDialog').close();requestReplace(()=>{Object.assign(state,rec,{mode:'coach',evaluations:{}});changed({message:'棋譜を読み込みました。'});},'読み込んだ棋譜に切り替えます。今の棋譜が必要なら先に保存してください。')}}catch(e){toast(`読込できません：${e.message}`)}}
// Touch guards preserve scrolling in dialogs and text entry in form controls.
if(matchMedia('(pointer:coarse)').matches){
 document.addEventListener('contextmenu',e=>{if(!e.target.closest('input,textarea'))e.preventDefault()});
 document.addEventListener('touchstart',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
 document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
 document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
 document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
}
// Events
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$$('.mode-tab').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$$('[data-side]').forEach(b=>b.onclick=()=>setSide(+b.dataset.side));
$('undoButton').onclick=undo;$('redoButton').onclick=redo;$('resetButton').onclick=()=>requestReplace(()=>newGame());
$('newConfirm').onclick=()=>{const action=confirmAction;confirmAction=null;$('newDialog').close();if(action)action()};$('newDialog').addEventListener('close',()=>{$('newConfirm').textContent='新しく始める';$('newDialog').querySelector('h2').textContent='新しい一局を始めますか？'});
$('analyzeButton').onclick=()=>analyze(false);$('playBestButton').onclick=playBest;$('confirmButton').onclick=()=>{if(pending>=0)addMove(pending,'human')};
$('openingButton').onclick=openOpenings;$('mobileOpening').onclick=openOpenings;$('openingSearch').oninput=renderOpenings;$('openingFilter').onchange=renderOpenings;
$('mobileSide').onclick=()=>setSide(3-state.side);$('mobileRules').onclick=()=>changeRule(state.rule==='renju'?'freestyle':'renju');$('ruleSelect').onchange=e=>changeRule(e.target.value);
function changeRule(rule){requestReplace(()=>{state.rule=rule;newGame(state.openingId)},'ルールを変更すると、新しい対局になります。今の棋譜が必要なら先に保存してください。');$('ruleSelect').value=state.rule}
$('studioButton').onclick=()=>setMode('studio');$('saveStrategy').onclick=saveStrategy;$('strategyName').onkeydown=e=>{if(e.key==='Enter')saveStrategy()};
$('compareButton').onclick=()=>{const box=$('compareList');box.replaceChildren();if(result&&resultKey===positionKey()){result.candidates.forEach((m,n)=>{const card=document.createElement('article');card.className='saved-card';const h=document.createElement('h3');h.textContent=`${n+1}. ${R.coord(m.index)}`;const p=document.createElement('p');p.textContent=m.reason;const b=document.createElement('button');b.className='outline-button';b.textContent='盤面で確認';b.onclick=()=>{pending=m.index;renderPending();drawBoard();$('compareDialog').close()};card.append(h,p,b);box.append(card)});$('pvText').textContent=`読み筋：${result.pv.map(R.coord).join(' → ')}。限られた探索での想定です。実際の応手で変わります。`}else{box.textContent='AIヒントで解析してから開いてください。';$('pvText').textContent=''}$('compareDialog').showModal()};
$('settingsButton').onclick=()=>$('settingsDialog').showModal();$('voiceToggle').onclick=()=>toggleNarration(!state.settings.narration);
for(const id of ['autoAnalyze','confirmMoves','showHints','showNumbers','soundEnabled'])$(id).onchange=e=>{state.settings[id]=e.target.checked;if(id==='confirmMoves')pending=-1;storageWrite();render();if(id==='autoAnalyze'&&e.target.checked)analyze()};
$('narration').onchange=e=>toggleNarration(e.target.checked);$('speechRate').onchange=e=>{state.settings.speechRate=+e.target.value;storageWrite();speak('音声の速さを変更しました。')};$('budgetSelect').onchange=e=>{state.settings.budget=+e.target.value;storageWrite();if(state.settings.autoAnalyze)analyze()};
$('coordinatesToggle').onclick=()=>{state.settings.showNumbers=!state.settings.showNumbers;storageWrite();render()};
$('recordButton').onclick=$('allMovesButton').onclick=()=>{renderFullHistory();$('recordDialog').showModal()};
$('libraryButton').onclick=()=>{renderLibrary();$('libraryDialog').showModal()};$('exportGame').onclick=exportGame;$('importGame').onclick=()=>openFile('game');$('exportLibrary').onclick=exportLibrary;$('importLibrary').onclick=()=>openFile('library');$('fileInput').onchange=e=>importFile(e.target.files[0]);
$('exportImage').onclick=()=>$('board').toBlob(blob=>{if(blob)download('Renju_Master_Board.png',blob,'image/png')},'image/png');
$('helpButton').onclick=$('aboutButton').onclick=()=>$('helpDialog').showModal();
$('focusButton').onclick=()=>{document.body.classList.toggle('focus-mode');$('focusButton').setAttribute('aria-pressed',String(document.body.classList.contains('focus-mode')));resizeBoard();toast(document.body.classList.contains('focus-mode')?'集中表示。右上の拡大ボタンで戻れます。':'通常表示に戻りました。')};
const canvas=$('board');canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){hover=hit(e);drawBoard()}});canvas.addEventListener('pointerleave',()=>{hover=-1;drawBoard()});canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus({preventScroll:true});const i=hit(e);if(i>=0)selectCell(i)});canvas.addEventListener('focus',drawBoard);canvas.addEventListener('blur',drawBoard);
canvas.addEventListener('keydown',e=>{let x=keyboard%15,y=Math.floor(keyboard/15);switch(e.key){case 'ArrowLeft':x=Math.max(0,x-1);break;case 'ArrowRight':x=Math.min(14,x+1);break;case 'ArrowUp':y=Math.max(0,y-1);break;case 'ArrowDown':y=Math.min(14,y+1);break;case 'Enter':case ' ':e.preventDefault();if(pending===keyboard&&state.settings.confirmMoves)addMove(keyboard);else selectCell(keyboard);return;default:return}e.preventDefault();keyboard=y*15+x;hover=keyboard;drawBoard()});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}});
new ResizeObserver(()=>resizeBoard()).observe($('boardFit'));window.addEventListener('resize',resizeBoard);
loadStorage();rebuild();render();if(state.settings.autoAnalyze||(state.mode==='computer'&&turn()!==state.side))timer=setTimeout(()=>analyze(state.mode==='computer'&&turn()!==state.side),160);
})();
