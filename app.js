const getDb = () => {
    if (window.sharedDatabase) return window.sharedDatabase;
    return firebase.database();
};

let currentUser = null;
let currentRole = "none";
let currentStatus = "waiting";
let currentQuiz = null;
let adminRevealMap = {}; // 교사용 개별 직업 열람 체크용 맵 객체

const quizBank = {
    "1-1": [
        { q: "과학: 물질의 세 가지 상태 중 모양과 부피가 일정한 상태는?", a: ["고체", "액체", "기체", "플라스마"], c: 0 },
        { q: "넌센스: 지구가 황당해하는 말을 세 글자로?", a: ["지구머니", "지구용사", "어이없다", "둥글둥글"], c: 0 }
    ],
    "1-2": [
        { q: "과학: 빛이 거울에 부딪혀서 나아가는 방향이 바뀌는 현상은?", a: ["굴절", "반사", "분산", "합성"], c: 1 },
        { q: "넌센스: 왕이 넘어지면 무엇이라고 할까?", a: ["킹콩", "킹바다", "킹스맨", "킹왕짱"], c: 0 }
    ],
    "2-1": [
        { q: "과학: 물질을 구성하는 가장 작은 독립된 입자는?", a: ["원자", "분자", "원소", "이온"], c: 1 },
        { q: "넌센스: 세상에서 가장 차가운 바다는?", a: ["썰렁해", "냉동해", "북극해", "남극해"], c: 0 }
    ],
    "2-2": [
        { q: "과학: 식물이 빛에너지를 이용하여 영양분을 만드는 과정은?", a: ["호흡", "증산", "광합성", "소화"], c: 2 },
        { q: "넌센스: 의사들이 가장 좋아하는 행동은?", a: ["주사하기", "치료하기", "수술하기", "혈압재기"], c: 0 }
    ]
};

// 특정 유저 클릭 시 교사 화면에서 가림막 주소를 풀고 재렌더링
window.toggleAdminRoleView = function(uid) {
    adminRevealMap[uid] = !adminRevealMap[uid];
    renderGameScreen();
};

window.onload = function() {
    const savedUser = localStorage.getItem('mafia_session');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        enterWaitingRoom();
    }
};

function toggleAuthMode(mode) {
    if (mode === 'signup') {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    } else {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
}

function handleSignup() {
    const id = document.getElementById('signup-id').value.trim();
    const pw = document.getElementById('signup-pw').value.trim();
    const nick = document.getElementById('signup-nick').value.trim();

    if (!id || !pw || !nick) return alert('모든 필드를 입력해 주세요.');
    if (id === 'admin') return alert('admin 이라는 아이디는 생성 불가합니다.');

    getDb().ref(`accounts/${id}`).get().then((snapshot) => {
        if (snapshot.exists()) {
            alert('이미 누군가 사용 중인 아이디입니다.');
        } else {
            getDb().ref(`accounts/${id}`).set({ pw, nick }).then(() => {
                alert('회원가입 완료! 로그인 화면으로 이동합니다.');
                document.getElementById('signup-id').value = '';
                document.getElementById('signup-pw').value = '';
                document.getElementById('signup-nick').value = '';
                toggleAuthMode('login');
            });
        }
    }).catch(err => alert("회원가입 중 오류 발생: " + err.message));
}

function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value.trim();

    if (id === 'admin' && pw === 'teacherpw') {
        currentUser = { id: 'admin', nick: '선생님', isAdmin: true };
        localStorage.setItem('mafia_session', JSON.stringify(currentUser));
        enterWaitingRoom();
        return;
    }

    getDb().ref(`accounts/${id}`).get().then((snapshot) => {
        if (snapshot.exists() && snapshot.val().pw === pw) {
            currentUser = { id: id, nick: snapshot.val().nick, isAdmin: false };
            localStorage.setItem('mafia_session', JSON.stringify(currentUser));
            enterWaitingRoom();
        } else {
            alert('아이디 또는 비밀번호를 다시 확인해 주세요.');
        }
    });
}

