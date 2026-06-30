/**
 * 5-1. ui-render.js
 * 파이어베이스 실시간 데이터 수신 리스너, 메인 보드 화면 사출 및 격자 카드 클릭 액션 총괄 (동기화 엇박자 완벽 교정판)
 */

/* [★중앙 집중형 전역 캐시 메모리 시스템] */
let cachedGameData = null;
let cachedPlayers = null;
let cachedUsers = null;
let cachedAccounts = null;

// 회원가입 관리 패널 독립 뷰 가동 상태 플래그
let isInAdminAccountsView = false;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const db = getDb();
        if (!db) return;

        // [핵심 파이프라인] 실시간 패킷 수신 시 즉각 로컬 캐시를 갱신하고 통합 렌더러를 가동합니다.
        db.ref().on('value', (snapshot) => {
            const rootData = snapshot.val() || {};
            
            // 로컬 캐시 버퍼에 상시 동기화 적재
            cachedGameData = rootData.game || {};
            cachedPlayers = cachedGameData.players || {};
            cachedUsers = rootData.rooms?.users || {};
            cachedAccounts = rootData.accounts || {};
            
            // 데이터베이스의 현재 상태를 전역 타임라인에 동기화
            currentStatus = cachedGameData.status || 'waiting';

            // 통합 UI 렌더러 가동
            window.rerenderAllUI();
        });
    }, 600);
});

// [★버그 원천 차단] 비동기 레이스 컨디션을 박멸하기 위한 통합 UI 렌더링 코어 오케스트레이터
window.rerenderAllUI = function() {
    // 최초 파이어베이스 패킷 수신 전이라면 연산을 유보합니다.
    if (!cachedGameData) return; 

    const status = currentStatus || 'waiting';

    // 1. 교사 전용 독립형 회원 가입 정보 관리 센터 개방 시의 예외 렌더링 가드
    if (isInAdminAccountsView) {
        if (currentUser && currentUser.isAdmin) {
            renderAdminAccountManager(cachedAccounts || {}, 'admin-accounts-table-body-dedicated');
        }
        return;
    }

    // 2. 로그인 유무 및 게임 세션 상태에 따른 대분류 화면 가시성 락 스위칭
    const authView = document.getElementById('auth-view');
    const waitingView = document.getElementById('waiting-view');
    const gameView = document.getElementById('game-view');
    const gameOverView = document.getElementById('game-over-view');

    if (!currentUser) {
        if (authView) authView.style.display = 'block';
        if (waitingView) waitingView.style.display = 'none';
        if (gameView) gameView.style.display = 'none';
        if (gameOverView) gameOverView.style.display = 'none';
        return;
    }

    if (authView) authView.style.display = 'none';
    if (waitingView) waitingView.style.display = (status === 'waiting') ? 'block' : 'none';
    if (gameView) gameView.style.display = (status !== 'waiting' && status !== 'game_over') ? 'block' : 'none';
    if (gameOverView) gameOverView.style.display = (status === 'game_over') ? 'block' : 'none';

    // 3. [대기실 상태 - waiting] 실시간 학생 입장 카드 및 교사 전용 인원 분배 제어탑 강제 렌더링
    if (status === 'waiting') {
        renderWaitingPlayerGrid(cachedUsers || {});
        
        // 로그인 성공 즉시 동기식으로 교사 권한을 검증하여 대기실 설정창을 칼같이 표출시킵니다.
        const setupPanel = document.getElementById('admin-setup-panel');
        if (setupPanel) {
            setupPanel.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
        }
    }

    // 4. [인게임 진행 상태 - day_discuss / night_action] 메인 게임 제어반 및 격자 생존판 드로잉
    if (status !== 'waiting' && status !== 'game_over') {
        renderInGameBoard(cachedGameData, cachedPlayers || {});
    }

    // 5. [최종 게임오버 상태 - game_over] 결과 전광판 정산 화면 드로잉
    if (status === 'game_over') {
        renderGameOverBoard(cachedGameData, cachedPlayers || {});
    }

    // 6. 독립 관리 센터 내부용 테이블 뷰 실시간 바인딩
    if (currentUser && currentUser.isAdmin) {
        renderAdminAccountManager(cachedAccounts || {}, 'admin-accounts-table-body-dedicated');
    }

    // 7. 사망 유령 전용 야간 퀴즈 미션 및 무당 신내림 통신 모듈 바인딩 (ui-ghost-renderer.js)
    if (typeof window.renderGhostUI === 'function') {
        window.renderGhostUI(cachedGameData, cachedPlayers || {});
    }
};

