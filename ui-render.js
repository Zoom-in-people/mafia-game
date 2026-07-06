/**
 * 5-1. ui-render.js
 * 파이어베이스 실시간 데이터 수신 리스너, 메인 보드 화면 사출 및 격자 카드 클릭 액션 총괄
 * [★신규] 마피아 전용 비밀 채팅방 + 전원 참여 익명 채팅방 (5회 제한) 추가
 */

/* [중앙 집중형 전역 캐시 메모리 시스템] */
let cachedGameData = null;
let cachedPlayers = null;
let cachedUsers = null;
let cachedAccounts = null;

let isInAdminAccountsView = false;

function getRoleKoreanName(role) {
    if (!role) return '알 수 없음';
    const cleanRole = role.toLowerCase().trim();
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
        'lovers': '연인',
        'reporter': '기자'
    };
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

// [★신규] 팝업 큐 처리 상태 (한 번에 하나씩만 순서대로 보여주기 위한 로컬 상태)
window._popupQueue = [];        // 아직 안 보여준 이벤트 키 목록 (시간순 정렬됨)
window._popupQueueBusy = false; // 현재 모달이 떠 있는 중인지 여부

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
    // [★신규] 큐에 밀린 다음 알림이 있으면 살짝 텀을 두고 이어서 보여줌
    window._popupQueueBusy = false;
    setTimeout(() => window._processPopupQueueNext(), 350);
};

// [★신규] 큐에서 다음 알림 하나를 꺼내 보여줌 (이미 하나가 떠 있으면 대기)
window._processPopupQueueNext = function() {
    if (window._popupQueueBusy) return;
    if (window._popupQueue.length === 0) return;

    const nextKey = window._popupQueue.shift();
    const events = (cachedGameData && cachedGameData.popup_events) || {};
    const eventData = events[nextKey];

    // 이미 지워졌거나 유효하지 않은 항목이면 표시한 것으로 치고 다음 것으로 넘어감
    if (!eventData || !eventData.text) {
        localStorage.setItem('mafia_last_shown_popup_key', nextKey);
        return window._processPopupQueueNext();
    }

    window._popupQueueBusy = true;
    localStorage.setItem('mafia_last_shown_popup_key', nextKey);
    window.showCustomAlertModal(eventData.text);
};

// [★신규] Firebase에 새로 쌓인 알림 이벤트를 확인해서 큐에 추가
// Firebase push() 키는 시간순으로 문자열 정렬이 가능하도록 설계되어 있어서,
// "마지막으로 본 키보다 사전순으로 큰 키"만 골라내면 정확히 "아직 못 본 알림"이 됩니다.
function checkAndQueueNewPopups() {
    if (!currentUser) return;
    const events = (cachedGameData && cachedGameData.popup_events) || {};
    const allKeys = Object.keys(events).sort();
    if (allKeys.length === 0) return;

    const lastShownKey = localStorage.getItem('mafia_last_shown_popup_key') || '';
    const newKeys = allKeys.filter(k => k > lastShownKey && !window._popupQueue.includes(k));

    if (newKeys.length > 0) {
        window._popupQueue.push(...newKeys);
        window._processPopupQueueNext();
    }
}

