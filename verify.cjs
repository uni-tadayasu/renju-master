/* Regression checks: node verify.cjs */
{
'use strict';
const assert=require('node:assert/strict');
const R=require('./rules.js');
const idx=(x,y)=>y*15+x;
const make=(black=[],white=[])=>{const b=Array(225).fill(0);black.forEach(([x,y])=>b[idx(x,y)]=1);white.forEach(([x,y])=>b[idx(x,y)]=2);return b;};
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function unchanged(b,fn){const before=b.slice();const value=fn();assert.deepEqual(b,before,'rule evaluation must not alter board');return value;}
check('coordinates match 15x15 board',()=>{assert.equal(R.coord(0),'A15');assert.equal(R.coord(112),'H8');assert.equal(R.coord(224),'O1');});
check('renju initial stone must be center; freestyle unrestricted',()=>{let b=make();assert.equal(R.legal(b,112,1).ok,true);assert.equal(R.legal(b,111,1).ok,false);assert.equal(R.legal(b,111,1,'freestyle').ok,true);});
check('occupied and out-of-board cells rejected',()=>{const b=make([[7,7]]);assert.equal(R.legal(b,112,1).ok,false);assert.equal(R.legal(b,-1,2).ok,false);assert.equal(R.legal(b,225,2).ok,false);});
check('black exact five wins',()=>{let b=make([[3,7],[4,7],[5,7],[6,7]]);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);b[112]=1;assert.equal(R.outcome(b,112).winner,1);assert.equal(R.outcome(b,112).line.length,5);});
check('black overline rejected; freestyle permits it',()=>{let b=make([[2,7],[3,7],[4,7],[5,7],[6,7]]);const status=unchanged(b,()=>R.legal(b,112,1));assert.equal(status.ok,false);assert.match(status.reason,/長連/);assert.equal(R.legal(b,112,1,'freestyle').ok,true);b[112]=1;assert.equal(R.outcome(b,112).winner,2);assert.equal(R.outcome(b,112,'freestyle').winner,1);});
check('white six in a row is a win',()=>{let b=make([],[[2,7],[3,7],[4,7],[5,7],[6,7]]);assert.equal(unchanged(b,()=>R.legal(b,112,2)).ok,true);b[112]=2;assert.equal(R.outcome(b,112).winner,2);});
check('black five takes priority over crossing overline',()=>{let b=make([[3,7],[4,7],[5,7],[6,7],[7,2],[7,3],[7,4],[7,5],[7,6]]);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);b[112]=1;assert.equal(R.outcome(b,112).winner,1);});
check('black crossing live threes are forbidden',()=>{let b=make([[6,7],[8,7],[7,6],[7,8]]);const s=unchanged(b,()=>R.legal(b,112,1));assert.equal(s.ok,false);assert.match(s.reason,/三三/);assert.equal(R.legal(b,112,2).ok,true);});
check('black crossing fours are forbidden',()=>{let b=make([[5,7],[6,7],[8,7],[7,5],[7,6],[7,8]]);const s=unchanged(b,()=>R.legal(b,112,1));assert.equal(s.ok,false);assert.match(s.reason,/四四/);});
check('two broken fours on the same line are forbidden',()=>{let b=make([[3,7],[4,7],[5,7],[9,7],[10,7],[11,7]]);const s=unchanged(b,()=>R.legal(b,112,1));assert.equal(s.ok,false);assert.match(s.reason,/四四/);});
check('a straight open four counts once',()=>{let b=make([[5,7],[6,7],[8,7]]);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);});
check('edge-blocked three does not cause a false double-three',()=>{let b=make([[0,7],[2,7],[1,6],[1,8]]);assert.equal(unchanged(b,()=>R.legal(b,idx(1,7),1)).ok,true);});
check('enemy-blocked three is not a live three',()=>{let b=make([[6,7],[8,7],[7,6],[7,8]],[[5,7],[9,7]]);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);});
check('a three whose extensions both make overlines is false',()=>{let black=[[6,7],[8,7],[7,6],[7,8]];for(const x of [5,9])for(let y=2;y<=6;y++)black.push([x,y]);let b=make(black);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);b[112]=1;for(const x of [5,9]){const s=unchanged(b,()=>R.legal(b,idx(x,7),1));assert.equal(s.ok,false);assert.match(s.reason,/長連/);}});
check('four-three fork remains legal',()=>{let b=make([[5,7],[6,7],[8,7],[7,6],[7,8]]);assert.equal(unchanged(b,()=>R.legal(b,112,1)).ok,true);});
check('nonterminal outcome has no winner',()=>{const b=make([[7,7]],[[8,8]]);assert.deepEqual(R.outcome(b,idx(8,8)),{winner:0,draw:false,line:[]});});
console.log(count+' rules tests passed');

}
{
'use strict';
const assert=require('node:assert/strict');
const {analyze}=require('./engine.worker.js');
const Rules=require('./rules.js');
const b=()=>Array(225).fill(0),i=(x,y)=>y*15+x;
function test(name,board,turn,check,rule='renju',budget=180){
  const snapshot=board.slice();const out=analyze({id:name,board,turn,rule,budget});
  assert.equal(out.type,'result');assert.deepEqual(board,snapshot);assert(Rules.legal(board,out.move,turn,rule).ok);check(out);console.log(name,JSON.stringify({move:Rules.coord(out.move),depth:out.depth,nodes:out.nodes,elapsed:out.elapsed,score:out.score}));return out;
}
test('empty center',b(),1,o=>assert.equal(o.move,112));
let a=b();[3,4,5,6].forEach(x=>a[i(x,7)]=1);a[i(2,7)]=2;
test('finish five',a,1,o=>assert.equal(o.move,i(7,7)));
a=b();[3,4,5,6].forEach(x=>a[i(x,7)]=2);a[i(2,7)]=1;
test('forced block',a,1,o=>assert.equal(o.move,i(7,7)));
a=b();[3,4,6,7].forEach(x=>a[i(x,7)]=1);[3,4,5,6].forEach(y=>a[i(5,y)]=1);
test('find a winning fork',a,1,o=>{const c=a.slice();c[o.move]=1;assert.equal(Rules.outcome(c,o.move,'renju').winner,1);});
a=b();[[7,7,1],[7,6,2],[8,6,1],[8,8,2],[6,8,1],[6,7,2],[9,7,1],[7,9,2],[9,8,1],[8,9,2]].forEach(([x,y,c])=>a[i(x,y)]=c);
const mid=test('midgame bounded search',a,1,o=>{assert(o.elapsed<1600);assert(o.depth>=1);assert(o.candidates.length>0);},'renju',950);
assert(mid.blackShare>=1&&mid.blackShare<=99);
console.log('All engine tests passed.');

}