// [auth.js 연동] 로그인 완료 시 레이턴시 없이 즉각 통합 렌더러를 강제 수행시키는 브릿지 함수
window.triggerGameViewTransition = function() {
    window.rerenderAllUI();
};

// 교사 전용 계정 관리 독립 센터 스위칭 라우터
window.toggleAdminAccountsView = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    isInAdminAccountsView = !isInAdminAccountsView;
    if (isInAdminAccountsView) {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'none';
        document.getElementById('game-view').style.display = 'none';
        document.getElementById('game-over-view').style.display = 'none';
        document.getElementById('admin-accounts-view').style.display = 'block';
    } else {
        window.exitAdminAccountsView();
    }
    window.rerenderAllUI();
};

window.exitAdminAccountsView = function() {
    isInAdminAccountsView = false;
    document.getElementById('admin-accounts-view').style.display = 'none';
    window.rerenderAllUI();
    // 복귀 시 완벽한 싱크 동기화를 위해 강제 킥백 신호 송출
    getDb().ref('game/quiz_score').transaction(c => c || 0);
};

// 대기실 실시간 학생 입장 닉네임 카드 및 원격 추방 제어 렌더러
function renderWaitingPlayerGrid(users) {
    const container = document.getElementById('waiting-player-grid');
    if (!container) return;
    container.innerHTML = ''; 

    const entries = Object.entries(users);
    if (entries.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#999; font-size:13px; width:100%; padding:10px;">현재 대기방에 접속 중인 학생이 없습니다.</div>`;
        return;
    }

    entries.forEach(([uid, u]) => {
        if (uid === 'admin_master') return; // 교사 본인 카드는 생성 제외
        
        let kickBtn = (currentUser && currentUser.isAdmin) 
            ? `<button class="btn-danger" style="width:auto; margin:5px 0 0 0; padding:2px 8px; font-size:11px; font-weight:bold; border-radius:4px;" onclick="window.serverKickUser('${uid}')">추방</button>` 
            : '';

        container.innerHTML += `
            <div class="grid-card" style="cursor:default; min-height:65px;">
                <span style="font-size:14px; color:#333;">${u.nickname}</span>
                ${kickBtn}
            </div>
        `;
    });
}

// 가입 학생 원격 제어용 어카운트 테이블 사출기
function renderAdminAccountManager(accounts, containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;
    tbody.innerHTML = '';

    const accountEntries = Object.entries(accounts);
    if (accountEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:#999; padding:15px;">데이터베이스에 등록된 가입 정보가 없습니다.</td></tr>`;
        return;
    }

    accountEntries.forEach(([nick, data]) => {
        tbody.innerHTML += `
            <tr>
                <td><b>${nick}</b></td>
                <td><code style="font-size:14px; color:#c2185b; font-weight:bold;">${data.password}</code></td>
                <td>
                    <button class="secret-reveal-btn btn-info" style="width:auto; margin:0 2px; padding:4px 8px; font-size:12px; display:inline-block;" onclick="window.handleModifyAccount('${nick}')">수정</button>
                    <button class="secret-reveal-btn btn-danger" style="width:auto; margin:0 2px; padding:4px 8px; font-size:12px; display:inline-block;" onclick="window.handleDeleteAccount('${nick}')">삭제</button>
                </td>
            </tr>
        `;
    });
}