window.rerenderAllUI = function() {
    if (!cachedGameData) return;

    const status = currentStatus || 'waiting';

    // [★핵심 오류 교정 - 큐 시스템으로 재교체]
    // 기존엔 game/last_popup_alert_text 단일 값을 덮어쓰는 방식이라, 학생 기기가
    // 순간적으로 연결이 불안정하거나 백그라운드에 있는 사이 이벤트가 연달아 발생하면
    // 이전 알림이 사라지고 최신 알림에만 덮어써져 일부 학생에게 알림이 누락되는 문제가 있었습니다.
    // (게다가 game_over 전환 직후 팝업이 스킵되던 문제도 있었습니다.)
    // 이제는 game/popup_events 큐에 쌓인 이벤트 중 "내가 아직 못 본 것"을 전부 확인해서
    // 순서대로 하나씩 보여주므로, 화면 상태나 접속 상태와 무관하게 모든 학생이
    // 언젠가는 반드시 모든 알림을 (순서대로) 받아보게 됩니다.
    checkAndQueueNewPopups();

    if (isInAdminAccountsView) {
        if (currentUser && currentUser.isAdmin) {
            renderAdminAccountManager(cachedAccounts || {}, 'admin-accounts-table-body-dedicated');
        }
        return;
    }

    const authView     = document.getElementById('auth-view');
    const waitingView  = document.getElementById('waiting-view');
    const gameView     = document.getElementById('game-view');
    const gameOverView = document.getElementById('game-over-view');

    if (!currentUser) {
        if (authView)     authView.style.display     = 'block';
        if (waitingView)  waitingView.style.display  = 'none';
        if (gameView)     gameView.style.display     = 'none';
        if (gameOverView) gameOverView.style.display = 'none';
        return;
    }

    if (authView)     authView.style.display     = 'none';
    if (waitingView)  waitingView.style.display  = (status === 'waiting') ? 'block' : 'none';
    if (gameView)     gameView.style.display     = (status !== 'waiting' && status !== 'game_over') ? 'block' : 'none';
    if (gameOverView) gameOverView.style.display = (status === 'game_over') ? 'block' : 'none';

    // [★신규] 추방 감지: 대기실에서 내 UID가 rooms/users에서 사라지면 추방된 것
    // _userConfirmedInRoom 플래그로 로그인 직후 Firebase 데이터가 아직 도착하지 않은
    // 타이밍 문제로 인한 오작동을 방지합니다.
    if (status === 'waiting' && currentUser && !currentUser.isAdmin) {
        if (cachedUsers && cachedUsers[currentUser.id]) {
            window._userConfirmedInRoom = true; // 내가 방에 있음이 서버로 확인됨
        }
        if (window._userConfirmedInRoom && cachedUsers && !cachedUsers[currentUser.id]) {
            // 한 번은 확인됐는데 지금 없음 → 추방됨
            window._userConfirmedInRoom = false;
            alert('🚪 교사에 의해 대기실에서 추방되었습니다.');
            clearSession();
            return;
        }
    }

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

window.toggleAdminRevealSecret = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    adminRevealMap[uid] = !adminRevealMap[uid];
    window.rerenderAllUI();
};

// ─────────────────────────────────────────────────────────────────────
// [★신규] 밤 채팅방 렌더 및 전송 함수
// ─────────────────────────────────────────────────────────────────────

/**
 * 마피아 채팅 + 익명 채팅을 화면에 표시/숨김 처리하고 메시지를 렌더합니다.
 * renderInGameBoard() 마지막에 호출됩니다.
 */
