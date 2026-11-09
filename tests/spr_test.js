// SPR grading rules (Code.gs sprCorrect_): 3/4 = .75 = 0.75 = 0.750, 0.7500 too long, 2/3 → .6666/.6667/0.666/0.667, negatives, leading zero, rounded keys text-only (QK).
const fs=require('fs'),vm=require('vm');const src=fs.readFileSync(require('./paths').APP + '/Code.gs','utf8');
const m=src.slice(src.indexOf('function isCorrect_'),src.indexOf('/** Tags: Questions tab'));const c={};vm.createContext(c);vm.runInContext(m,c);
let BAD=0;const T=(ans,keys,exp)=>{const r=c.sprCorrect_(ans,keys);if(r!==exp)BAD++;console.log((r===exp?'ok ':'BAD')+' '+JSON.stringify(ans)+' vs '+JSON.stringify(keys)+' → '+r);};
const k34=['3/4','.75','0.75'];
T('3/4',k34,true);T('.75',k34,true);T('0.75',k34,true);T('0.750',k34,true);T('0.7500',k34,false);T('6/8',k34,true);T('.7500',k34,true);T('0.751',k34,false);
T('2/3',['2/3'],true);T('.6666',['2/3'],true);T('.6667',['2/3'],true);T('0.666',['2/3'],true);T('0.667',['2/3'],true);T('0.66',['2/3'],false);T('.67',['2/3'],false);T('.6668',['2/3'],false);
T('-1/3',['-1/3'],true);T('-.3333',['-1/3'],true);T('-0.333',['-1/3'],true);T('-.33',['-1/3'],false);T('-0.33',['-1/3'],false);T('1/3',['-1/3'],false);
T('-12',['-12'],true);T('12',['-12'],false);T('-12.0',['-12'],true);
T('05',['5'],true);T('5.',['5'],true);T('.5',['1/2'],true);T('0.5',['1/2'],true);T('1/2',['0.5'],true);
T('7/2',['3.5'],true);T('3.50',['3.5'],true);T('31/2',['3.5'],false);
T('1/0',['1'],false);T('',['1'],false);T('abc',['1'],false);T('123456',['123456'],false);T('-12345',['-12345'],true);
T('1.333',['4/3'],true);T('1.334',['4/3'],false);T('1.33',['4/3'],false);
T('3/4 ',['0.75'],true);
// QK 2026-11-09: a rounded decimal key matches only as typed text (09A M2-11, 10 M1-20)
const k441=['441/677','0.651','.6514'];
T('.651',k441,false);T('0.651',k441,true);T('.6514',k441,true);T('.6515',k441,false);T('441/677',k441,false);/* 7 chars: cannot be typed */T('0.6514',k441,false);
const k917=['9/17','0.529','.5294'];
T('.529',k917,false);T('0.529',k917,true);T('.5294',k917,true);T('.5295',k917,false);T('9/17',k917,true);T('18/34',k917,true);
T('3.333',['10/3','3.333'],true);T('3.33',['10/3','3.333'],false);T('10/3',['10/3','3.333'],true);
// only decimals with different values → all rounded (text only); same value → exact
T('.651',['0.651','.6514'],false);T('0.651',['0.651','.6514'],true);T('.75',['0.75','.75'],true);T('3/4',['0.75','.75'],true);
T('136',['136'],true);T('44',['136'],false);
console.log(BAD ? BAD + ' failed' : 'all SPR cases pass'); process.exit(BAD ? 1 : 0);
