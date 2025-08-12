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

  // 목록 드롭존(배정 취소용)
  function attachPeopleDropzone(){
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
      if (from === 'room' && prevRoom){
        const prev = ensureRoom(prevRoom);
        prev.occupants = prev.occupants.filter(x=>x!==pid);
        state.assigned.delete(pid);
        renderRoom(prevRoom);
        renderPeople();
        setStatus(`배정 취소: ${pid}`);
      }
    });
  }

  // ====== SVG 안전 로드 (DOMParser + 루트/첫번째 <svg> + viewBox 보정) ======
  async function loadSvgFromFile(file){
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    let svg = doc.documentElement;
    if (svg.tagName.toLowerCase() !== 'svg'){
      svg = doc.querySelector('svg'); // 최후의 보루: 문서 내 첫 번째 <svg>
    }
    if (!svg) throw new Error("유효한 SVG 아님");

    // viewBox 없으면 임시 설정
    if (!svg.getAttribute('viewBox')) {
      const w = parseFloat(svg.getAttribute('width')) || 1000;
      const h = parseFloat(svg.getAttribute('height')) || 800;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
    svg.removeAttribute('width'); svg.removeAttribute('height');

    // 기존 제거 후 부착
    svgHost.innerHTML = "";
    svgHost.appendChild(svg);

    // 전체 요소 bbox로 viewBox 재설정 시도
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
          }catch(_){}
        }
      });
      if (minX < Infinity) {
        const vw = Math.max(1, maxX - minX), vh = Math.max(1, maxY - minY);
        svg.setAttribute('viewBox', `${minX} ${minY} ${vw} ${vh}`);
      }
    } catch(e){ /* ignore */ }

    state.svgEl = svg;
    attachRoomHandlers();
    attachPeopleDropzone();
    setStatus("SVG 로드 완료: 드롭존 인식 중…");
  }

  // 방 이벤트 바인딩
  function attachRoomHandlers(){
    const svg = state.svgEl;
    if(!svg) return;

    const all = svg.querySelectorAll('[id]');
    let count = 0;
    all.forEach(node=>{
      const id  = node.id || "";
      const tag = node.tagName.toLowerCase();
      const isShape = ['rect','path','polygon','polyline','circle','ellipse'].includes(tag);
      if (!isShape) return;
      if (id.toLowerCase().startsWith('bg')) return; // 배경 드롭 금지

      count++;
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

        // 규칙 검사
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

        // 기존 배정 제거(방→방 이동 포함)
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
        setStatus(`배정 완료: ${person.성명} → ${id}`);
      });

      // 클릭 → 설정 패널
      node.addEventListener('click', ()=>{
        const st = ensureRoom(id);
        document.getElementById('p_roomId').value   = id;
        document.getElementById('p_type').value     = st.type || "";
        document.getElementById('p_capacity').value = st.capacity || 1;
        document.getElementById('p_gender').value   = st.gender || "";
        document.getElementById('panelTitle').textContent = `방 설정 (${id})`;
        document.getElementById('roomPanel').hidden = false;
      });
    });

    setStatus(`SVG 로드 완료: 드롭존 ${count}개 인식`);
  }

  // ====== 엑셀 로드 ======
  async function loadExcelFromFile(file){
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheetName = wb.SheetNames.includes("기준변경 반영") ? "기준변경 반영" : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:"" });

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
    .filter(p => Object.keys(TITLE_ORDER).includes(p.직위));

    state.people = people;
    state.assigned.clear();
    state.roomState.forEach(st => st.occupants = []);
    document.querySelectorAll('.occChip').forEach(el=>el.remove());
    renderPeople();
    setStatus(`엑셀 로드 완료: ${people.length}명`);
  }

  // ====== 이벤트 ======
  svgInput.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try {
      await loadSvgFromFile(file);
    } catch(err){
      console.error(err);
      setStatus("SVG 로드 실패: 유효한 SVG인지 확인");
      alert("SVG 로드 실패: 파일을 확인해주세요.");
    }
  });

  xlInput.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try {
      await loadExcelFromFile(file);
    } catch(err){
      console.error(err);
      setStatus("엑셀 로드 실패: 지원 형식(.xlsx/.xlsm/.xls)인지 확인");
      alert("엑셀 로드 실패: 파일을 확인해주세요.");
    }
  });

  resetBtn.addEventListener('click', ()=>{
    state.people = [];
    state.assigned.clear();
    state.roomState.clear();
    peopleBox.innerHTML = "";
    svgHost.innerHTML = '<div class="placeholder">왼쪽의 <b>SVG</b>와 <b>엑셀</b>을 업로드하세요</div>';
    document.getElementById('roomPanel').hidden = true;
    setStatus("초기화 완료");
  });

  // 검색
  searchInp.addEventListener('input', ()=>{
    state.search = searchInp.value || "";
    renderPeople();
  });

  // 패널
  document.getElementById('closePanel').addEventListener('click', ()=> document.getElementById('roomPanel').hidden = true);
  document.getElementById('p_type').addEventListener('change', ()=>{
    const v = document.getElementById('p_type').value;
    const cap = (v==="1인실")?1:(v==="2인실")?2:(v==="3인실")?3:(v==="4인실")?4:(v==="6인실")?6:"";
    if (cap!=="") document.getElementById('p_capacity').value = cap;
  });
  document.getElementById('applyPanel').addEventListener('click', ()=>{
    const id = document.getElementById('p_roomId').value;
    const st = ensureRoom(id);
    st.type = document.getElementById('p_type').value;
    st.capacity = Math.max(1, parseInt(document.getElementById('p_capacity').value || "1", 10));
    st.gender = document.getElementById('p_gender').value;
    alert("적용되었습니다.");
  });
  document.getElementById('clearRoom').addEventListener('click', ()=>{
    const id = document.getElementById('p_roomId').value;
    const st = ensureRoom(id);
    st.occupants.forEach(pid => state.assigned.delete(pid));
    st.occupants = [];
    renderRoom(id);
    renderPeople();
    alert("이 방의 배정을 전부 해제했습니다.");
  });

  // 목록 드롭존(배정 취소) 바인딩
  attachPeopleDropzone();

  // 초기 상태
  setStatus("대기 중… SVG/엑셀을 업로드하세요");
});