function renderNightChats(gameData, players) {
    const status = gameData.status || 'day_discuss';
    const isNight = (status === 'night_action');

    const myId   = currentUser ? currentUser.id : null;
    const myData = (myId && players[myId]) ? players[myId] : null;
    const myRole = myData ? (myData.role || 'citizen') : 'citizen';
    const isAdmin = currentUser && currentUser.isAdmin;
    const isAlive = myData ? myData.isAlive : false;

    // ── 마피아 전용 채팅 ──────────────────────────────────────────
    const mafiaSection = document.getElementById('mafia-chat-section');
    const mafiaMessages = document.getElementById('mafia-chat-messages');

    // [★수정] 마피아 본인만 볼 수 있음 - 교사도 볼 수 없어 비밀 대화가 보장됨
    const canSeeMafia = isNight && myRole === 'mafia' && !isAdmin;
    if (mafiaSection) mafiaSection.style.display = canSeeMafia ? 'block' : 'none';

    if (canSeeMafia && mafiaMessages) {
        const rawMafia = gameData.night_chats?.mafia || {};
        const mafiaList = Object.values(rawMafia).sort((a, b) => (a.ts || 0) - (b.ts || 0));

        if (mafiaList.length === 0) {
            mafiaMessages.innerHTML = '<div class="chat-no-msg">아직 마피아 채팅이 없습니다.</div>';
        } else {
            mafiaMessages.innerHTML = mafiaList.map(msg => {
                const isMine = (msg.uid === myId);
                return `<div class="chat-msg${isMine ? ' mine' : ''}">
                    <span class="chat-sender">${msg.nick || '?'}:</span>${msg.text || ''}
                </div>`;
            }).join('');
        }
        mafiaMessages.scrollTop = mafiaMessages.scrollHeight;

        // 마피아 본인 아니면 입력창 숨김 (교사는 관찰만)
        const inputRow = document.getElementById('mafia-chat-input-row');
        if (inputRow) {
            inputRow.style.display = (myRole === 'mafia' && isAlive && !isAdmin) ? 'flex' : 'none';
        }
    }

    // ── 익명 채팅 ────────────────────────────────────────────────
    const anonSection = document.getElementById('anon-chat-section');
    const anonMessages = document.getElementById('anon-chat-messages');
    const anonRemaining = document.getElementById('anon-chat-remaining');
    const anonSendBtn = document.getElementById('anon-chat-send-btn');
    const anonInput = document.getElementById('anon-chat-input');

    // 밤에만 노출, 교사 포함 전원 볼 수 있음
    if (anonSection) anonSection.style.display = isNight ? 'block' : 'none';

    if (isNight && anonMessages) {
        const rawAnon = gameData.night_chats?.anon || {};
        const anonList = Object.values(rawAnon).sort((a, b) => (a.ts || 0) - (b.ts || 0));

        if (anonList.length === 0) {
            anonMessages.innerHTML = '<div class="chat-no-msg">아직 익명 채팅이 없습니다.</div>';
        } else {
            // [★수정] anonNum 필드로 익명1, 익명2... 구분 표시
            anonMessages.innerHTML = anonList.map(msg => {
                const label = msg.anonNum ? `익명${msg.anonNum}` : '익명';
                return `<div class="chat-msg">
                    <span class="chat-sender" style="color:#5c6bc0;">${label}:</span>${msg.text || ''}
                </div>`;
            }).join('');
        }
        anonMessages.scrollTop = anonMessages.scrollHeight;

        // 남은 횟수 표시
        const myCounts = gameData.night_chat_counts || {};
        const usedCount = myId ? (myCounts[myId] || 0) : 0;
        const remaining = Math.max(0, 5 - usedCount);

        if (anonRemaining) {
            anonRemaining.innerText = `(남은 횟수: ${remaining} / 5)`;
            anonRemaining.style.color = remaining === 0 ? '#e53935' : '#777';
        }

        // 전송 가능 여부: 살아있는 학생만 가능, 교사·사망자는 관찰 전용
        const canSendAnon = !isAdmin && isAlive && remaining > 0;
        if (anonInput)   { anonInput.disabled   = !canSendAnon; }
        if (anonSendBtn) {
            anonSendBtn.disabled = !canSendAnon;
            anonSendBtn.style.opacity = canSendAnon ? '1' : '0.45';
            if (remaining === 0) anonSendBtn.innerText = '한도 초과';
        }

        // 입력창 자체를 교사·죽은 학생에게는 숨김 처리
        const anonInputRow = document.getElementById('anon-chat-input-row');
        if (anonInputRow) {
            anonInputRow.style.display = (!isAdmin) ? 'flex' : 'none';
        }
    }
}

/**
 * 마피아 전용 채팅 전송
 * 마피아 역할의 살아있는 학생만 사용 가능
 */
