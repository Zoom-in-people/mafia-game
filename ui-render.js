/**
 * 5-1. ui-render.js
 * 파이어베이스 실시간 데이터 수신 리스너, 메인 보드 화면 사출 및 격자 카드 클릭 액션 총괄 (커스텀 알럿 모달 이식판)
 */

/* [중앙 집중형 전역 캐시 메모리 시스템] */
let cachedGameData = null;
let cachedPlayers = null;
let cachedUsers = null;
let cachedAccounts = null;

let isInAdminAccountsView = false;

/**
 * 영문 역할 이름을 한국어 이름으로 변환하는 함수
 * @param {string} role - 영문 역할명 (예: 'mafia', 'doctor')
 * @returns {string} - 변환된 한국어 역할명
 */
function getRoleKoreanName(role) {
    if (!role) return '알 수 없음';
    
    // 대소문자나 공백으로 인한 오류를 방지하기 위해 정제
    const cleanRole = role.toLowerCase().trim();
    
    // 게임에서 사용하는 역할 목록에 맞추어 수정 가능합니다.
    // [★오류 교정] 실제 게임 데이터(role 값)와 일치하지 않던 매핑을 전면 정정했습니다.
    // (예: 'detective'가 '경찰'로 잘못 매핑되어 있었고, spy/mudang/police 등 다수 직업이 누락되어 있었습니다.)
    const roleMap = {
        'mafia': '마피아',
        'citizen': '시민',
        'spy': '스파이',
        'detective': '사립탐정',
        'mudang': '무당',
        'police': '경찰',
        'doctor': '의사',
        'soldier': '군인',
        'assemblyman': '국회의원',
        'terrorist': '테러리스트',
        'gangster': '건달',
        'lovers': '연인'
    };
    
    // 매핑된 한국어 이름이 없으면 원래 들어온 값을 그대로 반환
    return roleMap[cleanRole] || role;
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const db = getDb();
        if (!db) return;

        db.ref().on('value', (snapshot) => {
            const rootData = snapshot.val() || {};
            
            cachedGameData = rootData.game || {};
            cachedPlayers = cachedGameData.players || {};
            cachedUsers = rootData.rooms?.users || {};
            cachedAccounts = rootData.accounts || {};
            
            currentStatus = cachedGameData.status || 'waiting';

            window.rerenderAllUI();
        });
    }, 600);
});

// [★기능 신설] 아침/밤 투표 및 사망 알람을 띄워줄 전광판 모달 제어 함수
window.showCustomAlertModal = function(text) {
    const modal = document.getElementById('custom-alert-modal');
    const body = document.getElementById('custom-alert-modal-body');
    if (modal && body) {
        body.innerText = text;
        modal.style.display = 'flex';
    }
};

window.closeCustomAlertModal = function() {
    const modal = document.getElementById('custom-alert-modal');
    if (modal) modal.style.display = 'none';
};

window.rerenderAllUI = function() {
    if (!cachedGameData) return; 

    const status = currentStatus || 'waiting';

    if (isInAdminAccountsView) {
        if (currentUser && currentUser.isAdmin) {
            renderAdminAccountManager(cachedAccounts || {}, 'admin-accounts-table-body-dedicated');
        }
        return;
    }

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

    if (status === 'waiting') {
        renderWaitingPlayerGrid(cachedUsers || {});
        
        const setupPanel = document.getElementById('admin-setup-panel');
        if (setupPanel) {
            setupPanel.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
        }
    }

    if (status !== 'waiting' && status !== 'game_over') {
        renderInGameBoard(cachedGameData, cachedPlayers || {});
    }

    if (status === 'game_over') {
        renderGameOverBoard(cachedGameData, cachedPlayers || {});
    }

    if (currentUser && currentUser.isAdmin) {
        renderAdminAccountManager(cachedAccounts || {}, 'admin-accounts-table-body-dedicated');
    }

    if (typeof window.renderGhostUI === 'function') {
        window.renderGhostUI(cachedGameData, cachedPlayers || {});
    }
};

window.triggerGameViewTransition = function() {
    window.rerenderAllUI();
};

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
    getDb().ref('game/quiz_score').transaction(c => c || 0);
};