function enterWaitingRoom() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
    document.getElementById('global-exit-btn').style.display = 'block';

    if (currentUser.isAdmin) {
        document.getElementById('admin-controls').style.display = 'block';
    }

    if (!currentUser.isAdmin) {
        getDb().ref(`game/players/${currentUser.id}`).set({
            nickname: currentUser.nick,
            isAlive: true,
            role: "none",
            nightTarget: "none",
            suspect: "none"
        });
    }

    getDb().ref('game/players').on('value', (snapshot) => {
        const players = snapshot.val() || {};
        const playerListContainer = document.getElementById('player-list');
        if (!playerListContainer) return;
        
        playerListContainer.innerHTML = '';
        let count = 0;
        for (let id in players) {
            count++;
            const player = players[id];
            playerListContainer.innerHTML += `<div class="player-card">${player.nickname}</div>`;
        }
        const countDisp = document.getElementById('player-count');
        if (countDisp) countDisp.innerText = count;
    });

    getDb().ref('game/status').get().then((snap) => {
        const s = snap.val();
        if (s && s !== 'waiting') {
            triggerGameViewTransition();
        }
    });
}

function openRoleGuide() { 
    document.getElementById('role-guide-modal').style.display = 'flex'; 
    switchGuideTab('mafia');
}
function closeRoleGuide() { document.getElementById('role-guide-modal').style.display = 'none'; }

function switchGuideTab(targetTeam) {
    const mafiaBtn = document.getElementById('tab-mafia-btn');
    const citizenBtn = document.getElementById('tab-citizen-btn');
    const mafiaPanel = document.getElementById('guide-tab-mafia');
    const citizenPanel = document.getElementById('guide-tab-citizen');

    if (mafiaBtn && citizenBtn && mafiaPanel && citizenPanel) {
        if (targetTeam === 'mafia') {
            mafiaBtn.classList.add('active');
            citizenBtn.classList.remove('active');
            mafiaPanel.style.display = 'block';
            citizenPanel.style.display = 'none';
        } else {
            citizenBtn.classList.add('active');
            mafiaBtn.classList.remove('active');
            citizenPanel.style.display = 'block';
            mafiaPanel.style.display = 'none';
        }
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('role-guide-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

function changeQuizLevel(level) {
    if (currentUser && currentUser.isAdmin) {
        getDb().ref('game/current_level').set(level);
    }
}

function handleExit() {
    if (!currentUser) return;
    const confirmExit = confirm("정말 이 방에서 나가시겠습니까?");
    if (!confirmExit) return;

    if (!currentUser.isAdmin) {
        getDb().ref(`game/players/${currentUser.id}`).remove().then(clearSession);
    } else {
        clearSession();
    }
}

function clearSession() {
    localStorage.removeItem('mafia_session');
    currentUser = null;
    location.reload(); 
}

function handleStartGame() {
    if (!currentUser || !currentUser.isAdmin) return;

    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        const uids = Object.keys(players);
        const total = uids.length;

        if (total < 1) return alert('게임에 참여할 학생이 최소 1명 이상 필요합니다.');

        let rolePool = [];
        const mafiaCount = parseInt(document.getElementById('cfg-mafia').value) || 1;
        for (let i = 0; i < mafiaCount; i++) rolePool.push("mafia");

        if (document.getElementById('cfg-lovers').checked) {
            rolePool.push("lovers"); rolePool.push("lovers");
        }

        const singleRoles = ["spy", "detective", "mudang", "police", "doctor", "soldier", "assemblyman", "terrorist", "gangster"];
        singleRoles.forEach(roleId => {
            const chk = document.getElementById(`cfg-${roleId}`);
            if (chk && chk.checked) rolePool.push(roleId);
        });

        if (rolePool.length > total) {
            alert(`설정된 특수직업이 인원보다 많아 순서대로 배정됩니다.`);
            rolePool = rolePool.slice(0, total);
        }

        while (rolePool.length < total) rolePool.push("citizen");

        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        const updates = {};
        uids.forEach((uid, index) => {
            updates[`game/players/${uid}/role`] = rolePool[index];
            updates[`game/players/${uid}/isAlive`] = true;
            updates[`game/players/${uid}/nightTarget`] = "none";
            updates[`game/players/${uid}/suspect`] = "none";
            updates[`game/players/${uid}/soldierLife`] = 2;
            updates[`game/players/${uid}/personalLog`] = "none"; // 개인 로그 초기화
        });

        updates['game/status'] = 'day_discuss';
        updates['game/turn'] = 1;
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 자유롭게 토론하고 마피아를 추적하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        
        // [신규] 전체 사건 역사 기록 로그배열 선언 추가
        updates['game/history_logs'] = ["제 1회차 게임이 시작되었습니다!"];

        adminRevealMap = {}; // 가림막 토글 풀 클리어
        getDb().ref().update(updates);
    });
}

function handleForceStopGame() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 강제로 파기하고 대기실로 리셋하시겠습니까?")) {
        handleResetToWaiting();
    }
}

