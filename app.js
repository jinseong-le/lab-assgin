// ====== 상태 ======
const state = {
  people: [],            // 전체 인물
  assigned: new Map(),   // pid -> roomId
  roomState: new Map(),  // roomId -> {capacity, gender, type, occupants:[pid]}
  svgEl: null,
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

function renderPeople(){
  // 미배정만 목록에 노출
  const unassigned = state.people.filter(p => !state.assigned.has(p.사번)).sort(sortPeople);
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
      e.dataTransfer.setData('text/from', 'list'); // 출발: 목록
    });
    peopleBox.appendChild(card);
  });
}

// 방 영역의 화면 좌표 → svgHost 상대 좌표
function nodeBBoxInHost(node){
  const r = node.getBoundingClientRect();
  const hostR = svgHost.getBoundingClientRect();
  return { x: r.left - hostR.left, y: r.top - hostR.top, w: r.width, h: r.height };
}

// 방 안의 칩들을 재배치(격자 형태)
function layoutChips(roomId){
  const st = ensureRoom(roomId);
  const node = state.svgEl?.querySelector('#'+CSS.escape(roomId));
  if(!node) return;
  // 기존 칩 제거
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
    // 칩 위치 (격자)
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const left = box.x + pad + col * Math.max(90, (box.w - pad*2)/cols);
    const top  = box.y + pad + row * 22;
    chip.style.left = `${left}px`;
    chip.style.top  = `${top}px`;

    // 칩 드래그 시작(방 → 목록/다른방)
    chip.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('application/json', JSON.stringify(p));
      e.dataTransfer.setData('text/pid', pid);
      e.dataTransfer.setData('text/from', 'room');
      e.dataTransfer.setData('text/roomId', roomId);
    });

    svgHost.appendChild(chip);
  });

  // 시각 강조
  if (st.occupants.length>0) {
    node.style.filter = "drop-shadow(0 0 4px rgba(64,158,255,.6))";
  } else {
    node.style.filter = "";
  }
}

function renderRoom(roomId){
  layoutChips(roomId);
}

function attachRoomHandlers(){
  const svg = state.svgEl;
  if(!svg) return;

  // 드롭 가능 요소: id 있고, 도형 태그, bg로 시작하지 않음
  const all = svg.querySelectorAll('[id]');
  all.forEach(node=>{
    const id  = node.id || "";
    const tag = node.tagName.toLowerCase();
    const isShape = ['rect','path','polygon','polyline','circle','ellipse'].includes(tag);
    if (!isShape) return;
    if (id.toLowerCase().startsWith('bg')) return;

    node.style.cursor = 'pointer';
    node.addEventListener('mouseenter', ()=> node.classList.add('room-hover'));
    node.addEventListener('mouseleave', ()=> node.classList.remove('room-hover'));

    // 드롭(목록/다른방 → 이 방)
    node.addEventListener('dragover', ev=> ev.preventDefault());
    node.addEventListener('drop', ev=>{
      ev.preventDefault();
      const json = ev.dataTransfer.getData('application/json');
      const from = ev.dataTransfer.getData('text/from');
      const pid  = ev.dataTransfer.getData('text/pid');
      const prevRoom = ev.dataTransfer.getData('text/roomId') || null;
      if(!json || !pid) return;
      const person = JSON.parse(json);

      // 방 규칙 검사
      const st = ensureRoom(id);
      if (st.gender && st.gender !== person.성별){
        alert(`성별 제한: ${st.gender} 방입니다.`); return;
      }
      if (st.capacity && st.occupants.length >= st.capacity){
        alert(`정원 초과 (정원: ${st.capacity})`); return;
      }
      if (st.type === "1인실"){
        if (!(String(person.직계||"").startsWith("전임") && person.직위==="교수")){
          if(!confirm("1인실은 전임 '교수' 권장. 계속할까요?")) return;
        }
      } else if (st.type === "2인실"){
        if (!(String(person.직계||"").startsWith("전임") && person.직위!=="교수")){
          if(!confirm("2인실은 전임 '교수 제외' 권장. 계속할까요?")) return;
        }
      }

      // 기존 배정 제거(다른 방에서 왔으면)
      if (state.assigned.has(pid)) {
        const old = state.assigned.get(pid);
        const oldSt = ensureRoom(old);
        oldSt.occupants = oldSt.occupants.filter(x=>x!==pid);
        renderRoom(old);
      }

      // 신규 배정
      st.occupants.push(pid);
      state.assigned.set(pid, id);

      renderRoom(id);
      renderPeople(); // 목록에서 제거
    });

    // 클릭 → 설정 패널
    node.addEventListener('click', ()=>{
      const st = ensureRoom(id);
      p_roomId.value   = id;
      p_type.value     = st.type || "";
      p_capacity.value = st.capacity || 1;
      p_gender.value   = st.gender || "";
      document.getElementById('panelTitle').textContent = `방 설정 (${id})`;
      panel.hidden = false;
    });
  });
}