window.sendMafiaChat = function() {
    if (!currentUser || currentUser.isAdmin) return;

    const input = document.getElementById('mafia-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const myData = cachedPlayers ? cachedPlayers[currentUser.id] : null;
    if (!myData || myData.role !== 'mafia' || !myData.isAlive) return;

    getDb().ref('game/night_chats/mafia').push({
        uid:  currentUser.id,
        nick: myData.nickname,
        text: text,
        ts:   firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        input.value = '';
        input.focus();
    }).catch(err => console.error('마피아 채팅 전송 오류:', err));
};

/**
 * 익명 채팅 전송 (5회 제한)
 * Firebase 트랜잭션으로 카운트를 안전하게 증가시킵니다.
 */
window.sendAnonChat = function() {
    if (!currentUser || currentUser.isAdmin) return;

    const input = document.getElementById('anon-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const myData = cachedPlayers ? cachedPlayers[currentUser.id] : null;
    if (!myData || !myData.isAlive) return;

    const uid = currentUser.id;

    // [★신규] anonNum을 포함해서 메시지를 전송하는 내부 함수
    const doSendWithAnonNum = (anonNum) => {
        getDb().ref(`game/night_chat_counts/${uid}`).transaction(currentCount => {
            const count = currentCount || 0;
            if (count >= 5) return; // 트랜잭션 중단
            return count + 1;
        }, (error, committed) => {
            if (error) return console.error('채팅 카운트 트랜잭션 오류:', error);
            if (!committed) {
                alert('💬 익명 채팅 가능 횟수(5회)를 모두 사용했습니다!');
                return;
            }
            getDb().ref('game/night_chats/anon').push({
                anonNum: anonNum, // 익명N 번호
                text: text,
                ts: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                input.value = '';
                input.focus();
            }).catch(err => console.error('익명 채팅 전송 오류:', err));
        });
    };

    // [★신규] 이미 이번 밤에 번호가 부여된 경우 재사용, 없으면 새 번호 발급
    const existingAnonNum = cachedGameData?.anon_identities?.[uid];
    if (existingAnonNum) {
        doSendWithAnonNum(existingAnonNum);
    } else {
        // anon_identity_counter를 1 증가시켜 고유 번호 발급 (동시 발급 경쟁 조건 안전 처리)
        getDb().ref('game/anon_identity_counter').transaction(c => (c || 0) + 1, (err, committed, snap) => {
            if (err || !committed) return console.error('익명 번호 발급 오류:', err);
            const newNum = snap.val();
            // 내 UID → 번호 매핑을 서버에 저장 (uid는 저장되지 않으므로 다른 학생은 번호만 볼 수 있음)
            getDb().ref(`game/anon_identities/${uid}`).set(newNum).then(() => {
                doSendWithAnonNum(newNum);
            });
        });
    }
};

// ─────────────────────────────────────────────────────────────────────
// 기존 렌더 함수들
// ─────────────────────────────────────────────────────────────────────

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
    const turn     = gameData.turn || 1;
    const status   = gameData.status || 'day_discuss';
    const report   = gameData.morning_report || '';

    const roundTitle = document.getElementById('round-title');
    if (roundTitle) {
        roundTitle.innerText = `제 ${turn}회차 - ${status === 'day_discuss' ? '낮 ☀️' : '밤 🌙'}`;
    }

    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.innerText = report;
        statusMsg.className = (status === 'night_action') ? 'alert-box night' : 'alert-box';
    }

    // 팝업 알림 체크는 rerenderAllUI() 최상단으로 이동했습니다.
    // (game_over 전환 시에도 빠짐없이 뜨도록 하기 위함 - 상세 사유는 rerenderAllUI 주석 참고)

    if (currentUser && !currentUser.isAdmin) {
        const myData = players[currentUser.id];
        if (myData) {
            currentRole = myData.role || 'none';
            document.getElementById('my-nick-name').innerText = `${myData.nickname}${myData.isAlive ? '' : ' (사망 유령 상태)'}`;
            document.getElementById('my-role-name').innerText = `내 직업: ${roleIcons[myData.role] || ''} ${getRoleKoreanName(myData.role)}`;
        }
    } else if (currentUser && currentUser.isAdmin) {
        document.getElementById('my-nick-name').innerText = '교사(중앙 관제 마스터)';
        document.getElementById('my-role-name').innerText = '실시간 모니터링 모드 가동 중';
    }

    renderLogsAndChronicles(gameData, players);
    renderPlayerGridContainer(gameData, players);
    renderStudentActionPanel(gameData, players);
    renderTeacherControlTower(gameData, players);
    renderSuspectRankPanel(gameData); // [★신규] 밤사이 의심 순위 랭킹 버튼/내용 갱신

    // [★신규] 밤 채팅방 렌더 (마지막에 호출)
    renderNightChats(gameData, players);
}