// [★오류 교정 - 신규 추가] 교사용 "실시간 학생 직업 일람표"의 "직업 보기/다시 숨기기" 버튼이
// 호출하던 toggleAdminRevealSecret 함수가 누락되어 있어 클릭 시 ReferenceError가 발생하던 문제를 해결합니다.
// adminRevealMap(config.js에 선언됨)의 해당 uid 값을 토글하고 즉시 재렌더링합니다.
window.toggleAdminRevealSecret = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    adminRevealMap[uid] = !adminRevealMap[uid];
    window.rerenderAllUI();
};

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
        if (uid === 'admin_master') return; 
        
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

    // [★오류 교정] 기존에는 알림 '문구 내용'을 그대로 localStorage 키로 비교했습니다.
    // 문제는 "밤사이에 평화로운 정적만이 흘렀습니다", "현재 1회차 재투표 진행"처럼
    // 회차와 무관하게 동일한 문구가 반복되는 경우가 많다는 점입니다.
    // 어떤 학생은 그 문구를 이전 라운드에 이미 한 번 봐서 localStorage에 캐시되어 있고,
    // 어떤 학생은 아직 본 적이 없어서 — 같은 사건인데도 사람마다 팝업이 뜨거나 안 뜨는 문제가 발생했습니다.
    // 그래서 문구 대신, 각 알림이 발생할 때마다 서버에서 새로 발급되는 고유 타임스탬프(last_popup_alert_id)로
    // "이미 본 알림인지"를 판단하도록 수정했습니다. 텍스트가 같아도 이벤트(타임스탬프)는 항상 다르므로
    // 모든 학생에게 100% 동일하게 표시됩니다.
    if (gameData.last_popup_alert_text && gameData.last_popup_alert_text !== 'none') {
        const popupEventId = String(gameData.last_popup_alert_id || gameData.last_popup_alert_text);
        const localCachedAlertId = localStorage.getItem('mafia_last_processed_alert_id');
        if (localCachedAlertId !== popupEventId) {
            localStorage.setItem('mafia_last_processed_alert_id', popupEventId);
            window.showCustomAlertModal(gameData.last_popup_alert_text);
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
            if (myRole === 'mafia' && p.role === 'mafia') {
                badgeText = `<span class="badge">${roleIcons[p.role]}</span>`;
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

// [★오류 교정 - 신규 추가] 게임 종료 화면 렌더 함수가 통째로 누락되어 있었습니다.
// window.rerenderAllUI()에서 status === 'game_over'일 때 이 함수를 호출하지만 정의가 없어
// 게임이 끝나는 즉시 ReferenceError가 발생, 그 이후 모든 실시간 화면 갱신이 멈추는
// (승리 진영/명단 미표시, 교사용 리셋 버튼 영구 비노출) 치명적 버그를 일으키고 있었습니다.
// style.css에 이미 준비되어 있던 .character-pool / .role-character-card 등 디자인을 그대로 활용합니다.
function renderGameOverBoard(gameData, players) {
    const winnerTitle = document.getElementById('winner-title');
    const finalReport = document.getElementById('final-report');
    const mafiaList = document.getElementById('final-mafia-list');
    const citizenList = document.getElementById('final-citizen-list');
    const resetControls = document.getElementById('admin-reset-controls');

    if (!winnerTitle || !finalReport || !mafiaList || !citizenList) return;

    const winner = gameData.winner || 'none';

    if (winner === 'mafia_win') {
        winnerTitle.innerText = "🔴 마피아 진영 최종 승리! 🔴";
    } else if (winner === 'citizen_win') {
        winnerTitle.innerText = "⚪ 시민 연합군 최종 승리! ⚪";
    } else {
        winnerTitle.innerText = "🎉 게임 종료 🎉";
    }

    finalReport.innerText = gameData.morning_report || '';

    mafiaList.innerHTML = '';
    citizenList.innerHTML = '';

    Object.entries(players).forEach(([uid, p]) => {
        // game-mechanics.js / phase-day-vote.js와 동일한 기준: 마피아와 스파이를 마피아 진영으로 분류
        const isMafiaSide = (p.role === 'mafia' || p.role === 'spy');
        const icon = roleIcons[p.role] || '❓';
        const statusText = p.isAlive ? '생존' : '사망';
        const statusClass = p.isAlive ? 'alive' : 'dead';

        const cardHtml = `
            <div class="role-character-card">
                <div class="char-icon">${icon}</div>
                <div class="char-nick">${p.nickname}</div>
                <div class="char-role">${getRoleKoreanName(p.role)}</div>
                <span class="char-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;

        if (isMafiaSide) {
            mafiaList.innerHTML += cardHtml;
        } else {
            citizenList.innerHTML += cardHtml;
        }
    });

    // 대기실 복구 버튼은 교사 계정에게만 노출
    if (resetControls) {
        resetControls.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
    }
}