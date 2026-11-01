(function(root){
'use strict';
const DAY=86400000, products=['SM','AN','BD','MMA','BPA'];
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const day=(y,m,d)=>Date.UTC(y,m,d)/DAY;
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);
function date(s,ref,start){
 s=String(s||'').toLowerCase().replace(/,/g,'');
 s=s.replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/g,x=>months.find(m=>m.startsWith(x.slice(0,3))));
 if(/\b(?:days?|weeks?|months?)\b/.test(s)&&/\d/.test(s)&&!months.some(m=>new RegExp('\\b'+m+'\\b').test(s.replace(/may last/,'duration'))))return null;
 if(!s||/unknown|indefinite|not specified|n\/a/.test(s))return null;
 let m=s.match(/(20\d{2})-(\d{2})-(\d{2})/);if(m)return day(+m[1],+m[2]-1,+m[3]);
 let year=+(s.match(/20\d{2}/)||[])[0]||new Date(ref*DAY).getUTCFullYear();
 let mi=months.findIndex(x=>s.includes(x)); if(mi<0){const q=s.match(/q([1-4])/);if(q)return day(year,(+q[1]-1)*3+1,15);return null;}
 let d=15;const before=s.slice(0,s.indexOf(months[mi]));
 const nums=before.match(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*$/);
 if(nums)d=nums[2]?Math.round((+nums[1]+ +nums[2])/2):+nums[1];
 else if(/h1|first half/.test(s))d=8;else if(/h2|second half/.test(s))d=23;
 else if(/early|beginning|first week/.test(s))d=5;else if(/late|end/.test(s))d=25;
 if(/early.*mid/.test(s))d=10;
 let result=day(year,mi,d);
 if(start!=null&&result<start&&!/20\d{2}/.test(s))result=day(year+1,mi,d);
 return result;
}
function product(s){s=String(s).toLowerCase();if(/methyl methacrylate|\bmma\b/.test(s))return'MMA';if(/bisphenol|\bbpa\b/.test(s))return'BPA';if(/styrene monomer|\bsm\b/.test(s))return'SM';if(/acrylonitrile|\bacn\b|\ban\b/.test(s)&&!/styrene|\babs\b/.test(s))return'AN';if(/butadiene|\bbd\b/.test(s)&&!/polybutadiene|rubber|styrene/.test(s))return'BD';return null;}
function field(raw,name){return(raw.match(new RegExp('^'+name+'[^:\\n]*:\\s*([^\\n]+)','im'))||[])[1]||'';}
function publication(raw,fallback){let m=raw.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);if(m)return day(+m[3]<100?2000+ +m[3]:+m[3],months.findIndex(x=>x.startsWith(m[2].toLowerCase())),+m[1]);return date(String(fallback).slice(0,10),day(2026,0,1));}
function capacity(value){let s=String(value).replace(/,/g,'');if(/^\d+(?:\.\d+)?$/.test(s.trim()))return+s;let matches=[...s.matchAll(/\b(\d{4,7})\b/g)];if(matches.length===1)return+matches[0][1];if(matches.length>1&&/\+/.test(s))return matches.reduce((a,m)=>a+ +m[1],0);return null;}
function build(rows,asOf){const as=date(asOf,day(2026,0,1)), groups=new Map(),review=[],seen=new Set();let count=0;
 rows.forEach((r,index)=>{const p=product(r[3]);if(!p)return;count++;let raw=String(r[10]||''),title=raw.split('\n').find(x=>/plant status/i.test(x))||raw.split('\n')[0],pub=publication(raw,r[0]);const cap=capacity(r[4]);
 const issue=reason=>review.push({p,company:r[1],title,reason,index});
 if(!cap||!pub){issue('케파 또는 기사일 확인');return;}
 const signature=[p,r[1],cap,title.replace(/\s/g,''),pub].join('|');if(seen.has(signature))return;seen.add(signature);
 let period=String(r[6]||'').split(/\s*~\s*/),startText=period[0]||field(raw,'Event start'),endText=period[1]||field(raw,'Event (?:finish|end)');
 let start=date(startText,pub),end=date(endText,pub,start);
 if(start==null){issue('가동 변동 시작일 확인');return;}
 if(end==null){const durations=endText.toLowerCase().replace(/\b(a|one|two|three|four|five|six)\b/g,w=>({a:1,one:1,two:2,three:3,four:4,five:5,six:6}[w]));let dur=durations.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*(days?|weeks?|months?)/i);if(dur)end=start+Math.round((+dur[1]+ +(dur[2]||dur[1]))/2)*(/month/i.test(dur[3])?30:/week/i.test(dur[3])?7:1);}
 const comment=field(raw,'Comments?'),text=title+' '+comment;
 let rates=[...title.matchAll(/(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*%/g)];if(!rates.length)rates=[...comment.matchAll(/(?:at|to|rate(?:s)?(?:\s+of)?)\s*(?:around\s*|about\s*)?(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*%/gi)];
 const rate=rates.length?(+rates[0][1]+ +(rates[0][2]||rates[0][1]))/200:null;
 const restart=/restart|resume/i.test(title),full=/full (?:rate|capacity|run)|running at full|100%|back to normal/i.test(title);
 const shut=/shut|offline|turnaround|maintenance|overhaul|keep.*down|pauses|servicing|to maintain/i.test(title);
 let loss=null;if(restart||shut)loss=1;else if(full)loss=0;else if(rate!=null)loss=1-rate;
 // Full-rate/cut-rate reports are operating-rate events even when the legacy status says Maintenance.
 if(!restart&&rate!=null)loss=1-rate;
 if(!restart&&/halves? .*run rate/i.test(title))loss=.5;
 if(shut&&/take turns|in turn|alternat/i.test(comment)&&/two.*lines|two.*units/i.test(comment))loss=.5;
 if(loss==null||loss<0||loss>1){issue('정지 여부 또는 가동률 확인');return;}
 if(restart&&end==null){issue('재가동일 확인');return;}
 if(end!=null&&end<=start){issue('시작·종료일 순서 확인');return;}
 const company=String(r[1]).toLowerCase().replace(/petrochemical|petrochemicals|\bpc\b|corporation|corp\.?|co\.?|ltd\.?/g,'').replace(/[^a-z0-9]/g,'');
 const loc=String(r[2]).toLowerCase().split(',')[0].replace(/[^a-z0-9]/g,'');
 // Capacity separates independent lines. Known Hainan naming variants describe the same BD unit.
 const key=[p,company,/hainan/.test(company)?'hainan':loc,cap].join('|');
 if(!groups.has(key))groups.set(key,{key,p,company:r[1],location:r[2],cap,events:[]});
 groups.get(key).events.push({start,end,loss,pub,title,raw,index,restart,post:restart?rate:null,source:(String(r[8]).match(/https:\/\/subscriber\.icis\.com\/[^\s]+/)||[])[0]||'',startText,endText});
 });
 const plants=[];for(const g of groups.values()){
 g.events.sort((a,b)=>a.pub-b.pub||a.index-b.index);let episodes=[];
 for(const e of g.events){
 // A later report on an overlapping outage replaces its entire earlier schedule, including its old tail.
 let overlaps=episodes.filter(x=>e.loss===1&&x.loss===1&&((e.start<(x.end??as+1)&&x.start<(e.end??as+1))||(/postpone|bring.*forward|reschedul/i.test(e.title)&&(x.end??as+1)>=e.pub&&x.start>=x.pub)));
 if(overlaps.length)episodes=episodes.filter(x=>!overlaps.includes(x));
 episodes.push(e);
 }
 g.episodes=episodes;g.latest=Math.max(...g.events.map(e=>e.pub));plants.push(g);
 }
 plants.sort((a,b)=>products.indexOf(a.p)-products.indexOf(b.p)||String(a.company).localeCompare(String(b.company))||a.cap-b.cap);
 return{plants,review,count,unique:seen.size,asOf:as};
}
function annualLoss(cap,rate,start,end){let total=0;for(let d=start;d<end;d++){const y=new Date(d*DAY).getUTCFullYear();total+=cap*rate/(day(y+1,0,1)-day(y,0,1));}return total;}
function cell(g,start,end,asOf){let total=0,used=new Map();for(let d=start;d<end;d++){
 let active=g.episodes.filter(e=>d>=e.start&&d<(e.end??asOf+1));
 // A restart closes the old outage; a stated post-restart rate continues until superseded.
 for(const e of g.episodes)if(e.restart&&d>=e.end&&d<=asOf)active.push({...e,start:e.end,loss:e.post==null?0:1-e.post});
 active.sort((a,b)=>b.pub-a.pub||b.index-a.index);const e=active[0];if(!e||!e.loss)continue;
 const y=new Date(d*DAY).getUTCFullYear(),n=annualLoss(g.cap,e.loss,d,d+1);total+=n;
 if(!used.has(e.index))used.set(e.index,{event:e,days:0,tons:0});used.get(e.index).days++;used.get(e.index).tons+=n;
 }return{total,evidence:[...used.values()]};}
 const api={build,cell,date,day,iso,products,capacity,annualLoss};if(typeof module!=='undefined')module.exports=api;root.LossEngine=api;
})(typeof window!=='undefined'?window:globalThis);