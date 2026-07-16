/**
 * 5-2. ui-ghost-renderer.js
 * 사망 유령 전용 화면 렌더러: 무당 영매 지목 대상 진영 감별 투표 + 지뢰찾기 미니게임
 * [★수정] 기존 학업(과학 퀴즈) 콘텐츠를 전부 제거하고, 유령 전용 지뢰찾기 미니게임으로 교체했습니다.
 * 미니게임을 클리어하면 살아있는 사람 중 무작위 1명의 직업을 그 유령의 화면에만 알려줍니다.
 * (서버에 저장하지 않고 이 브라우저 세션에만 보관되므로, 다른 사람은 절대 볼 수 없습니다.)
 */

// 유령 화면 인터페이스 허브 함수 (ui-render.js의 실시간 메인 리스너 내부에서 매번 호출됨)
window.renderGhostUI = function(gameData, players) {
    const ghostSection = document.getElementById('ghost-quiz-section');
    if (!ghostSection) return;

    // 1. 로그인 안 했거나 관리자(교사) 계정인 경우 유령방 미션 판넬 숨김
    if (!currentUser || currentUser.isAdmin) {
        ghostSection.style.display = 'none';
        return;
    }

    const myId = currentUser.id;
    const myData = players[myId];

    // 2. 현재 내가 살아있는 생존자라면 유령방 패널을 철저히 숨기고 즉시 종료
    if (!myData || myData.isAlive) {
        ghostSection.style.display = 'none';
        return;
    }

    // 3. [유령 상태 확정] 유령 패널 시각화 활성화
    ghostSection.style.display = 'block';

    const gameStatus = gameData.status || 'day_discuss';
    const shamanTargetUid = gameData.shaman_target_uid || 'none';

    const quizQuestionEl = document.getElementById('quiz-question');
    const quizOptionsEl  = document.getElementById('quiz-options');
    const minigameWrap   = document.getElementById('ghost-minigame-wrap');

    // -----------------------------------------------------------------
    // [분기 A] 낮 시간 토론 중이고 + 어젯밤 무당이 지목한 영매 타겟이 존재할 때
    // ➡️ 유령 전용 무당 지목 대상 '진영 감별 투표소'로 화면 강제 전환
    // -----------------------------------------------------------------
    if (gameStatus === 'day_discuss' && shamanTargetUid !== 'none' && players[shamanTargetUid]) {
        const targetUser = players[shamanTargetUid];
        const ghostVotes = gameData.shaman_ghost_votes || {};
        const myVoteSide = ghostVotes[myId] || 'none';

        // 미니게임 영역 숨기고 무당 투표 영역만 노출
        if (minigameWrap) minigameWrap.style.display = 'none';
        quizQuestionEl.style.display = 'block';
        quizOptionsEl.style.display = 'block';

        document.getElementById('ghost-mission-title').innerHTML = "🔮 [유령방 영매 통신] 무당의 영혼 감별 요청";

        const questionText = `⚠️ 어젯밤 무당이 [${targetUser.nickname}] 학생을 신내림 타겟으로 지목했습니다!\n\n먼저 사망한 유령들의 직관과 로그 기록을 모아주세요.\n[${targetUser.nickname}] 학생의 진짜 배정 진영은 어디입니까?`;
        quizQuestionEl.innerText = questionText;

        quizOptionsEl.innerHTML = ''; // 중복 쌓임 청소

        // 버튼 1: 시민 진영 투표 버튼
        const btnCitizen = document.createElement('button');
        btnCitizen.innerText = "⚪ 선량한 시민 편이다";
        btnCitizen.style.margin = "5px 0";
        if (myVoteSide === 'citizen_side') {
            btnCitizen.className = "my-selected";
            btnCitizen.style.backgroundColor = "#1e88e5";
        } else {
            btnCitizen.style.backgroundColor = "#90caf9";
        }
        btnCitizen.onclick = () => submitGhostShamanVote(myId, 'citizen_side');

        // 버튼 2: 마피아 진영 투표 버튼
        const btnMafia = document.createElement('button');
        btnMafia.innerText = "🔴 음흉한 마피아 편이다";
        btnMafia.style.margin = "5px 0";
        if (myVoteSide === 'mafia_side') {
            btnMafia.className = "my-selected";
            btnMafia.style.backgroundColor = "#e53935";
        } else {
            btnMafia.style.backgroundColor = "#ef9a9a";
        }
        btnMafia.onclick = () => submitGhostShamanVote(myId, 'mafia_side');

        quizOptionsEl.appendChild(btnCitizen);
        quizOptionsEl.appendChild(btnMafia);
        return;
    }

    // -----------------------------------------------------------------
    // [분기 B] 밤 시간이거나 + 낮이더라도 무당의 지목 타겟이 없을 때
    // ➡️ 유령 전용 '지뢰찾기 미니게임'으로 전환 (기존 학업 퀴즈 대체)
    // -----------------------------------------------------------------
    document.getElementById('ghost-mission-title').innerHTML = "💣 [유령 미니게임] 지뢰찾기로 정체 엿보기";
    quizQuestionEl.style.display = 'none';
    quizOptionsEl.style.display = 'none';
    quizOptionsEl.innerHTML = '';
    if (minigameWrap) minigameWrap.style.display = 'block';

    // 아직 이번 세션에서 지뢰찾기를 시작한 적이 없다면 자동으로 새 게임판을 만들어줌
    if (!window._ghostMS) {
        window._msNewGame();
    } else {
        _msRender();
    }
    _msRenderRevealLog();
};