// ====== SVG 업로드 (DOMParser + viewBox 안전 설정) ======
svgInput.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;

  if (svg.tagName.toLowerCase() !== 'svg'){
    svgHost.innerHTML = '<div class="placeholder">유효한 SVG가 아닙니다</div>';
    return;
  }

  // viewBox 없으면 width/height로 대체
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')) || 1000;
    const h = parseFloat(svg.getAttribute('height')) || 800;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  svgHost.innerHTML = ""; // 기존 제거
  svgHost.appendChild(svg);
  state.svgEl = svg;

  attachRoomHandlers();

  // 목록 영역을 드롭존으로 만들어 "배정 취소" 지원
  peopleBox.addEventListener('dragover', ev=>{
    ev.preventDefault();
    peopleBox.classList.add('drop-hover');
  });
  peopleBox.addEventListener('dragleave', ()=> peopleBox.classList.remove('drop-hover'));
  peopleBox.addEventListener('drop', ev=>{
    ev.preventDefault();
    peopleBox.classList.remove('drop-hover');
    const pid  = ev.dataTransfer.getData('text/pid');
    const from = ev.dataTransfer.getData('text/from');
    const prevRoom = ev.dataTransfer.getData('text/roomId') || null;
    if (!pid) return;
    // 방에서 → 목록(배정 취소)
    if (from === 'room' && prevRoom){
      const prev = ensureRoom(prevRoom);
      prev.occupants = prev.occupants.filter(x=>x!==pid);
      state.assigned.delete(pid);
      renderRoom(prevRoom);
      renderPeople();
    }
  });
});

// ====== 엑셀 업로드 ======
xlInput.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheetName = wb.SheetNames.includes("기준변경 반영") ? "기준변경 반영" : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:"" });

  const allowedTitles = Object.keys(TITLE_ORDER);
  const people = rows.map(r=>({
    사번: String(r["사번"] || ""),
    성명: r["성명"] || "",
    부서: r["부서"] || "",
    직계: r["직계(직종)"] || "",
    직위: r["직위"] || "",
    성별: r["성별"] || "",
    승급일: r["승급일"] || "",
    생년월일: r["생년월일"] || "",
    호봉: r["호봉"] || "",
  }))
  .filter(p => !String(p.직계).startsWith("진료"))
  .filter(p => allowedTitles.includes(p.직위));

  state.people = people;
  // 기존 배정 초기화(새 데이터 기준으로)
  state.assigned.clear();
  state.roomState.forEach(st => st.occupants = []);
  // 기존 칩 제거
  document.querySelectorAll('.occChip').forEach(el=>el.remove());
  renderPeople();
});

// ====== 패널 동작 ======
closePanel.addEventListener('click', ()=> panel.hidden = true);
p_type.addEventListener('change', ()=>{
  const v = p_type.value;
  if (v==="1인실") p_capacity.value = 1;
  else if (v==="2인실") p_capacity.value = 2;
  else if (v==="3인실") p_capacity.value = 3;
  else if (v==="4인실") p_capacity.value = 4;
  else if (v==="6인실") p_capacity.value = 6;
});
applyPanel.addEventListener('click', ()=>{
  const id = p_roomId.value;
  const st = ensureRoom(id);
  st.type = p_type.value;
  st.capacity = Math.max(1, parseInt(p_capacity.value || "1", 10));
  st.gender = p_gender.value;
  alert("적용되었습니다.");
});
clearRoom.addEventListener('click', ()=>{
  const id = p_roomId.value;
  const st = ensureRoom(id);
  // occupants 제거
  st.occupants.forEach(pid => state.assigned.delete(pid));
  st.occupants = [];
  renderRoom(id);
  renderPeople();
  alert("이 방의 배정을 전부 해제했습니다.");
});

// ====== 초기화 ======
resetBtn.addEventListener('click', ()=>{
  state.people = [];
  state.assigned.clear();
  state.roomState.clear();
  peopleBox.innerHTML = "";
  // SVG/칩 초기화
  s
