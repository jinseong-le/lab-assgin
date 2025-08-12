// ====== 상태 ======
const state = {
  people: [],          // 엑셀에서 읽은 인물
  roomState: new Map(),// roomId -> {capacity, gender, type, occupants:[]}
  svgEl: null,
};

// ====== 정렬 우선순위: 직위 > 호봉(내림) > 승급일(오름) > 생년월일(오름) ======
const TITLE_ORDER = {
  "교수":1,"부교수":2,"조교수":3,
  "임상교수":4,"임상부교수":5,"임상조교수":6,"임상진료조교수":7,"임상강사":8
};
function toInt(s){ const n = parseInt(String(s).split(".")[0],10); return isNaN(n)?-999999:n; }
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

function renderPeople(){
  peopleBox.innerHTML = "";
  state.people.sort(sortPeople).forEach(p=>{
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
    });
    peopleBox.appendChild(card);
  });
}

function attachRoomHandlers(){
  const svg = state.svgEl;
  if(!svg) return;
  // 드롭 가능 요소: id가 있고, 태그가 도형이고, bg로 시작하지 않는 것
  const all = svg.querySelectorAll('[id]');
  all.forEach(node=>{
    const id  = node.id || "";
    const tag = node.tagName.toLowerCase();
    const isShape = ['rect','path','polygon','polyline','circle','ellipse'].includes(tag);
    if (!isShape) return;
    if (id.toLowerCase().startsWith('bg')) return; // 배경은 드롭 불가

    node.style.cursor = 'pointer';
    node.addEventListener('mouseenter', ()=> node.classList.add('room-hover'));
    node.addEventListener('mouseleave', ()=> node.classList.remove('room-hover'));

    node.addEventListener('dragover', ev=> ev.preventDefault());
    node.addEventListener('drop', ev=>{
      ev.preventDefault();
      const json = ev.dataTransfer.getData('application/json');
      if(!json) return;
      const person = JSON.parse(json);

      const st = ensureRoom(id);
      // 성별 제한
      if (st.gender && st.gender !== person.성별){
        alert(`성별 제한: ${st.gender} 방입니다.`); return;
      }
      // 정원 제한
      if (st.capacity && st.occupants.length >= st.capacity){
        alert(`정원 초과 (정원: ${st.capacity})`); return;
      }
      // (선택) 규정 경고 — 자유 배정 원칙이면 끄셔도 됩니다.
      if (st.type === "1인실"){
        if (!(String(person.직계||"").startsWith("전임") && person.직위==="교수")){
          if(!confirm("1인실은 전임 '교수' 권장. 계속할까요?")) return;
        }
      } else if (st.type === "2인실"){
        if (!(String(person.직계||"").startsWith("전임") && person.직위!=="교수")){
          if(!confirm("2인실은 전임 '교수 제외' 권장. 계속할까요?")) return;
        }
      }
      st.occupants.push(person);
      // 간단 표시: data-occupants 속성만
      node.setAttribute('data-occupants', st.occupants.length);
      node.style.filter = "drop-shadow(0 0 4px rgba(64,158,255,.6))";
    });

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

// ====== 이벤트: SVG 업로드 ======
svgInput.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  svgHost.innerHTML = text;

  const svg = svgHost.querySelector('svg');
  if(!svg){ svgHost.innerHTML = '<div class="placeholder">유효한 SVG가 아닙니다</div>'; return; }
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  state.svgEl = svg;
  attachRoomHandlers();
});

// ====== 이벤트: 엑셀 업로드 ======
xlInput.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  // 우선순위 시트: "기준변경 반영" -> 그 외 맨 앞
  const sheetName = wb.SheetNames.includes("기준변경 반영") ? "기준변경 반영" : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:"" });

  const need = ["사번","성명","부서","직계(직종)","직위","성별","승급일","생년월일","호봉"];
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
  // 진료* 제외 & 교수군만
  .filter(p => !String(p.직계).startsWith("진료"))
  .filter(p => Object.keys(TITLE_ORDER).includes(p.직위));

  state.people = people;
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
  st.occupants = [];
  const node = state.svgEl?.querySelector('#'+CSS.escape(id));
  if (node) node.removeAttribute('data-occupants');
  alert("이 방의 배정을 전부 해제했습니다.");
});

// ====== 초기화 ======
resetBtn.addEventListener('click', ()=>{
  state.people = [];
  state.roomState.clear();
  peopleBox.innerHTML = "";
  svgHost.innerHTML = '<div class="placeholder">왼쪽의 <b>SVG</b>와 <b>엑셀</b>을 업로드하세요</div>';
  panel.hidden = true;
});