// [★신규] 밤사이 학생(시민류 역할 + 능력을 소진한 기자)들이 지목한 "의심자" 투표를
// 다음 날 낮에 득표순으로 정리해서 보여주는 랭킹 패널.
// game/last_night_suspects는 processNightActions()에서 이미 { 닉네임: 득표수 } 형태로 계산되어 있습니다.
function renderSuspectRankPanel(gameData) {
    const rankBtn  = document.getElementById('rank-btn');
    const rankList = document.getElementById('rank-list');
    if (!rankBtn || !rankList) return;

    const status = gameData.status || 'day_discuss';
    const suspects = gameData.last_night_suspects;
    const hasData = suspects && suspects !== 'none' && typeof suspects === 'object' && Object.keys(suspects).length > 0;

    // 낮 시간대 + 집계된 데이터가 있을 때만 버튼 노출 (밤이 되거나 데이터가 없으면 숨김)
    if (status === 'day_discuss' && hasData) {
        rankBtn.style.display = 'block';
    } else {
        rankBtn.style.display = 'none';
        rankList.style.display = 'none';
        return;
    }

    // 득표수 내림차순 정렬
    const sorted = Object.entries(suspects).sort((a, b) => b[1] - a[1]);
    rankList.innerHTML = sorted.map(([nick, count], idx) => {
        return `<div>${idx + 1}위 — <b>${nick}</b> (${count}표)</div>`;
    }).join('');
}

// 랭킹 박스 펼치기/접기 토글
window.toggleSuspectRank = function() {
    const rankList = document.getElementById('rank-list');
    if (!rankList) return;
    rankList.style.display = (rankList.style.display === 'none' || !rankList.style.display) ? 'block' : 'none';
};

