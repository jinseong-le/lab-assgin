window.addEventListener('DOMContentLoaded', () => {
  // ====== 전역 상태 ======
  const state = {
    people: [],            // 전체 인물
    assigned: new Map(),   // pid -> roomId
    roomState: new Map(),  // roomId -> {capacity, gender, type, occupants:[pid]}
    svgEl: null,
    search: "",
  };

  // ====== 우선순위: 직위 > 호봉(내림) > 승급일 > 생년월일 ======
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

  // ====== DOM ======
  const svgHost   = document.getElementById('svgHost');
  const peopleBox = document.getElementById('people');
  const svgInput  = document.getElementById('svgInput');
  const xlInput   = document.getElementById('xlInput');
  const resetBtn  = document.getElementById('resetBtn');
  const searchInp = document.getElementById('search');
  const statusEl  = document.getElementById('status');
  const versionEl = document.getElementById('versionBadge');
  if (versionEl) versionEl.textContent = 'v1.02';
  if (statusEl)  statusEl.textContent  = 'v1.02 | 대기 중… SVG/엑셀을 업로드하세요';

  // ====== 도우미 ======
  function setStatus(msg){ if(statusEl) statusEl.textContent = `v1.02 | ${msg}`; }
  function ensureRoom(roomId){
    if(!state.roomState.has(roomId)){
      state.roomState.set(roomId, {capacity:1, gender:"", type:"", occupants:[]});
    }
    return state.roomState.get(roomId);
  }
  function getPerson(pid){ return state.people.find(x=>x.사번===pid); }

  // 방 화면좌표 (스크롤 보정)
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
      .filter(p => !state.assigned.has(p.