// 인게임 전반 보드 정산 오케스트레이터
function renderInGameBoard(gameData, players) {
    const turn = gameData.turn || 1;
    const status = gameData.status || 'day_discuss';
    const voteState = gameData.vote_state || 'none';
    const report = gameData.morning_report || '';

    const roundTitle = document.getElementById('round-title');
    if (roundTitle) {
        roundTitle.innerText = `제 ${turn}회차 - ${status === 'day_discuss' ? '낮 ☀️' : '밤 🌙'}`;
    }

    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.innerText = report;
        statusMsg.className = (status === 'night_action') ? "alert-box night" : "alert-box";
    }

    if (gameData.last_popup_alert_text && gameData.last_popup_alert_text !== 'none') {
        const localCachedAlert = localStorage.getItem('mafia_last_processed_alert');
        if (localCachedAlert !== gameData.last_popup_alert_text) {
            localStorage.setItem('mafia_last_processed_alert', gameData.last_popup_alert_text);
            alert(gameData.last_popup_alert_text);
        }
    }

    if (currentUser && !currentUser.isAdmin) {
        const myData = players[currentUser.id];
        if (myData) {
            currentRole = myData.role || 'none';
            document.getElementById('my-nick-name').innerText = `${myData.nickname}${myData.isAlive ? '' : ' (사망 유령 상태)'}`;
            document.getElementById('my-role-name').innerText = `내 직업: ${roleIcons[myData.role] || ''} ${getRoleKoreanName(myData.role)}`;
        }
    } else if (currentUser && currentUser.isAdmin) {
        document.getElementById('my-nick-name').innerText = "교사(중앙 관제 마스터)";
        document.getElementById('my-role-name').innerText = "실시간 모니터링 모드 가동 중";
    }

    renderLogsAndChronicles(gameData, players);
    renderPlayerGridContainer(gameData, players);
    renderStudentActionPanel(gameData, players);
    renderTeacherControlTower(gameData, players);
}

// 28인 유동 배치 인게임 생존 격자판 사출 엔진
function renderPlayerGridContainer(gameData, players) {
    const gridContainer = document.getElementById('player-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    const myId = currentUser ? currentUser.id : 'none';
    const myData = players[myId] || {};
    const myRole = myData.role || 'none';
    const status = gameData.status || 'day_discuss';
    const voteState = gameData.vote_state || 'none';

    for (let id in players) {
        const p = players[id];
        let cardClasses = ['grid-card'];
        let badgeText = '';
        let loversAppendText = '';

        if (!p.isAlive) cardClasses.push('dead');

        if (status === 'day_discuss' && voteState === 'voting' && myData.dayVote === id) cardClasses.push('my-selected');
        if (status === 'night_action' && myData.nightTarget === id) cardClasses.push('my-selected');
        if (status === 'night_action' && ['citizen', 'lovers', 'soldier', 'assemblyman', 'terrorist'].includes(myRole) && myData.suspect === id) cardClasses.push('my-selected');

        let aiSubText = p.isAiControlled ? `<div style="font-size:10px; color:#ef6c00; font-weight:bold;">(AI로 대체됨)</div>` : "";

        if (currentUser && !currentUser.isAdmin && p.isAlive) {
            if (myRole === 'mafia' && (p.role === 'mafia' || p.role === 'spy')) {
                badgeText = `<span class="badge">${roleIcons[p.role]}</span>`;
            }
            if (myRole === 'spy' && p.role === 'mafia' && gameData.turn > 1) {
                badgeText = `<span class="badge">🔴</span>`; 
            }
            if (myRole === 'lovers' && p.role === 'lovers') {
                loversAppendText = `<span style="font-size:10px; color:#e91e63;">💕연인</span>`;
            }
        }

        gridContainer.innerHTML += `
            <div class="${cardClasses.join(' ')}" onclick="handleGridCardClick('${id}')">
                <span>${p.nickname}</span>
                ${aiSubText}
                ${loversAppendText}
                ${badgeText}
            </div>
        `;
    }
}

window.handleGridCardClick = function(targetUid) {
    if (!currentUser || currentUser.isAdmin) return; 
    
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const status = gameData.status || 'day_discuss';
        const voteState = gameData.vote_state || 'none';
        const lastNightAssault = gameData.last_night_assault || 'none';

        const myId = currentUser.id;
        const myData = players[myId];
        const targetUser = players[targetUid];

        if (!myData || !myData.isAlive) return; 
        if (!targetUser || !targetUser.isAlive) return; 

        const myRole = myData.role || 'citizen';
        const updates = {};

        if (status === 'day_discuss' && voteState === 'voting') {
            if (myId === lastNightAssault) {
                alert("🥊 어젯밤 건달에게 협박당해 오늘 낮 투표권이 박탈된 상태입니다!");
                return;
            }
            updates[`game/players/${myId}/dayVote`] = (myData.dayVote === targetUid) ? "none" : targetUid;
        }
        else if (status === 'night_action') {
            if (['citizen', 'lovers', 'soldier', 'assemblyman', 'terrorist'].includes(myRole)) {
                updates[`game/players/${myId}/suspect`] = (myData.suspect === targetUid) ? "none" : targetUid;
            } else {
                if (myRole === 'mafia' && targetUser.role === 'mafia') {
                    return alert("🚨 동료 마피아를 사살할 수 없습니다! (팀킬 방지 가드)");
                }
                updates[`game/players/${myId}/nightTarget`] = (myData.nightTarget === targetUid) ? "none" : targetUid;
            }
        }

        if (Object.keys(updates).length > 0) getDb().ref().update(updates);
    });
};