function submitGhostShamanVote(myUid, side) {
    getDb().ref(`game/shaman_ghost_votes/${myUid}`).set(side).then(() => {
        console.log(`🔮 [영매 제보] 무당 타겟 투표 완료 -> ${side}`);
    }).catch(err => console.error("유령 투표 전송 오류:", err));
}

// ═══════════════════════════════════════════════════════════════════
// [★신규] 유령 전용 지뢰찾기 미니게임
// - 6x6 보드, 지뢰 6개
// - 클리어(지뢰 제외 모든 칸 열기) 시 살아있는 사람 중 무작위 1명의 직업을 공개
// - 오직 이 브라우저(이 유령)만 볼 수 있도록 서버(Firebase)에는 절대 저장하지 않고,
//   순수 로컬 JS 변수(window._ghostMS, window._ghostRevealLog)에만 보관합니다.
// ═══════════════════════════════════════════════════════════════════

const MS_SIZE  = 6;
const MS_MINES = 6;

window._ghostMS = null;         // { mines: Set<index>, revealed: Set<index>, exploded: bool, won: bool }
window._ghostRevealLog = [];    // 이번 세션에서 지금까지 엿본 직업 목록 (이 브라우저에만 존재)

function _msGenerateMines() {
    const totalCells = MS_SIZE * MS_SIZE;
    const mineSet = new Set();
    while (mineSet.size < MS_MINES) {
        mineSet.add(Math.floor(Math.random() * totalCells));
    }
    return mineSet;
}

function _msCountAdjacentMines(mineSet, idx) {
    const row = Math.floor(idx / MS_SIZE);
    const col = idx % MS_SIZE;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < MS_SIZE && nc >= 0 && nc < MS_SIZE) {
                if (mineSet.has(nr * MS_SIZE + nc)) count++;
            }
        }
    }
    return count;
}

// 새 지뢰찾기 게임판 생성
window._msNewGame = function() {
    window._ghostMS = {
        mines: _msGenerateMines(),
        revealed: new Set(),
        exploded: false,
        won: false
    };
    _msRender();
};

