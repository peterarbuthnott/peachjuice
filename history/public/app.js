const S={m:"Monarchs",i:"Industry",t:"Trade",r:"Transport",a:"Agriculture",x:"Textiles"};
const D=[
[1509,"m","Henry VIII","Accedes aged 17; breaks with Rome and begins the English Reformation (1534)."],
[1547,"m","Edward VI","Boy-king; Protestant reform deepens under his regents."],
[1553,"m","Mary I","Succeeds after Lady Jane Grey’s nine-day claim; restores Catholicism."],
[1558,"m","Elizabeth I","Reigns 44 years; Protestant settlement and the Armada victory (1588)."],
[1603,"m","James I","James VI of Scotland inherits the English crown: the Union of the Crowns."],
[1625,"m","Charles I","Conflict with Parliament leads to civil war (1642) and his execution (1649)."],
[1649,"m","Commonwealth and Protectorate","The monarchy is abolished; from 1653 Oliver Cromwell is Lord Protector."],
[1660,"m","Charles II","Monarchy restored; the Royal Society receives its charter in 1662."],
[1685,"m","James II","The Catholic king is deposed in the Glorious Revolution (1688)."],
[1689,"m","William III and Mary II","The Bill of Rights confirms parliamentary supremacy."],
[1702,"m","Anne","The last Stuart monarch."],
[1707,"m","Acts of Union","England and Scotland merge as the Kingdom of Great Britain.","e"],
[1714,"m","George I","First Hanoverian king."],
[1727,"m","George II","Reigns through the Jacobite rising of 1745."],
[1760,"m","George III","A 60-year reign; loses the American colonies (1783)."],
[1801,"m","Union with Ireland","The United Kingdom of Great Britain and Ireland is created.","e"],
[1820,"m","George IV","Succeeds after a long Regency."],
[1830,"m","William IV","Reform Act (1832) widens the vote."],
[1837,"m","Victoria","A 63-year reign at the height of industry and empire."],
[1901,"m","Edward VII","Succeeds Victoria."],
[1910,"m","George V","Reigns through the First World War."],
[1936,"m","Edward VIII","Abdicates within the year."],
[1936,"m","George VI","Reigns through the Second World War."],
[1952,"m","Elizabeth II","The longest reign in British history, to 2022."],
[2022,"m","Charles III","Accedes on the death of Elizabeth II."],
[1543,"i","Cast-iron cannon","Ralph Hogge casts iron guns in the Sussex Weald, where charcoal-fired blast furnaces multiply."],
[1620,"i","Dud Dudley’s coal-smelted iron","He claims in the 1620s to smelt iron with coal, but never makes it commercial."],
[1698,"i","Savery’s steam pump","Thomas Savery patents a steam-driven pump, the “Miner’s Friend”."],
[1709,"i","Coke smelting at Coalbrookdale","Abraham Darby smelts iron ore with coke, freeing iron from scarce charcoal."],
[1712,"i","Newcomen’s atmospheric engine","The first practical steam engine pumps water from a Staffordshire mine."],
[1742,"i","Crucible steel","Benjamin Huntsman perfects high-quality cast steel in Sheffield."],
[1769,"i","Watt’s separate condenser","James Watt’s patent makes the steam engine far more efficient."],
[1775,"i","Wilkinson’s boring machine","Accurate cylinder boring makes Watt’s engines practical."],
[1779,"i","The Iron Bridge","Abraham Darby III completes the world’s first major cast-iron bridge."],
[1784,"i","Cort’s puddling process","Henry Cort’s puddling and rolling produces wrought iron in bulk."],
[1815,"i","Davy safety lamp","Humphry Davy’s lamp reduces firedamp explosions in coal mines."],
[1828,"i","Hot blast","James Neilson’s preheated air saves fuel in iron furnaces."],
[1839,"i","Steam hammer","James Nasmyth’s design allows very large forgings."],
[1856,"i","Bessemer converter","Henry Bessemer’s process makes cheap steel in quantity."],
[1879,"i","Swan’s electric lamp","Joseph Swan demonstrates a practical incandescent bulb in Newcastle."],
[1884,"i","Parsons’ steam turbine","Charles Parsons’ turbine later drives ships and power stations."],
[1562,"t","Hawkins’s slaving voyage","John Hawkins makes the first English voyage carrying enslaved Africans across the Atlantic."],
[1600,"t","East India Company chartered","Elizabeth I grants a monopoly on English trade with the East Indies."],
[1627,"t","Barbados settled","The English colony becomes a sugar economy built on enslaved labour from the 1640s."],
[1651,"t","Navigation Acts","Goods must be carried in English ships, shaping the colonial trade."],
[1655,"t","Jamaica captured","England seizes the island from Spain; it becomes a major sugar colony."],
[1658,"t","Tea advertised in London","A coffee house advertises “that excellent China drink” for sale."],
[1662,"t","Catherine of Braganza","The new queen’s tea-drinking helps fashion the drink at court."],
[1672,"t","Royal African Company","Chartered with a monopoly on English trade in Africa, including enslaved people."],
[1698,"t","Slave trade opened to private traders","Bristol and Liverpool merchants flourish as the monopoly ends."],
[1713,"t","The asiento","The Treaty of Utrecht gives Britain the contract to supply enslaved Africans to Spanish America."],
[1772,"t","The Somerset case","Lord Mansfield’s ruling bars the forcible removal of an enslaved man from England."],
[1773,"t","Tea Act and Boston Tea Party","Colonists destroy East India Company tea in protest at taxation."],
[1784,"t","Commutation Act","Tea duty falls from 119% to 12.5%, undercutting smugglers and boosting legal imports."],
[1787,"t","Abolition Committee formed","Campaigners including Thomas Clarkson and Granville Sharp organise the movement."],
[1807,"t","Slave Trade Act","Parliament abolishes the British slave trade."],
[1833,"t","Slavery Abolition Act","Slavery ends across most of the Empire from 1834; enslavers, not the enslaved, are compensated."],
[1839,"t","Assam Company","The first British-run tea company grows tea in India."],
[1848,"t","Robert Fortune in China","He obtains tea plants and expertise for the East India Company’s Indian plantations."],
[1869,"t","Cutty Sark launched","A tea clipper built for speed, soon undercut by the Suez Canal and steamships."],
[1555,"r","Highways Act","Each parish must maintain its roads using unpaid labour."],
[1663,"r","First turnpike","Tolls on the Great North Road begin to fund repairs."],
[1761,"r","Bridgewater Canal","Worsley to Manchester: the first major canal of the industrial age."],
[1766,"r","Trent and Mersey Canal begun","The Grand Trunk, finished in 1777, links major river systems."],
[1784,"r","Mail coaches","John Palmer’s fast coaches run from Bristol and Bath to London."],
[1793,"r","Canal Mania","A boom of canal-building acts runs through the 1790s."],
[1804,"r","Trevithick’s locomotive","Richard Trevithick hauls ten tons of iron on rails at Penydarren."],
[1816,"r","McAdam’s roads","John McAdam’s method of crushed-stone surfacing spreads, as does Telford’s."],
[1825,"r","Stockton and Darlington Railway","The first public railway to use steam locomotives."],
[1830,"r","Liverpool and Manchester Railway","Opens after the Rainhill trials; the first intercity passenger line."],
[1841,"r","Great Western Railway","Brunel’s line connects London and Bristol."],
[1844,"r","Railway Regulation Act","Requires cheap daily “Parliamentary trains”, and Railway Mania peaks in 1845–47."],
[1863,"r","London Underground","The Metropolitan Railway opens, the first underground passenger line."],
[1888,"r","Dunlop’s pneumatic tyre","John Dunlop’s invention transforms cycling."],
[1894,"r","Manchester Ship Canal","Ocean-going ships can reach inland Manchester."],
[1896,"r","Locomotives on Highways Act","Raises the speed limit to 14 mph and abolishes the red-flag rule."],
[1523,"a","Fitzherbert’s Boke of Husbandrye","The first English printed guide to farming."],
[1597,"a","Potato in English gardens","Gerard’s Herball illustrates the potato, which spreads slowly as a crop."],
[1645,"a","Clover and turnips","Sir Richard Weston champions both as fodder crops after seeing them in Flanders."],
[1701,"a","Tull’s seed drill","Jethro Tull’s horse-drawn drill sows seed in rows."],
[1730,"a","Norfolk four-course rotation","Wheat, turnips, barley and clover: Viscount Townshend popularises the system around now."],
[1760,"a","Parliamentary enclosure","Enclosure acts multiply, reshaping village farming and common land."],
[1767,"a","Bakewell’s selective breeding","Robert Bakewell’s improved Leicester sheep and cattle transform livestock."],
[1793,"a","Board of Agriculture","Founded to promote improved farming."],
[1815,"a","Corn Laws","Tariffs protect landowners and keep bread prices high."],
[1830,"a","Swing Riots","Farm labourers destroy threshing machines across southern England."],
[1843,"a","Rothamsted Experimental Station","John Lawes, who patented superphosphate in 1842, begins long-term field trials."],
[1846,"a","Corn Laws repealed","Free trade in grain follows the Irish famine."],
[1850,"a","Steam ploughing","John Fowler’s steam ploughing engines appear in the 1850s."],
[1880,"a","Refrigerated imports","Frozen meat and cheap American grain deepen the agricultural depression."],
[1565,"x","New Draperies","Dutch and Walloon refugees in Norwich introduce lighter cloths."],
[1589,"x","Lee’s stocking frame","William Lee’s knitting machine is refused a patent by Elizabeth I."],
[1700,"x","Calico Act","Parliament bans printed Indian calicoes to protect wool, extended in 1721."],
[1733,"x","Flying shuttle","John Kay’s shuttle doubles the speed of weaving."],
[1764,"x","Spinning jenny","James Hargreaves’ machine spins several threads at once."],
[1769,"x","Water frame","Richard Arkwright patents roller spinning powered by water."],
[1771,"x","Cromford Mill","Arkwright opens the first water-powered cotton mill, a template for the factory."],
[1779,"x","Crompton’s mule","Combines the jenny and water frame to spin fine, strong thread."],
[1785,"x","Cartwright’s power loom","Edmund Cartwright patents a loom driven by water or steam."],
[1793,"x","Whitney’s cotton gin","The American invention expands slave-grown cotton supplied to Lancashire."],
[1811,"x","Luddite protests","Textile workers smash machines in the Midlands and the north until 1816."],
[1825,"x","Roberts’ self-acting mule","Richard Roberts automates spinning."],
[1833,"x","Factory Act","Limits children’s hours and creates factory inspectors."],
[1856,"x","Perkin’s mauve","William Perkin discovers the first synthetic dye."],
[1861,"x","Cotton Famine","The American Civil War cuts Lancashire’s cotton supply until 1865."]
];
const sorted=D.map((e,n)=>[e,n]).sort((a,b)=>a[0][0]-b[0][0]||a[1]-b[1]).map(x=>x[0]);
const START=1500,END=2025,L=96,$=id=>document.getElementById(id);
// reigns with start/end (Edward VIII and George VI share 1936)
const reigns=[{n:"Henry VII",s:1500,y:"1485–1509"}];
sorted.filter(e=>e[1]==="m"&&!e[4]).forEach(e=>{const dup=reigns.some(r=>Math.floor(r.s)===e[0]&&r.s>1500);reigns.push({n:e[2],s:e[0]+(dup?.9:0),d:e[3]})});
reigns.forEach((r,i)=>{r.e=i<reigns.length-1?reigns[i+1].s:END;r.y=r.y||(Math.floor(r.s)+"–"+(i<reigns.length-1?Math.ceil(r.e-.5):""));});
reigns.find(r=>r.n==="Edward VIII").y="1936";reigns.find(r=>r.n==="George VI").y="1936–1952";
const reignAt=y=>{let r=reigns[0];for(const k of reigns){if(k.s<=y)r=k;else break}return r.n};
const on=new Set(Object.keys(S));let ppy=10,info=[];
const esc=s=>s;
function build(){
  const W=Math.round((END-START)*ppy)+220,X=y=>Math.round((y-START)*ppy);
  const g=$("grid");info=[];
  g.style.setProperty("--L",L+"px");g.style.setProperty("--W",W+"px");g.style.setProperty("--H","51px");
  let h=`<div class="over">`;
  reigns.forEach((r,i)=>{if(i%2)h+=`<div class="band o" style="left:${X(r.s)}px;width:${X(r.e)-X(r.s)}px"></div>`});
  for(let y=START;y<=END;y+=25)h+=`<div class="gl" style="left:${X(y)}px"></div>`;
  h+=`<div class="cross" id="cross"></div></div><div class="head"><div class="hr axis"><div class="lab">Year</div><div class="track" style="width:${W}px">`;
  for(let y=START;y<=END;y+=25)h+=`<div class="tk${y%100?"":" c"}" style="left:${X(y)}px">${y}</div>`;
  h+=`</div></div><div class="hr rib"><div class="lab">Reign</div><div class="track" style="width:${W}px">`;
  reigns.forEach((r,i)=>{const w=X(r.e)-X(r.s);h+=`<div class="rb${i%2?" o":""}" style="left:${X(r.s)}px;width:${w}px" title="${r.n}">${w>34?r.n:""}</div>`});
  h+=`</div></div></div>`;
  for(const k of Object.keys(S)){
    let body="",rows=0;
    if(k==="m"){
      reigns.forEach((r,i)=>{const w=Math.max(X(r.e)-X(r.s),4);const id=info.push({y:Math.floor(r.s),t:r.n,d:r.d||"Reigned before the chart begins; Henry VII was king until 1509.",k:"m",yr:r.y,r:r.n})-1;
        body+=`<button class="reign" data-i="${id}" style="--c:var(--c-m);left:${X(r.s)}px;width:${w}px" title="${r.n}">${w>60?`${r.n}<small>${r.y}</small>`:""}</button>`});
      const ex=sorted.filter(e=>e[1]==="m"&&e[4]);
      ex.forEach(e=>{const id=info.push({y:e[0],t:e[2],d:e[3],k:"m",r:reignAt(e[0])})-1;body+=`<button class="pin" data-i="${id}" style="--c:var(--c-m);left:${X(e[0])-11}px;top:50px"><b>${e[0]}</b> ${e[2]}</button>`});
      rows=1;var lh=88;
    }else{
      const ends=[];
      sorted.filter(e=>e[1]===k).forEach(e=>{const x=X(e[0])-11,w=(String(e[0]).length+1+e[2].length)*6.5+34;
        let r=ends.findIndex(v=>v+6<=x);if(r<0){r=ends.length;ends.push(0)}ends[r]=x+w;
        const id=info.push({y:e[0],t:e[2],d:e[3],k,r:reignAt(e[0])})-1;
        body+=`<button class="pin" data-i="${id}" style="--c:var(--c-${k});left:${x}px;top:${6+r*30}px"><b>${e[0]}</b> ${e[2]}</button>`});
      var lh=ends.length*30+10;
    }
    h+=`<div class="lane" data-k="${k}" style="--c:var(--c-${k});height:${lh}px;display:${on.has(k)?"flex":"none"}"><div class="lab">${S[k]}</div><div class="track" style="width:${W}px">${body}</div></div>`;
  }
  g.innerHTML=h;
}
function chips(){
  $("chips").innerHTML=Object.keys(S).map(k=>`<button class="chip" role="switch" data-k="${k}" style="--c:var(--c-${k})" aria-checked="${on.has(k)}"><i></i>${S[k]}</button>`).join("");
  $("empty").style.display=on.size?"none":"block";
}
function toggle(f){f();chips();document.querySelectorAll(".lane").forEach(l=>l.style.display=on.has(l.dataset.k)?"flex":"none")}
$("chips").onclick=e=>{const b=e.target.closest(".chip");if(b)toggle(()=>on.has(b.dataset.k)?on.delete(b.dataset.k):on.add(b.dataset.k))};
$("all").onclick=()=>toggle(()=>Object.keys(S).forEach(k=>on.add(k)));
$("none").onclick=()=>toggle(()=>on.clear());
$("jump").innerHTML=[1500,1600,1700,1800,1900,2000].map(y=>`<button data-y="${y}">${y}</button>`).join(" ");
$("jump").onclick=e=>{const y=e.target.dataset.y;if(y)$("sc").scrollTo({left:(y-START)*ppy,behavior:"smooth"})};
$("z").oninput=e=>{const sc=$("sc"),mid=START+(sc.scrollLeft+sc.clientWidth/2-L)/ppy;ppy=+e.target.value;build();sc.scrollLeft=(mid-START)*ppy-sc.clientWidth/2+L};
function show(el){
  const o=info[el.dataset.i];if(!o)return;
  document.querySelectorAll(".sel").forEach(x=>x.classList.remove("sel"));el.classList.add("sel");
  $("read").textContent=o.k==="m"?`${o.t}${o.yr?" ("+o.yr+")":" ("+o.y+")"}`:`${o.y}: ${o.t}`;
  $("det").textContent=o.d+(o.k==="m"?"":` Fell in the reign of ${o.r}.`);
}
const gr=$("grid");
gr.addEventListener("mouseover",e=>{const b=e.target.closest(".pin,.reign");if(b)show(b)});
gr.addEventListener("focusin",e=>{const b=e.target.closest(".pin,.reign");if(b)show(b)});
gr.addEventListener("click",e=>{const b=e.target.closest(".pin,.reign");if(b)show(b)});
gr.addEventListener("pointermove",e=>{
  const x=e.clientX-gr.getBoundingClientRect().left-L,c=$("cross");
  if(!c)return;if(x<0||e.target.closest(".pin,.reign")){return}
  c.style.display="block";c.style.left=x+"px";
});
gr.addEventListener("pointerleave",()=>{const c=$("cross");if(c)c.style.display="none"});
gr.addEventListener("pointermove",e=>{
  if(e.target.closest(".pin,.reign"))return;
  const x=e.clientX-gr.getBoundingClientRect().left-L;if(x<0)return;
  const y=Math.round(START+x/ppy);if(y>END)return;
  $("read").textContent=`${y}: reign of ${reignAt(y)}`;
});
chips();build();