function renderStudentActionPanel(gameData, players) {
    const panel = document.getElementById('student-vote-panel');
    const actionArea = document.getElementById('vote-action-area');
    const resultText = document.getElementById('trial-submit-result-text');
    const title = document.getElementById('vote-panel-title');
    const desc = document.getElementById('vote-panel-desc');

    if (!panel) return;

    const myId = currentUser ? currentUser.id : '';
    const myData = players[myId];
    const voteState = gameData.vote_state || 'none';
    const targetOnTrial = gameData.target_on_trial || 'none';

    if (!myData || !myData.isAlive || voteState === 'none') {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';

    if (voteState === 'voting') {
        title.innerText = "🗳️ 낮 의심자 지목 투표 시간";
        desc.innerText = "위 생존 현황 격자판에서 마피아로 의심되는 친구의 카드를 터치해 주세요.";
        actionArea.style.display = 'none';
    } 
    else if (voteState === 'execution_trial' && targetOnTrial !== 'none') {
        const suspectedNick = players[targetOnTrial]?.nickname || '미상';
        title.innerText = `⚖️ 사형대 재판: [${suspectedNick}] 최종 판결`;
        desc.innerText = `현재 사형대에 소환된 [${suspectedNick}] 학생을 처형할지, 무죄 방면하여 부활시킬지 최종 서명해 주세요.`;
        actionArea.style.display = 'block';

        const myDecision = myData.trialDecision || 'none';
        if (myDecision !== 'none') {
            resultText.style.display = 'block';
            resultText.innerText = `➔ 내 판결 판정 서명: [${myDecision === 'execute' ? '💀 최종 처형 찬성' : '😇 최종 부활 반대'}] 제출 완료.`;
        } else {
            resultText.style.display = 'none';
        }
    }
}

window.submitTrialDecision = function(decision) {
    if (!currentUser) return;
    getDb().ref(`game/players/${currentUser.id}`).update({
        trialDecision: decision
    }).then(() => console.log(`재판 찬반 표결 완료 -> ${decision}`));
};

function renderLogsAndChronicles(gameData, players) {
    const logBox = document.getElementById('my-personal-log-box');
    const logList = document.getElementById('personal-log-list');
    const historyList = document.getElementById('history-log-list');

    if (logBox && logList && currentUser && !currentUser.isAdmin) {
        const myData = players[currentUser.id] || {};
        const logContent = myData.personalLog || 'none';

        if (['mafia', 'spy', 'police', 'detective', 'mudang'].includes(myData.role) && logContent !== 'none') {
            logBox.style.display = 'block';
            logList.innerHTML = logContent.split('\n').map(line => `<div>${line}</div>`).join('');
            logList.scrollTop = logList.scrollHeight; 
        } else {
            logBox.style.display = 'none';
        }
    } else if (logBox) {
        logBox.style.display = 'none';
    }

    if (historyList) {
        const logs = gameData.history_logs || [];
        historyList.innerHTML = logs.map(line => `<div>${line}</div>`).join('');
        historyList.scrollTop = historyList.scrollHeight;
    }
}

function renderTeacherControlTower(gameData, players) {
    const adminPanel = document.getElementById('admin-game-controls');
    if (!adminPanel) return;

    if (!currentUser || !currentUser.isAdmin) {
        adminPanel.style.display = 'none';
        return;
    }

    adminPanel.style.display = 'block';

    const status = gameData.status || 'day_discuss';
    const voteState = gameData.vote_state || 'none';

    document.getElementById('admin-start-vote-btn').style.display = (status === 'day_discuss' && voteState === 'none') ? 'block' : 'none';
    document.getElementById('admin-finish-vote-btn').style.display = (status === 'day_discuss' && voteState === 'voting') ? 'block' : 'none';
    document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';
    
    const stageBtn = document.getElementById('next-stage-btn');
    stageBtn.style.display = (voteState === 'none') ? 'block' : 'none';
    stageBtn.innerText = (status === 'day_discuss') ? "🌙 교사 강제 밤 전환" : "☀️ 교사 밤 행동 마감 및 아침 개시";

    const monitorSec = document.getElementById('admin-secret-monitor');
    const tbody = document.getElementById('admin-live-roles-table');
    
    if (monitorSec && tbody) {
        monitorSec.style.display = 'block';
        tbody.innerHTML = ''; 

        Object.entries(players).forEach(([uid, p]) => {
            const trClass = p.isAlive ? "" : "monitor-dead";
            const liveStatusText = p.isAlive ? "🟢 생존" : "💀 사망유령";
            
            const isRevealed = adminRevealMap[uid] || false;
            const displayedRole = isRevealed ? `${roleIcons[p.role]} ${getRoleKoreanName(p.role)}` : "🙈 가림막 보호 중";
            const btnText = isRevealed ? "다시 숨기기" : "직업 보기";

            tbody.innerHTML += `
                <tr class="${trClass}">
                    <td><b>${liveStatusText}</b></td>
                    <td>${p.nickname}</td>
                    <td>
                        <span style="margin-right:8px;">${displayedRole}</span>
                        <button class="secret-reveal-btn btn-info" style="width:auto; margin:0;" onclick="window.toggleAdminRevealSecret('${uid}')">${btnText}</button>
                    </td>
                </tr>
            `;
        });
    }
}

function renderGameOverBoard(gameData, players) {
    const wTitle = document.getElementById('winner-title');
    const fReport = document.getElementById('final-report');
    const fMafia = document.getElementById('final-mafia-list');
    const fCitizen = document.getElementById('final-citizen-list');

    const winner = gameData.winner || 'continue';

    if (wTitle) {
        if (winner === 'mafia_win') {
            wTitle.innerText = "🎉 마피아 진영의 완벽한 승리! 🔴";
            wTitle.style.color = "#b71c1c";
        } else {
            wTitle.innerText = "🎉 시민 과학 탐정단의 대승리! ⚪";
            wTitle.style.color = "#2e7d32";
        }
    }

    if (fReport) fReport.innerText = gameData.morning_report || '최종 라운드 정산 완료.';

    if (fMafia && fCitizen) {
        fMafia.innerHTML = ''; fCitizen.innerHTML = '';

        Object.entries(players).forEach(([uid, p]) => {
            const cardHtml = `
                <div class="role-character-card">
                    <div class="char-icon">${roleIcons[p.role] || "⚪"}</div>
                    <div class="char-nick">${p.nickname}</div>
                    <div class="char-role">${getRoleKoreanName(p.role)}</div>
                    <span class="char-status-badge ${p.isAlive ? 'alive' : 'dead'}">${p.isAlive ? '생존' : '사망'}</span>
                </div>
            `;
            if (p.role === 'mafia' || p.role === 'spy') {
                fMafia.innerHTML += cardHtml;
            } else {
                fCitizen.innerHTML += cardHtml;
            }
        });
    }

    const adminReset = document.getElementById('admin-reset-controls');
    if (adminReset) {
        adminReset.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
    }
}

function getRoleKoreanName(role) {
    const dict = {
        mafia: "마피아", citizen: "선량한 시민", spy: "스파이", detective: "사립탐정",
        mudang: "신내림 무당", police: "열혈경찰", doctor: "명의사", soldier: "강철군인",
        assemblyman: "국회의원", terrorist: "테러리스트", gangster: "뒷골목 건달", lovers: "사랑꾼 연인"
    };
    return dict[role] || "시민 요원";
}