// 칸 클릭
window._msClickCell = function(idx) {
    const state = window._ghostMS;
    if (!state || state.exploded || state.won) return;
    if (state.revealed.has(idx)) return;

    state.revealed.add(idx);

    if (state.mines.has(idx)) {
        state.exploded = true;
    } else {
        const totalCells = MS_SIZE * MS_SIZE;
        const nonMineCells = totalCells - state.mines.size;
        if (state.revealed.size >= nonMineCells) {
            state.won = true;
            _msHandleWin();
        }
    }
    _msRender();
};

// 클리어 성공 시 - 살아있는 사람 중 무작위 1명의 직업을 이 유령에게만 알려줌
function _msHandleWin() {
    const alivePlayers = Object.entries(cachedPlayers || {}).filter(([id, p]) => p.isAlive);
    if (alivePlayers.length === 0) return;

    const [randId, randPlayer] = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    const roleName = getRoleKoreanName(randPlayer.role);

    window._ghostRevealLog.unshift(`🔎 [${randPlayer.nickname}]의 정체는 '${roleName}' 입니다!`);
    if (window._ghostRevealLog.length > 20) window._ghostRevealLog.length = 20; // 너무 길어지지 않게 제한

    alert(`🎉 지뢰찾기 클리어!\n영혼의 힘으로 한 사람의 정체를 엿보았습니다.\n\n[${randPlayer.nickname}] → ${roleName}\n\n(이 정보는 당신에게만 보이며, 다른 사람은 절대 알 수 없습니다.)`);
}

// 보드 렌더링
function _msRender() {
    const container = document.getElementById('ghost-minigame-board');
    if (!container) return;
    const state = window._ghostMS;
    if (!state) return;

    let html = `<div style="display:grid; grid-template-columns:repeat(${MS_SIZE}, 1fr); gap:4px; max-width:270px; margin:0 auto;">`;

    for (let i = 0; i < MS_SIZE * MS_SIZE; i++) {
        const isRevealed = state.revealed.has(i);
        const isMine = state.mines.has(i);
        let cellContent = '';
        let bg = '#cfd8dc';

        if (isRevealed) {
            if (isMine) {
                cellContent = '💣';
                bg = '#ef5350';
            } else {
                const count = _msCountAdjacentMines(state.mines, i);
                cellContent = count > 0 ? count : '';
                bg = '#eceff1';
            }
        } else if (state.exploded && isMine) {
            // 게임오버 시 나머지 지뢰 위치도 함께 공개
            cellContent = '💣';
            bg = '#ffcdd2';
        }

        const clickable = (!state.exploded && !state.won && !isRevealed);
        html += `<div ${clickable ? `onclick="window._msClickCell(${i})"` : ''} style="aspect-ratio:1; display:flex; align-items:center; justify-content:center; background:${bg}; border-radius:5px; font-weight:bold; font-size:14px; cursor:${clickable ? 'pointer' : 'default'}; user-select:none; border:1px solid #b0bec5;">${cellContent}</div>`;
    }

    html += `</div>`;

    if (state.exploded) {
        html += `<div style="text-align:center; margin-top:8px; color:#c62828; font-weight:bold;">💥 지뢰를 밟았습니다! '🎲 새 게임 시작' 버튼으로 다시 도전해보세요.</div>`;
    } else if (state.won) {
        html += `<div style="text-align:center; margin-top:8px; color:#2e7d32; font-weight:bold;">🎉 클리어! 정체 하나를 엿봤어요. 더 해보려면 '🎲 새 게임 시작'을 눌러주세요.</div>`;
    }

    container.innerHTML = html;
}

// 지금까지 엿본 직업 로그 렌더링
function _msRenderRevealLog() {
    const logBox = document.getElementById('ghost-reveal-log');
    if (!logBox) return;

    if (window._ghostRevealLog.length === 0) {
        logBox.style.display = 'none';
        return;
    }

    logBox.style.display = 'block';
    logBox.innerHTML = `<b>📓 지금까지 엿본 정체:</b><br>` + window._ghostRevealLog.map(line => `<div>${line}</div>`).join('');
}