getDb().ref('game/status').on('value', (snapshot) => {
    currentStatus = snapshot.val();
    if (!currentUser) return; 

    const waitingView = document.getElementById('waiting-view');
    const gameView = document.getElementById('game-view');
    const gameOverView = document.getElementById('game-over-view');

    if (currentStatus === 'waiting') {
        if (waitingView) waitingView.style.display = 'block';
        if (gameView) gameView.style.display = 'none';
        if (gameOverView) gameOverView.style.display = 'none';
        return;
    }

    triggerGameViewTransition();
});

function triggerGameViewTransition() {
    const gameView = document.getElementById('game-view');
    const gameOverView = document.getElementById('game-over-view');
    const waitingView = document.getElementById('waiting-view');

    if (currentStatus === 'game_over') {
        if (gameView) gameView.style.display = 'none';
        if (gameOverView) gameOverView.style.display = 'block';
        if (currentUser.isAdmin) {
            const resetPanel = document.getElementById('admin-reset-controls');
            if (resetPanel) resetPanel.style.display = 'block';
        }
        renderGameOverScreen();
        return;
    } else {
        if (gameOverView) gameOverView.style.display = 'none';
    }

    if (waitingView) waitingView.style.display = 'none';
    if (gameView) gameView.style.display = 'block';

    if (currentRole === 'mafia' && currentStatus === 'night_action') {
        getDb().ref('game/mafia_targets').on('value', () => { renderGameScreen(); });
    } else {
        getDb().ref('game/mafia_targets').off();
    }

    renderGameScreen();
}

