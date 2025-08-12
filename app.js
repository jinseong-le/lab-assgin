// ====== 상태 ======
const state = {
  people: [],            // 전체 인물
  assigned: new Map(),   // pid -> roomId
  roomState: new Map(),  // roomId -> {capacity, gender, type, occupants:[pid]}
  svgEl: null,
  search: "",
};

// ====== 정렬 우선순위: 직위 > 호봉(내림) > 승급일(오름) > 생년월일(오름) ======
const TITLE_ORDER = {
  "교수":1,"부교수":2,"조교수":3,
  "임상교수":4,"임상부교수":5,"임상조교수":6,"임상진료조교수":7,"임상강사":8
};
const toInt = s => {
  const n = parseInt(String(s||"").split(".")[0],10);
  return isNaN(n) ? -999999 : n;
};
function sortPeople(a,b){
  const t = (TITLE_ORDER[a.직위]||99) - (TITLE_ORDER[b.직위]||99);
  if (t!==0) return t;
  const s = toInt(b.호봉) - toInt(a.호봉);
  if (s!==0) return s;
  const p = String(a.승급일||"").localeCompare(String(b.승급일||""));
  if (p!==0) return p;
  return String(a.생년월일||"").localeCompare(String(b.생년월일||""));
}

// ====== 엘리먼트 ======
const svgHost   = document.getElementById('svgHost');
const peopleBox = document.getElementById('people');
const svgInput  = document.getElementById('svgInput');
const xlInput   = document.getElementById('xlInput');
const resetBtn  = document.getElementById('resetBtn');
const searchInp = document.getElementById('search');

// 패널
const panel      = document.getElementById('roomPanel');
const closePanel = document.getElementById('closePanel');
const applyPanel = document.getElementById('applyPanel');
const clearRoom  = document.getElementById('clearRoom');
const p_roomId   = document.getElementById('p_roomId');
const p_type     = document.getElementById('p_type');
const p_capacity = document.getElementById('p_capacity');
const p_gender   = document.getElementById('p_gender');

// ====== 유틸 ======
function ensureRoom(roomId){
  if(!state.roomState.has(roomId)){
    state.roomState.set(roomId, {capacity:1, gender:"", type:"", occupants:[]});
  }
  return state.roomState.get(roomId);
}
function getPerson(pid){ return state.people.find(x=>x.사번===pid); }

// 방 화면좌표 도출
function nodeBBoxInHost(node){
  const r = node.getBoundingClientRect();
  const hostR = svgHost.getBoundingClientRect();
  return { x: r.left - hostR.left + svgHost.scrollLeft, y: r.top - hostR.top + svgHost.scrollTop, w: r.width, h: r.height };
}

// 칩 배치
function layoutChips(roomId){
  const st = ensureRoom(roomId);
  const node = state.svgEl?.querySelector('#'+CSS.escape(roomId));
  if(!node) return;

  // 기존 제거
  svgHost.querySelectorAll(`.occChip[data-room="${CSS.escape(roomId)}"]`).forEach(el=>el.remove());

  const box = nodeBBoxInHost(node);
  const pad = 4;
  const cols = Math.max(1, Math.floor(box.w / 90));
  st.occupants.forEach((pid, idx)=>{
    const p = getPerson(pid);
    if(!p) return;
    const chip = document.createElement('div');
    chip.className = 'occChip ' + (p.성별==="남자"?"male":"female");
    chip.dataset.room = roomId;
    chip.dataset.pid = pid;
    chip.draggable = true;
    chip.textContent = `${p.부서} ${p.성명}${p.성별==="남자"?" (남)":" (여)"}`;
    // 위치
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const left = box.x + pad + col * Math.max(90, (box.w - pad*2)/cols);
    const top  = box.y + pad + row * 22;
    chip.style.left = `${left}px`;
    chip.style.top  = `${top}px`;

    chip.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('application/json', JSON.stringify(p));
      e.dataTransfer.setData('text/pid', pid);
      e.dataTransfer.setData('text/from', 'room');
      e.dataTransfer.setData('text/roomId', roomId);
    });

    svgHost.appendChild(chip);
  });

  // 강조
  if (st.occupants.length>0) node.style.filter = "drop-shadow(0 0 4px rgba(64,158,255,.6))";
  else node.style.filter = "";
}

function renderRoom(roomId){ layoutChips(roomId); }

// 목록 렌더
function renderPeople(){
  const keyword = state.search.trim();
  const regex = keyword ? new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : null;
  const unassigned = state.people
    .filter(p => !state.assigned.has(p.사번))
    .filter(p => !regex || regex.test(p.성명))
    .sort(sortPeople);

  peopleBox.innerHTML = "";
  unassigned.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'card ' + (p.성별==="남자"?"male":"female");
    card.draggable = true;
    card.dataset.pid = p.사번;
    card.innerHTML = `
      <div><b>${p.성명}</b> <span class="badge">${p.직위}</span></div>
      <div class="meta">${p.부서} · ${p.성별} · 승급:${p.승급일} · 생:${p.생년월일} · 호봉:${p.호봉}</div>
    `;
    card.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('application/json', JSON.stringify(p));
      e.dataTransfer.setData('text/pid', p.사번);
      e.dataTransfer.setData('text/from', 'list');
    });
    peopleBox.appendChild(card);
  });
}

// ====== SVG 안전 로드 (DOMParser + viewBox 보정) ======
async function loadSvgFromFile(file){
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  let svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error("유효한 SVG 아님");

  // viewBox 없으면 일단 임시 추가
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')) || 1000;
    const h = parseFloat(svg.getAttribute('height')) || 800;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width'); svg.removeAttribute('height');

  // 호스트에 부착 후 실제 bbox로 viewBox 재설정(숨은 요소 포함)
  svgHost.innerHTML = "";
  svgHost.appendChild(svg);
  // 일부 SVG는 스타일/레이어 때문에 bbox가 0일 수 있어 전체 요소 bbox로 합산
  try {
    const nodes = svg.querySelectorAll('*');
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    nodes.forEach(n=>{
      if (typeof n.getBBox === 'function') {
        try{
          const b = n.getBBox();
          if (isFinite(b.x) && isFinite(b.y) && isFinite(b.width) && isFinite(b.height)){
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
          }
        }catch(_) {}
      }
    });
    if (minX < Infinity && minY < Infinity && maxX > -Infinity && maxY > -Infinity) {
      const vw = Math.max(1, maxX - minX), vh = Math.max(1, maxY - minY);
      svg.setAttribute('viewBox', `${minX} ${minY} ${vw} ${vh}`);
    }
  } catch(e){ /* ignore */ }

  state.svgEl = svg;
  attachRoomHandlers();
  attachPeopleDropzone(); // 목록으로 드래그 복귀
}

// 방 이벤트 바인딩
function attachRoomHandlers(){
  const svg = state.svgEl;
  if(!svg) return;

  const all = svg.querySelectorAll('[id]');
  all.forEach(node=>{
    const id  = node.id || "";
    const tag = node.tagName.toLowerCase();
    const isShape = ['rect','path','polygon','polyline','circle','ellipse'].includes(tag);
    if (!isShape) return;
    if (id.toLowerCase().startsWith('bg')) return; // 배경 드롭 금지

    node.style.cursor = 'pointer';
    node.addEventListener('mouseenter', ()=> node.classList.add('room-hover'));
    node.addEventListener('mouseleave', ()=> node.classList.remove('room