function renderPlayerGridContainer(gameData, players) {
    const gridContainer = document.getElementById('player-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    const myId   = currentUser ? currentUser.id : 'none';
    const myData = players[myId] || {};
    const myRole = myData.role || 'none';
    const status    = gameData.status || 'day_discuss';
    const voteState = gameData.vote_state || 'none';

    // [★신규] 스파이-마피아 접선 성공 여부 (게임 전체에서 한 번 성공하면 계속 유지됨)
    const contactRevealed = gameData.contact_revealed === true;
    const contactSpyUid   = gameData.contact_spy_uid || 'none';

    // [★신규] 기자가 능력을 이미 사용했다면, 밤에는 시민처럼 의심자 지목(suspect) 방식으로 전환
    const isReporterExhausted = (myRole === 'reporter' && myData.reporterUsed === true);
    const citizenLikeRoles = ['citizen', 'lovers', 'soldier', 'assemblyman', 'terrorist'];

    for (let id in players) {
        const p = players[id];
        let cardClasses = ['grid-card'];
        let badgeText = '';
        let loversAppendText = '';

        if (!p.isAlive) cardClasses.push('dead');

        if (status === 'day_discuss' && voteState === 'voting' && myData.dayVote === id) cardClasses.push('my-selected');
        if (status === 'night_action' && myData.nightTarget === id) cardClasses.push('my-selected');
        if (status === 'night_action' && (citizenLikeRoles.includes(myRole) || isReporterExhausted) && myData.suspect === id) cardClasses.push('my-selected');

        let aiSubText = p.isAiControlled ? `<div style="font-size:10px; color:#ef6c00; font-weight:bold;">(AI로 대체됨)</div>` : '';

        if (currentUser && !currentUser.isAdmin && p.isAlive) {
            if (myRole === 'mafia' && p.role === 'mafia') {
                badgeText = `<span class="badge">${roleIcons[p.role]}</span>`;
            }
            if (myRole === 'lovers' && p.role === 'lovers') {
                loversAppendText = `<span style="font-size:10px; color:#e91e63;">💕연인</span>`;
            }
            // [★신규] 스파이-마피아 접선 성공 시 서로만 보이는 표시
            // (스파이는 접선 성공 후 마피아 전체 명단을 알게 되므로 모든 마피아 카드에 표시,
            //  마피아는 접선한 스파이 한 명만 알아볼 수 있음)
            if (contactRevealed) {
                if (myRole === 'spy' && myId !== 'none' && p.role === 'mafia') {
                    badgeText += `<span class="badge" style="background:#6a1b9a;">🔗</span>`;
                }
                if (myRole === 'mafia' && id === contactSpyUid) {
                    badgeText += `<span class="badge" style="background:#6a1b9a;">🔗</span>`;
                }
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
        const players  = gameData.players || {};
        const status        = gameData.status || 'day_discuss';
        const voteState     = gameData.vote_state || 'none';
        const lastNightAssault = gameData.last_night_assault || 'none';

        const myId   = currentUser.id;
        const myData = players[myId];
        const targetUser = players[targetUid];

        if (!myData || !myData.isAlive) return;
        if (!targetUser || !targetUser.isAlive) return;

        const myRole  = myData.role || 'citizen';
        const updates = {};

        if (status === 'day_discuss' && voteState === 'voting') {
            if (myId === lastNightAssault) {
                alert('🥊 어젯밤 건달에게 협박당해 오늘 낮 투표권이 박탈된 상태입니다!');
                return;
            }
            updates[`game/players/${myId}/dayVote`] = (myData.dayVote === targetUid) ? 'none' : targetUid;
        }
        else if (status === 'night_action') {
            // [★수정] 기자가 이미 능력을 사용했다면(reporterUsed), 그 이후로는
            // 일반 시민과 동일하게 "의심자 지목(suspect)" 방식으로 참여합니다.
            const citizenLikeRoles = ['citizen', 'lovers', 'soldier', 'assemblyman', 'terrorist'];
            const isReporterExhausted = (myRole === 'reporter' && myData.reporterUsed === true);

            if (citizenLikeRoles.includes(myRole) || isReporterExhausted) {
                updates[`game/players/${myId}/suspect`] = (myData.suspect === targetUid) ? 'none' : targetUid;
            } else {
                if (myRole === 'mafia' && targetUser.role === 'mafia') {
                    return alert('🚨 동료 마피아를 사살할 수 없습니다! (팀킬 방지 가드)');
                }
                // 기자가 아직 능력을 안 썼다면 여기로 와서 특종 취재 대상(nightTarget)을 지목
                updates[`game/players/${myId}/nightTarget`] = (myData.nightTarget === targetUid) ? 'none' : targetUid;
            }
        }

        if (Object.keys(updates).length > 0) getDb().ref().update(updates);
    });
};

function renderStudentActionPanel(gameData, players) {
    const panel      = document.getElementById('student-vote-panel');
    const actionArea = document.getElementById('vote-action-area');
    const resultText = document.getElementById('trial-submit-result-text');
    const title      = document.getElementById('vote-panel-title');
    const desc       = document.getElementById('vote-panel-desc');

    if (!panel) return;

    const myId   = currentUser ? currentUser.id : '';
    const myData = players[myId];
    const voteState    = gameData.vote_state || 'none';
    const targetOnTrial = gameData.target_on_trial || 'none';

    if (!myData || !myData.isAlive || voteState === 'none') {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';

    if (voteState === 'voting') {
        title.innerText = '🗳️ 낮 의심자 지목 투표 시간';
        desc.innerText  = '위 생존 현황 격자판에서 마피아로 의심되는 친구의 카드를 터치해 주세요.';
        actionArea.style.display = 'none';
    }
    else if (voteState === 'execution_trial' && targetOnTrial !== 'none') {
        const suspectedNick = players[targetOnTrial]?.nickname || '미상';
        title.innerText = `⚖️ 사형대 재판: [${suspectedNick}] 최종 판결`;
        desc.innerText  = `현재 사형대에 소환된 [${suspectedNick}] 학생을 처형할지, 무죄 방면하여 부활시킬지 최종 서명해 주세요.`;
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
    getDb().ref(`game/players/${currentUser.id}`).update({ trialDecision: decision })
        .then(() => console.log(`재판 찬반 표결 완료 -> ${decision}`));
};

function renderLogsAndChronicles(gameData, players) {
    const logBox  = document.getElementById('my-personal-log-box');
    const logList = document.getElementById('personal-log-list');
    const historyList = document.getElementById('history-log-list');

    if (logBox && logList && currentUser && !currentUser.isAdmin) {
        const myData   = players[currentUser.id] || {};
        const logContent = myData.personalLog || 'none';

        if (['mafia', 'spy', 'police', 'detective', 'mudang', 'reporter'].includes(myData.role) && logContent !== 'none') {
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

    const status    = gameData.status || 'day_discuss';
    const voteState = gameData.vote_state || 'none';

    document.getElementById('admin-start-vote-btn').style.display    = (status === 'day_discuss' && voteState === 'none')              ? 'block' : 'none';
    document.getElementById('admin-finish-vote-btn').style.display   = (status === 'day_discuss' && voteState === 'voting')            ? 'block' : 'none';
    document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';

    const stageBtn = document.getElementById('next-stage-btn');
    stageBtn.style.display = (voteState === 'none') ? 'block' : 'none';
    stageBtn.innerText = (status === 'day_discuss') ? '🌙 교사 강제 밤 전환' : '☀️ 교사 밤 행동 마감 및 아침 개시';

    const monitorSec = document.getElementById('admin-secret-monitor');
    const tbody      = document.getElementById('admin-live-roles-table');

    if (monitorSec && tbody) {
        monitorSec.style.display = 'block';
        tbody.innerHTML = '';

        Object.entries(players).forEach(([uid, p]) => {
            const trClass       = p.isAlive ? '' : 'monitor-dead';
            const liveStatusText = p.isAlive ? '🟢 생존' : '💀 사망유령';
            const isRevealed    = adminRevealMap[uid] || false;
            const displayedRole = isRevealed ? `${roleIcons[p.role]} ${getRoleKoreanName(p.role)}` : '🙈 가림막 보호 중';
            const btnText       = isRevealed ? '다시 숨기기' : '직업 보기';

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
    const winnerTitle  = document.getElementById('winner-title');
    const finalReport  = document.getElementById('final-report');
    const mafiaList    = document.getElementById('final-mafia-list');
    const citizenList  = document.getElementById('final-citizen-list');
    const resetControls = document.getElementById('admin-reset-controls');

    if (!winnerTitle || !finalReport || !mafiaList || !citizenList) return;

    const winner = gameData.winner || 'none';
    if (winner === 'mafia_win')   winnerTitle.innerText = '🔴 마피아 진영 최종 승리! 🔴';
    else if (winner === 'citizen_win') winnerTitle.innerText = '⚪ 시민 연합군 최종 승리! ⚪';
    else                          winnerTitle.innerText = '🎉 게임 종료 🎉';

    finalReport.innerText = gameData.morning_report || '';
    mafiaList.innerHTML   = '';
    citizenList.innerHTML = '';

    Object.entries(players).forEach(([uid, p]) => {
        const isMafiaSide = (p.role === 'mafia' || p.role === 'spy');
        const icon        = roleIcons[p.role] || '❓';
        const statusText  = p.isAlive ? '생존' : '사망';
        const statusClass = p.isAlive ? 'alive' : 'dead';

        const cardHtml = `
            <div class="role-character-card">
                <div class="char-icon">${icon}</div>
                <div class="char-nick">${p.nickname}</div>
                <div class="char-role">${getRoleKoreanName(p.role)}</div>
                <span class="char-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;

        if (isMafiaSide) mafiaList.innerHTML += cardHtml;
        else             citizenList.innerHTML += cardHtml;
    });

    if (resetControls) {
        resetControls.style.display = (currentUser && currentUser.isAdmin) ? 'block' : 'none';
    }
}