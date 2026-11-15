/* Renju Master — original rules implementation. RIF rules §9.1–9.3.
   Practice opening: black starts at the center; tournament swap procedures excluded. */
(function (root) {
  'use strict';
  const SIZE=15, DIRS=[[1,0],[0,1],[1,1],[1,-1]];
  function at(x,y){return x>=0&&x<15&&y>=0&&y<15?y*15+x:-1;}
  function step(i,dx,dy,n){return at(i%15+dx*n,Math.floor(i/15)+dy*n);}
  function run(board,i,color,dx,dy){
    const out=[i];
    for(let n=1;n<15;n++){const p=step(i,dx,dy,-n);if(p<0||board[p]!==color)break;out.unshift(p);}
    for(let n=1;n<15;n++){const p=step(i,dx,dy,n);if(p<0||board[p]!==color)break;out.push(p);}
    return out;
  }
  function rows(board,i,color){return DIRS.map(([dx,dy])=>run(board,i,color,dx,dy));}
  function fours(board,i){
    const found=new Map();
    DIRS.forEach(([dx,dy],d)=>{
      for(let s=-4;s<=0;s++){
        const stones=[];let empty=-1,valid=true;
        for(let n=s;n<s+5;n++){
          const p=step(i,dx,dy,n);if(p<0||board[p]===2){valid=false;break;}
          if(board[p]===1)stones.push(p);else if(empty<0)empty=p;else{valid=false;break;}
        }
        if(!valid||stones.length!==4||empty<0)continue;
        board[empty]=1;const length=run(board,empty,1,dx,dy).length;board[empty]=0;
        if(length===5){const key=stones.slice().sort((a,b)=>a-b).join(',');if(!found.has(key))found.set(key,{direction:d,stones,ends:[]});found.get(key).ends.push(empty);}
      }
    });
    return Array.from(found.values());
  }
  function rawThrees(board,i){
    const found=new Map();
    DIRS.forEach(([dx,dy],d)=>{
      for(let n=-3;n<=3;n++){
        if(n===0)continue;const q=step(i,dx,dy,n);if(q<0||board[q])continue;
        board[q]=1;const r=run(board,i,1,dx,dy);
        if(r.length===4&&r.includes(q)){
          const left=step(r[0],dx,dy,-1),right=step(r[r.length-1],dx,dy,1);
          if(left>=0&&right>=0&&!board[left]&&!board[right]){
            board[left]=1;const a=run(board,left,1,dx,dy).length===5;board[left]=0;
            board[right]=1;const b=run(board,right,1,dx,dy).length===5;board[right]=0;
            if(a&&b){const stones=r.filter(p=>p!==q),key=stones.slice().sort((a,b)=>a-b).join(',');if(!found.has(key))found.set(key,{direction:d,stones,extensions:[]});found.get(key).extensions.push(q);}
          }
        }
        board[q]=0;
      }
    });
    return Array.from(found.values());
  }
  function blackStatus(board,i,memo){
    // Each recursive call adds a black stone. This exactly checks fake threes,
    // including those whose extension is itself an illegal double-three.
    const key=i+':'+board.join('');if(memo.has(key))return memo.get(key);
    const rr=rows(board,i,1);let result;
    if(rr.some(r=>r.length===5))result={ok:true,reason:'五連',win:true};
    else if(rr.some(r=>r.length>5))result={ok:false,reason:'長連（黒は六連以上を作れません）'};
    else if(fours(board,i).length>=2)result={ok:false,reason:'四四（黒の禁手）'};
    else{
      const threes=rawThrees(board,i);let live=0;
      if(threes.length<2){result={ok:true,reason:''};memo.set(key,result);return result;}
      for(const t of threes){
        let valid=false;
        for(const q of t.extensions){
          board[q]=1;
          // Definition of a three excludes an extension making five elsewhere.
          const status=blackStatus(board,q,memo);
          board[q]=0;
          if(status.ok&&!status.win){valid=true;break;}
        }
        if(valid&&++live>=2)break;
      }
      result=live>=2?{ok:false,reason:'三三（黒の禁手）'}:{ok:true,reason:''};
    }
    memo.set(key,result);return result;
  }
  function forbidden(board,index){
    if(!Number.isInteger(index)||index<0||index>=225)return {ok:false,reason:'盤外です'};
    if(board[index]&&board[index]!==1)return {ok:false,reason:'石が置かれています'};
    const previous=board[index];board[index]=1;
    try{return blackStatus(board,index,new Map());}finally{board[index]=previous;}
  }
  function legal(board,index,color,rule='renju'){
    if(!Number.isInteger(index)||index<0||index>=225)return {ok:false,reason:'盤外です'};
    if(color!==1&&color!==2)return {ok:false,reason:'石の色が不正です'};
    if(board[index])return {ok:false,reason:'すでに石が置かれています'};
    if(rule==='renju'&&color===1){
      if(index!==112&&!board.some(Boolean))return {ok:false,reason:'連珠の初手は天元 H8 に置きます'};
      return forbidden(board,index);
    }
    return {ok:true,reason:''};
  }
  function outcome(board,lastIndex,rule='renju'){
    if(Number.isInteger(lastIndex)&&lastIndex>=0&&lastIndex<225&&board[lastIndex]){
      const color=board[lastIndex],rr=rows(board,lastIndex,color);
      const win=rr.find(r=>rule==='renju'&&color===1?r.length===5:r.length>=5);
      if(win)return {winner:color,draw:false,line:win};
      if(rule==='renju'&&color===1){const st=forbidden(board,lastIndex);if(!st.ok)return {winner:2,draw:false,line:[],reason:st.reason};}
    }
    return {winner:0,draw:!board.some(v=>!v),line:[]};
  }
  function coord(index){return String.fromCharCode(65+index%15)+(15-Math.floor(index/15));}
  const api={SIZE,DIRS,legal,outcome,forbidden,coord,rows};
  root.RenjuRules=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