function renderGameScreen() {
    if (!currentUser) return; 
    
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const status = gameData.status;
        const turn = gameData.turn;
        const mafiaTargets = gameData.mafia_targets || {};
        const report = gameData.morning_report || "";
        const hint = gameData.current_hint || "없음";
        const historyLogs = gameData.history_logs || [];

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        const myData = players[currentUser.id] || { isAlive: true };

        const roleKorean = {
            mafia: "마피아 🔴", citizen: "시민 ⚪", spy: "스파이 🕵️‍♂️", detective: "사립탐정 🔍",
            mudang: "무당 🔮", police: "경찰 👮", doctor: "의사 🩺", soldier: "군인 🪖",
            assemblyman: "국회의원 ⚖️", terrorist: "테러리스트 💣", gangster: "건달 🔨", lovers: "연인 💕"
        };

        // [수정 사항 반영] 1. 상단 전체 역사 히스토리 실시간 텍스트 출력 파트
        const logContainer = document.getElementById('history-log-list');
        if (logContainer) {
            logContainer.innerHTML = historyLogs.slice().reverse().map(log => `<div>• ${log}</div>`).join("");
        }

        // [수정 사항 반영] 2. 교사용 가림막 토글형 실시간 현황 모니터링 테이블 갱신
        if (currentUser.isAdmin) {
            const adminPanel = document.getElementById('admin-game-controls');
            if (adminPanel) adminPanel.style.display = 'block';

            // 낮일때는 투표 섹션 열기, 밤일때는 닫기 분기
            const voteSec = document.getElementById('admin-vote-section');
            if (voteSec) voteSec.style.display = (status === 'day_discuss') ? 'block' : 'none';

            const nextBtn = document.getElementById('next-stage-btn');
            if (nextBtn) nextBtn.innerText = (status === 'day_discuss') ? "밤으로 단계 이동" : "아침 결과 처리 이동";
            
            const monitor = document.getElementById('admin-secret-monitor');
            const tableBody = document.getElementById('admin-live-roles-table');
            if (monitor && tableBody) {
                monitor.style.display = 'block';
                let htmlRows = "";
                for (let id in players) {
                    const p = players[id];
                    const deadRowClass = p.isAlive ? "" : "class='monitor-dead'";
                    
                    // [핵심] 가림막 상태 검사 분기
                    const isRevealed = adminRevealMap[id];
                    const roleText = isRevealed ? `<span style="color:#d32f2f;">${roleKorean[p.role]}</span>` : `<span style="color:#9e9e9e;">🙈 보안 가려짐</span>`;
                    const btnLabel = isRevealed ? "가리기" : "직업보기";

                    htmlRows += `
                        <tr ${deadRowClass}>
                            <td><b>${p.isAlive ? "🟢 생존" : "💀 유령"}</b></td>
                            <td>${p.nickname}</td>
                            <td>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    ${roleText}
                                    <button class="secret-reveal-btn" onclick="toggleAdminRoleView('${id}')">${btnLabel}</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }
                tableBody.innerHTML = htmlRows;
            }
        }

        if (hintBox) {
            if (hint !== "없음" && status === 'day_discuss') {
                hintBox.innerText = `🔍 유령들이 풀어서 획득한 단서: ${hint}`;
                hintBox.style.display = 'block';
            } else {
                hintBox.style.display = 'none';
            }
        }

        const rankBtn = document.getElementById('rank-btn');
        if (rankBtn) {
            rankBtn.style.display = (status === 'day_discuss') ? 'block' : 'none';
            if (status === 'day_discuss') document.getElementById('rank-list').style.display = 'none';
        }

        if (status === 'day_discuss') {
            if (msgBox) {
                msgBox.innerText = report;
                msgBox.className = "alert-box";
            }
            if (quizBox) quizBox.style.display = 'none';
        } else if (status === 'night_action') {
            if (msgBox) {
                msgBox.innerText = "밤이 되었습니다. 각자의 능력을 사용하거나 의심 대상을 메모하세요.";
                msgBox.className = "alert-box night";
            }

            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive) {
                    quizBox.style.display = 'block';
                    if (!currentQuiz) generateGhostQuiz(gameData.current_level || "2-1");
                } else {
                    quizBox.style.display = 'none';
                }
            }
        }

        const turnDisp = document.getElementById('turn-display');
        if (turnDisp) turnDisp.innerText = `제 ${turn}회차 - ${status === 'day_discuss' ? '낮' : '밤'}`;

        // [수정 사항 반영] 3. 학생 화면용 상단 고유 본인 닉네임과 직업을 순차 노출 배치함
        const myNickDisp = document.getElementById('my-nick-name');
        const myRoleNameDisp = document.getElementById('my-role-name');
        if (myNickDisp && myRoleNameDisp) {
            if (!currentUser.isAdmin && players[currentUser.id]) {
                currentRole = players[currentUser.id].role;
                myNickDisp.innerText = currentUser.nick;
                myRoleNameDisp.innerText = myData.isAlive ? (roleKorean[currentRole] || currentRole) : "사망자 (유령 👻)";
            } else if (currentUser.isAdmin) {
                myNickDisp.innerText = "교사 시스템 계정";
                myRoleNameDisp.innerText = "교사 (관전자)";
            }
        }

        // [수정 사항 반영] 4. 특수 직업 및 경찰 등의 밤 개인 결과 기록장 상자 노출 조건식 빌드
        const personalLogBox = document.getElementById('my-personal-log-box');
        const personalLogList = document.getElementById('personal-log-list');
        if (personalLogBox && personalLogList && !currentUser.isAdmin) {
            if (myData.personalLog && myData.personalLog !== "none") {
                personalLogBox.style.display = "block";
                personalLogList.innerHTML = myData.personalLog.split("\n").map(l => `<div>• ${l}</div>`).join("");
            } else {
                personalLogBox.style.display = "none";
            }
        }

        const gridContainer = document.getElementById('player-grid');
        if (gridContainer) {
            gridContainer.innerHTML = '';

            for (let id in players) {
                const p = players[id];
                let cardClasses = ['grid-card'];
                let badgeText = '';
                
                if (!p.isAlive) cardClasses.push('dead');

                if (status === 'night_action' && !currentUser.isAdmin && myData.isAlive) {
                    if ((currentRole === 'citizen' || currentRole === 'lovers') && players[currentUser.id].suspect === id) {
                        cardClasses.push('my-selected');
                    } else if (players[currentUser.id].nightTarget === id) {
                        cardClasses.push('my-selected');
                    }
                }

                // [수정] 교사가 낮에 사형시킬 학생을 찝었을 때 하이라이트 되도록 스타일 공유 유연화
                if (status === 'day_discuss' && currentUser.isAdmin && window.selectedExecutionUid === id) {
                    cardClasses.push('my-selected');
                }

                if (status === 'night_action' && myData.isAlive) {
                    if (currentRole === 'mafia') {
                        let mCount = 0;
                        for (let mUid in mafiaTargets) {
                            if (mafiaTargets[mUid] === id) mCount++;
                        }
                        if (mCount > 0) badgeText = `<span class="badge">${mCount === 1 ? '목표설정' : '목표설정(' + mCount + ')'}</span>`;
                    } else if (id === players[currentUser.id].nightTarget) {
                        if (currentRole === 'gangster') badgeText = `<span class="badge blue">폭행!</span>`;
                        else if (currentRole === 'police') badgeText = `<span class="badge green">조사중</span>`;
                        else if (currentRole === 'detective') badgeText = `<span class="badge green">추적중</span>`;
                        else if (currentRole === 'mudang') badgeText = `<span class="badge green">영혼기도</span>`;
                        else if (currentRole === 'doctor') badgeText = `<span class="badge purple">수호중</span>`;
                    } else if (currentRole === 'citizen' && id === players[currentUser.id].suspect) {
                        badgeText = `<span class="badge green">의심됨</span>`;
                    } else if (currentRole === 'lovers') {
                        if (p.role === 'lovers') {
                            badgeText = `<span class="badge pink">부부</span>`;
                        } else if (id === players[currentUser.id].suspect) {
                            badgeText = `<span class="badge green">의심됨</span>`;
                        }
                    }
                }

                gridContainer.innerHTML += `
                    <div class="${cardClasses.join(' ')}" onclick="handleCardClick('${id}')">
                        <span>${p.nickname}</span>
                        ${badgeText}
                    </div>
                `;
            }
        }
    });
}

// [수정] 카드 클릭 동작에 낮 투표 타겟 지정 기능 추가 바인딩
function handleCardClick(targetUid) {
    if (currentUser.isAdmin) {
        if (currentStatus === 'day_discuss') {
            // 교사가 낮에 격자판 학생을 찍으면 전역 타겟 변수에 담고 화면만 새로고침
            window.selectedExecutionUid = targetUid;
            renderGameScreen();
        }
        return;
    }

    if (currentStatus !== 'night_action') return;

    getDb().ref(`game/players/${currentUser.id}`).get().then((mySnap) => {
        const myData = mySnap.val();
        if (!myData.isAlive) return alert('사망한 상태에서는 퀴즈 미션으로 기여해 주세요.');

        if (currentRole === 'citizen' || currentRole === 'lovers') {
            getDb().ref(`game/players/${currentUser.id}/suspect`).set(targetUid).then(renderGameScreen);
        } else if (currentRole === 'mafia') {
            getDb().ref(`game/mafia_targets/${currentUser.id}`).set(targetUid);
            getDb().ref(`game/players/${currentUser.id}/nightTarget`).set(targetUid).then(renderGameScreen);
        } else {
            getDb().ref(`game/players/${currentUser.id}/nightTarget`).set(targetUid).then(renderGameScreen);
        }
    });
}

// [신규 기능] 낮 투표 확정 처형 및 역사 로그 이월 기록 연산기 (교사용)
function handleExecuteDayVote() {
    if (!currentUser || !currentUser.isAdmin || !window.selectedExecutionUid) {
        return alert("격자판에서 처형할 학생을 먼저 터치하여 선택해 주세요.");
    }

    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn;
        const targetUid = window.selectedExecutionUid;
        const targetUser = players[targetUid];

        if (!targetUser || !targetUser.isAlive) return alert("이미 사망했거나 존재하지 않는 유저입니다.");

        let reports = [];
        let deadList = [];

        // 직업 성격별 낮 투표 면책특권 및 반사 피해 체인 연산
        if (targetUser.role === 'assemblyman') {
            reports.push(`[낮 투표 결과] 시민들이 [${targetUser.nickname}]을 사형대에 올렸으나, 국회의원 면책특권 발동으로 극적으로 살아남았습니다!`);
        } else if (targetUser.role === 'terrorist') {
            deadList.push(targetUid);
            reports.push(`[낮 투표 결과] 테러리스트였던 [${targetUser.nickname}] 학생이 처형당하며 폭탄을 터트렸습니다!`);
            
            // 테러리스트가 밤에 누구를 찍었었다면 동반 자폭 즉사
            if (targetUser.nightTarget && targetUser.nightTarget !== "none" && players[targetUser.nightTarget] && players[targetUser.nightTarget].isAlive) {
                deadList.push(targetUser.nightTarget);
                reports.push(`↳ 테러리스트의 자폭 여파로 동반 지목 대상이었던 [${players[targetUser.nightTarget].nickname}] 학생도 현장에서 사망했습니다.`);
            }
        } else {
            deadList.push(targetUid);
            reports.push(`[낮 투표 결과] 다수결 여론에 따라 [${targetUser.nickname}] 학생이 최종 처형되었습니다.`);
        }

        const updates = {};
        deadList.forEach(dUid => {
            updates[`game/players/${dUid}/isAlive`] = false;
            historyLogs.push(`제 ${turn}회차 낮: [${players[dUid].nickname}] 투표 사망`);
        });

        // 처형 브리핑 기록 추가 및 로그 적재
        reports.forEach(r => historyLogs.push(r));
        updates['game/morning_report'] = reports.join("\n");
        updates['game/history_logs'] = historyLogs;

        // 게임 승리 조건 상시 체크 체인 재가동
        let aliveMafiaCount = 0;
        let aliveCitizenSideCount = 0;
        for (let id in players) {
            let isAlive = (deadList.includes(id)) ? false : players[id].isAlive;
            if (isAlive) {
                if (players[id].role === 'mafia') aliveMafiaCount++;
                else aliveCitizenSideCount++;
            }
        }

        if (aliveMafiaCount === 0) {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = 'citizen_win';
        } else if (aliveMafiaCount >= aliveCitizenSideCount) {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = 'mafia_win';
        }

        window.selectedExecutionUid = null; // 타겟 초기화
        getDb().ref().update(updates).then(() => {
            alert("낮 투표 정산 및 처형 완료!");
        });
    });
}

function generateGhostQuiz(level) {
    const pool = quizBank[level] || quizBank["2-1"];
    currentQuiz = pool[Math.floor(Math.random() * pool.length)];

    const qBox = document.getElementById('quiz-question');
    const oBox = document.getElementById('quiz-options');

    if (qBox && oBox) {
        qBox.innerText = currentQuiz.q;
        oBox.innerHTML = '';

        currentQuiz.a.forEach((opt, idx) => {
            oBox.innerHTML += `<button class="quiz-opt-btn" onclick="submitQuizAnswer(${idx})">${idx + 1}. ${opt}</button>`;
        });
    }
}

function submitQuizAnswer(idx) {
    if (idx === currentQuiz.c) {
        alert('정답입니다! 단서 유령 에너지가 1 쌓였습니다.');
        getDb().ref('game/quiz_score').transaction((score) => (score || 0) + 1);
    } else {
        alert('오답입니다. 다음 문제를 준비합니다.');
    }
    currentQuiz = null;
    renderGameScreen();
}

function toggleSuspectRank() {
    const rankListBox = document.getElementById('rank-list');
    if (!rankListBox) return;
    
    if (rankListBox.style.display === 'block') {
        rankListBox.style.display = 'none';
        return;
    }

    getDb().ref('game/last_night_suspects').get().then((snapshot) => {
        const suspectsData = snapshot.val();
        rankListBox.innerHTML = '<h4>📢 지난 밤사이 생존자 의심 여론 통계</h4>';
        
        if (!suspectsData || suspectsData === "none") {
            rankListBox.innerHTML += '<div>어젯밤 집계된 의심 투표 내역이 없습니다.</div>';
        } else {
            let sorted = Object.entries(suspectsData).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([nick, count], index) => {
                rankListBox.innerHTML += `<div><b>${index + 1}위:</b> ${nick} (${count}표)</div>`;
            });
        }
        rankListBox.style.display = 'block';
    });
}

function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    getDb().ref('game/status').get().then((snapshot) => {
        const currentStatus = snapshot.val();
        
        if (currentStatus === 'day_discuss') {
            getDb().ref('game/mafia_targets').remove().then(() => {
                getDb().ref('game/status').set('night_action');
            });
        } else if (currentStatus === 'night_action') {
            processNightActions();
        }
    });
}

// [핵심 엔진 대폭 수정] 특수 능력 및 경찰 조사 결과를 개인 로그 일지에 개별 각인 적재하는 파트 구축
function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const mafiaTargets = gameData.mafia_targets || {};
        const turn = gameData.turn;
        const quizScore = gameData.quiz_score || 0;
        const historyLogs = gameData.history_logs || [];

        let reports = [];
        let deadList = [];
        const updates = {};
        
        // 1. 마피아 다수결 타겟 계산
        let mVotes = {};
        for (let mId in mafiaTargets) {
            let t = mafiaTargets[mId];
            mVotes[t] = (mVotes[t] || 0) + 1;
        }
        let maxVote = 0;
        let finalMafiaTarget = "none";
        let targetsArray = [];
        
        for (let t in mVotes) {
            if (mVotes[t] > maxVote) {
                maxVote = mVotes[t];
                targetsArray = [t];
            } else if (mVotes[t] === maxVote) {
                targetsArray.push(t);
            }
        }
        if (targetsArray.length > 0) {
            finalMafiaTarget = targetsArray[Math.floor(Math.random() * targetsArray.length)];
        }

        let protectedUser = "none";
        for (let id in players) {
            if (players[id].role === 'doctor' && players[id].isAlive) {
                protectedUser = players[id].nightTarget;
            }
        }

        // 2. 특수 정보조사 직업들의 정밀 정보 가공 및 개인 일지 축적 연산구조 빌드
        for (let id in players) {
            const p = players[id];
            if (!p.isAlive || p.nightTarget === "none" || !players[p.nightTarget]) continue;

            const tUser = players[p.nightTarget];
            let logLine = "";
            let currentLog = (p.personalLog && p.personalLog !== "none") ? p.personalLog : "";

            const roleKoreanClean = {
                mafia: "마피아", citizen: "시민", spy: "스파이", detective: "사립탐정",
                mudang: "무당", police: "경찰", doctor: "의사", soldier: "군인",
                assemblyman: "국회의원", terrorist: "테러리스트", gangster: "건달", lovers: "연인"
            };

            if (p.role === 'police') {
                // 경찰 능력 처리: 마피아인지 시민진영인지 판별 각인
                const isMafiaSide = (tUser.role === 'mafia');
                logLine = `[제 ${turn}회차 밤] ${tUser.nickname} 조사 결과 -> ${isMafiaSide ? '마피아 진영🔴' : '시민 진영⚪'}`;
            } else if (p.role === 'mudang') {
                // 무당 능력 처리: 정확한 본래 고유 직업 매핑 각인
                logLine = `[제 ${turn}회차 밤] ${tUser.nickname} 조사 결과 -> 고유직업 [${roleKoreanClean[tUser.role]}]`;
            } else if (p.role === 'detective') {
                // 사립탐정 능력 처리: 조사 대상이 밤에 찍은 행동 타겟 경로 역추적 각인
                const hasAction = (tUser.nightTarget && tUser.nightTarget !== "none" && players[tUser.nightTarget]);
                logLine = `[제 ${turn}회차 밤] ${tUser.nickname} 동선 추적 -> ${hasAction ? '[' + players[tUser.nightTarget].nickname + '] 지목 포착🔍' : '행동 흔적 없음⚪'}`;
            }

            if (logLine !== "") {
                updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${logLine}` : logLine;
            }
        }

        // 3. 마피아 살인 연산 체인
        if (finalMafiaTarget !== "none" && finalMafiaTarget !== protectedUser) {
            const targetUser = players[finalMafiaTarget];
            
            if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                updates[`game/players/${finalMafiaTarget}/soldierLife`] = 1;
                reports.push(`군인인 누군가가 밤사이에 강력한 습격을 완벽히 저지했습니다.`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMafiaTarget);
                let mafiaIds = Object.keys(mafiaTargets);
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    reports.push(`테러리스트의 폭사 반격으로 마피아[${players[deadMafia].nickname}]와 테러리스트[${targetUser.nickname}]가 함께 사망했습니다.`);
                }
            } else if (targetUser.role === 'lovers') {
                deadList.push(finalMafiaTarget);
                for (let id in players) {
                    if (players[id].role === 'lovers' && id !== finalMafiaTarget) {
                        deadList.push(id);
                        reports.push(`연인 중 한 명인 [${targetUser.nickname}]이 피습당하자 다른 연인도 운명을 함께했습니다.`);
                    }
                }
            } else {
                deadList.push(finalMafiaTarget);
                reports.push(`밤사이에 발생한 참혹한 피습 사건으로 인해 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMafiaTarget !== "none" && finalMafiaTarget === protectedUser) {
            reports.push(`의사의 기적적인 긴급 수호로 밤사이에 아무도 희생되지 않았습니다.`);
        } else {
            reports.push(`밤사이에 아무런 소동도 감지되지 않았습니다.`);
        }

        // 4. 역사 로그 적재 및 유령 처리 가공
        deadList.forEach(dUid => {
            updates[`game/players/${dUid}/isAlive`] = false;
            historyLogs.push(`제 ${turn}회차 밤: [${players[dUid].nickname}] 마피아 습격 사망`);
        });
        if (deadList.length === 0) {
            historyLogs.push(`제 ${turn}회차 밤: 아무도 사망하지 않음`);
        }

        // 5. 시민 의심 메모 여론 취합 이월 저장
        let morningSuspectCounts = {};
        for (let id in players) {
            const sId = players[id].suspect;
            if (sId && sId !== "none" && players[sId] && players[sId].isAlive) {
                const sNick = players[sId].nickname;
                morningSuspectCounts[sNick] = (morningSuspectCounts[sNick] || 0) + 1;
            }
        }

        let nextHint = "없음";
        if (quizScore >= 2) {
            let longestNameMafia = "";
            for (let id in players) {
                if (players[id].role === 'mafia' && players[id].isAlive) {
                    const nick = players[id].nickname;
                    if (!longestNameMafia || nick.length > longestNameMafia.length) longestNameMafia = nick;
                }
            }
            if (longestNameMafia && longestNameMafia.length > 3) {
                nextHint = "마피아 중 한 명의 닉네임은 3글자보다 깁니다.";
            }
        }

        // 6. 게임 종료 검사 알고리즘
        let aliveMafiaCount = 0;
        let aliveCitizenSideCount = 0;
        for (let id in players) {
            let isAlive = (deadList.includes(id)) ? false : players[id].isAlive;
            if (isAlive) {
                if (players[id].role === 'mafia') aliveMafiaCount++;
                else aliveCitizenSideCount++;
            }
        }

        if (aliveMafiaCount === 0) {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = 'citizen_win';
        } else if (aliveMafiaCount >= aliveCitizenSideCount) {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = 'mafia_win';
        } else {
            updates['game/status'] = 'day_discuss';
        }

        // 초기화 처리 이월 세팅
        for (let id in players) {
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        updates['game/morning_report'] = reports.join("\n");
        updates['game/turn'] = turn + 1;
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = nextHint;
        updates['game/last_night_suspects'] = Object.keys(morningSuspectCounts).length > 0 ? morningSuspectCounts : "none";
        updates['game/history_logs'] = historyLogs;

        getDb().ref().update(updates);
    });
}

function renderGameOverScreen() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const winner = gameData.winner;

        const title = document.getElementById('winner-title');
        const report = document.getElementById('final-report');
        const roleList = document.getElementById('final-role-list');

        if (title && report && roleList) {
            if (winner === 'citizen_win') {
                title.innerText = "🎉 시민 진영 승리! 🎉";
                title.style.color = "#4CAF50";
                report.innerText = "마피아 세력을 모두 찾아내어 학교의 평화를 지켰습니다!";
            } else {
                title.innerText = "🔴 마피아 진영 승리! 🔴";
                title.style.color = "#d32f2f";
                report.innerText = "마피아가 시민 진영을 완벽히 포섭하고 장악했습니다.";
            }

            const roleKorean = {
                mafia: "마피아", citizen: "시민", spy: "스파이", detective: "사립탐정",
                mudang: "무당", police: "경찰", doctor: "의사", soldier: "군인",
                assemblyman: "국회의원", terrorist: "테러리스트", gangster: "건달", lovers: "연인"
            };

            roleList.innerHTML = '';
            for (let id in players) {
                const p = players[id];
                roleList.innerHTML += `<div><strong>${p.nickname}</strong>: ${roleKorean[p.role] || p.role} (${p.isAlive ? '생존' : '사망'})</div>`;
            }
        }
    });
}

function handleResetToWaiting() {
    if (!currentUser || !currentUser.isAdmin) return;

    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        const updates = {};

        for (let id in players) {
            updates[`game/players/${id}/role`] = "none";
            updates[`game/players/${id}/isAlive`] = true;
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
            updates[`game/players/${id}/personalLog`] = "none"; // 개인 일지 리셋
        }

        updates['game/status'] = 'waiting';
        updates['game/turn'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["이전 게임이 초기화되고 새로운 세션 대기가 설정되었습니다."];

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}