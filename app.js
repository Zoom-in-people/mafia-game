const getDb = () => {
    if (window.sharedDatabase) return window.sharedDatabase;
    return firebase.database();
};

let currentUser = null;
let currentRole = "none";
let currentStatus = "waiting";
let currentQuiz = null;
let adminRevealMap = {};

const roleIcons = {
    mafia: "🦹", citizen: "🧑‍🤝‍🧑", spy: "🕵️", detective: "🔍",
    mudang: "🔮", police: "👮", doctor: "🩺", soldier: "🪖",
    assemblyman: "⚖️", terrorist: "💣", gangster: "🔨", lovers: "💕"
};

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
            suspect: "none",
            dayVote: "none",
            deathReason: "none"
        });
    }

    getDb().ref('game/players').on('value', (snapshot) => {
        if (!currentUser) return;
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
        for (let i = 0; i < mafiaCount; i++) {
            rolePool.push("mafia");
        }

        if (document.getElementById('cfg-lovers').checked) {
            rolePool.push("lovers");
            rolePool.push("lovers");
        }

        const singleRoles = ["spy", "detective", "mudang", "police", "doctor", "soldier", "assemblyman", "terrorist", "gangster"];
        singleRoles.forEach(roleId => {
            const chk = document.getElementById(`cfg-${roleId}`);
            if (chk && chk.checked) {
                rolePool.push(roleId);
            }
        });

        if (rolePool.length > total) {
            alert(`[알림] 특수직업 정원이 많아 접속 인원에 맞춰 분배됩니다.`);
            rolePool = rolePool.slice(0, total);
        }

        while (rolePool.length < total) {
            rolePool.push("citizen");
        }

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
            updates[`game/players/${uid}/dayVote`] = "none";
            updates[`game/players/${uid}/soldierLife`] = 2;
            updates[`game/players/${uid}/personalLog`] = "none";
            updates[`game/players/${uid}/deathReason`] = "none";
        });

        updates['game/status'] = 'day_discuss';
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/turn'] = 1;
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 자유롭게 토론하고 마피아를 추적하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["게임이 흥미진진하게 시작되었습니다!"];

        adminRevealMap = {}; 
        getDb().ref().update(updates);
    });
}

window.handleForceStopGame = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 강제로 파기하고 대기실로 리셋하시겠습니까?")) {
        handleResetToWaiting();
    }
};

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

// [요청사항 3 반영] 낮 투표 리스너 실시간 동기화 바인딩
getDb().ref('game/vote_state').on('value', () => {
    if (currentUser && currentStatus !== 'waiting' && currentStatus !== 'game_over') {
        renderGameScreen();
    }
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

function serverStartDayVote() {
    getDb().ref('game/players').get().then(snap => {
        const players = snap.val() || {};
        const updates = {};
        for (let id in players) {
            updates[`game/players/${id}/dayVote`] = "none";
        }
        updates['game/vote_state'] = 'voting';
        getDb().ref().update(updates);
    });
}

function serverFinishDayVote() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        
        let tally = {};
        for (let id in players) {
            let v = players[id].dayVote;
            if (v && v !== "none" && players[v] && players[v].isAlive) {
                tally[v] = (tally[v] || 0) + 1;
            }
        }

        let max = 0; let candidate = "none";
        for (let uid in tally) {
            if (tally[uid] > max) { max = tally[uid]; candidate = uid; }
        }

        if (candidate === "none") {
            alert("지목된 투표 내역이 없어 사형 대상자가 선출되지 않았습니다.");
            return;
        }

        const updates = {};
        updates['game/vote_state'] = 'execution_trial';
        updates['game/target_on_trial'] = candidate;
        
        for (let id in players) {
            updates[`game/players/${id}/trialDecision`] = "none";
        }
        getDb().ref().update(updates);
    });
}

function submitExecutionVote(choice) {
    if (!currentUser || currentUser.isAdmin) return;
    getDb().ref(`game/players/${currentUser.id}/isAlive`).get().then(snap => {
        if (!snap.val()) return alert("사망 유령 상태에서는 재판 표결권이 없습니다.");
        getDb().ref(`game/players/${currentUser.id}/trialDecision`).set(choice).then(() => {
            alert("찬반 판결 투표가 제출되었습니다.");
        });
    });
}

function serverCalculateExecution() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const targetUid = gameData.target_on_trial;
        const targetUser = players[targetUid];
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn;

        if (targetUid === "none" || !targetUser) return alert("재판대에 올라간 대상이 없습니다.");

        let exeCount = 0; let revCount = 0;
        for (let id in players) {
            if (players[id].trialDecision === 'execute') exeCount++;
            if (players[id].trialDecision === 'revive') revCount++;
        }

        let reports = [];
        let updates = {};

        if (exeCount >= revCount) {
            if (targetUser.role === 'assemblyman') {
                reports.push(`[최종 재판] 처형 찬성이 많았으나, [${targetUser.nickname}](국회의원) 면책특권 발동으로 부활 생존했습니다!`);
            } else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (테러리스트) 투표 처형`);
                reports.push(`[최종 재판] 테러리스트 [${targetUser.nickname}]이 처형되며 동귀어진 폭탄을 터트렸습니다.`);
                if (targetUser.nightTarget && targetUser.nightTarget !== "none" && players[targetUser.nightTarget]?.isAlive) {
                    updates[`game/players/${targetUser.nightTarget}/isAlive`] = false;
                    updates[`game/players/${targetUser.nightTarget}/deathReason`] = "테러 자폭";
                    historyLogs.push(`제 ${turn}회차 낮: [${players[targetUser.nightTarget].nickname}] 자폭 동반 사망`);
                    reports.push(`↳ 테러 자폭의 여파로 지목 타겟이었던 [${players[targetUser.nightTarget].nickname}] 학생도 사망했습니다.`);
                }
            } else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 학생 투표 처형`);
                reports.push(`[최종 재판] 찬성 ${exeCount}표 / 반대 ${revCount}표로 [${targetUser.nickname}] 학생이 최종 처형되었습니다.`);
            }
        } else {
            reports.push(`[최종 재판] 반대 ${revCount}표의 부활 표결이 많아 [${targetUser.nickname}] 학생의 처형이 철회 및 방면되었습니다.`);
            historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 찬반 재판 부활 면제 성공`);
        }

        let aliveMafia = 0; let aliveCitizen = 0;
        for (let id in players) {
            let stillAlive = players[id].isAlive;
            if (updates[`game/players/${id}/isAlive`] === false) stillAlive = false;
            if (stillAlive) {
                if (players[id].role === 'mafia') aliveMafia++;
                else aliveCitizen++;
            }
        }

        if (aliveMafia === 0) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'citizen_win';
        } else if (aliveMafia >= aliveCitizen) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'mafia_win';
        } else {
            updates['game/status'] = 'day_discuss';
        }

        for (let id in players) {
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        updates['game/morning_report'] = reports.join("\n");
        updates['game/turn'] = turn + 1;
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';

        getDb().ref().update(updates);
    });
}

function renderGameScreen() {
    if (!currentUser) return; 
    
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const status = gameData.status;
        const voteState = gameData.vote_state || 'none';
        const targetOnTrial = gameData.target_on_trial || 'none';
        const report = gameData.morning_report || "";
        const historyLogs = gameData.history_logs || [];
        const hint = gameData.current_hint || "없음";

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        const myData = players[currentUser.id] || { isAlive: true, role: "none" };

        const roleKorean = {
            mafia: "마피아 🔴", citizen: "시민 ⚪", spy: "스파이 🕵️‍♂️", detective: "사립탐정 🔍",
            mudang: "무당 🔮", police: "경찰 👮", doctor: "의사 🩺", soldier: "군인 🪖",
            assemblyman: "국회의원 ⚖️", terrorist: "테러리스트 💣", gangster: "건달 🔨", lovers: "연인 💕"
        };

        const logContainer = document.getElementById('history-log-list');
        if (logContainer) {
            logContainer.innerHTML = historyLogs.slice().reverse().map(log => `<div>• ${log}</div>`).join("");
        }

        const stuVotePanel = document.getElementById('student-vote-panel');
        const voteTitle = document.getElementById('vote-panel-title');
        const voteDesc = document.getElementById('vote-panel-desc');
        const voteAction = document.getElementById('vote-action-area');

        if (status === 'day_discuss') {
            if (voteState === 'voting') {
                if (stuVotePanel) {
                    stuVotePanel.style.display = 'block';
                    voteTitle.innerText = "🗳️ 현재 낮 의심자 투표가 개시되었습니다!";
                    voteDesc.innerText = "아래 격자판에서 마피아로 의심되는 친구 카드를 터치 선택해 주세요.";
                    voteAction.style.display = 'none';
                }
            } else if (voteState === 'execution_trial') {
                if (stuVotePanel) {
                    stuVotePanel.style.display = 'block';
                    const accusedNick = players[targetOnTrial] ? players[targetOnTrial].nickname : "조회불가";
                    voteTitle.innerText = `🚨 최다 투표 대상 사형대 진입: [${accusedNick}]`;
                    voteDesc.innerText = "이 대상을 처형할지, 부활시킬지 찬반 투표를 진행합니다.";
                    voteAction.style.display = myData.isAlive && !currentUser.isAdmin ? 'block' : 'none';
                }
            } else {
                if (stuVotePanel) stuVotePanel.style.display = 'none';
            }
        } else {
            if (stuVotePanel) stuVotePanel.style.display = 'none';
        }

        if (currentUser.isAdmin) {
            const adminPanel = document.getElementById('admin-game-controls');
            if (adminPanel) adminPanel.style.display = 'block';
            
            document.getElementById('admin-start-vote-btn').style.display = (status === 'day_discuss' && voteState === 'none') ? 'block' : 'none';
            document.getElementById('admin-finish-vote-btn').style.display = (status === 'day_discuss' && voteState === 'voting') ? 'block' : 'none';
            document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';

            const monitor = document.getElementById('admin-secret-monitor');
            const tableBody = document.getElementById('admin-live-roles-table');
            if (monitor && tableBody) {
                monitor.style.display = 'block';
                let htmlRows = "";
                for (let id in players) {
                    const p = players[id];
                    const isRevealed = adminRevealMap[id];
                    htmlRows += `
                        <tr ${p.isAlive ? "" : "class='monitor-dead'"}>
                            <td><b>${p.isAlive ? "🟢 생존" : "💀 유령"}</b></td>
                            <td>${p.nickname}</td>
                            <td>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    ${isRevealed ? `<span style='color:#c62828;'>${roleKorean[p.role]}</span>` : `<span style='color:#999;'>🙈 보안 가려짐</span>`}
                                    <button class="secret-reveal-btn" onclick="toggleAdminRoleView('${id}')">${isRevealed ? '가리기' : '직업보기'}</button>
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
                hintBox.innerText = `🔍 단서: ${hint}`;
                hintBox.style.display = 'block';
            } else {
                hintBox.style.display = 'none';
            }
        }

        const rankBtn = document.getElementById('rank-btn');
        if (rankBtn) {
            rankBtn.style.display = (status === 'day_discuss') ? 'block' : 'none';
            if (status === 'day_discuss' && voteState === 'none') {
                // 평소에는 닫아둠
            }
        }

        // [요청사항 5 반영] 능력이 없는 직업들의 밤 안내 텍스트 변경 적용
        if (status === 'day_discuss') {
            if (msgBox) {
                msgBox.innerText = report;
                msgBox.className = "alert-box";
            }
            if (quizBox) quizBox.style.display = 'none';
        } else if (status === 'night_action') {
            if (msgBox) {
                if (!currentUser.isAdmin && (myData.role === 'citizen' || myData.role === 'lovers' || myData.role === 'soldier' || myData.role === 'assemblyman')) {
                    msgBox.innerText = "밤이 되었습니다. 마피아로 의심되는 사람을 선택하세요.";
                } else {
                    msgBox.innerText = "밤이 되었습니다. 고유 능력을 발동할 대상을 찝어 주세요.";
                }
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
        if (turnDisp) turnDisp.innerText = `제 ${gameData.turn || 1}회차 - ${status === 'day_discuss' ? '낮' : '밤'}`;

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

        const logBox = document.getElementById('my-personal-log-box');
        if (logBox && !currentUser.isAdmin) {
            if (myData.personalLog && myData.personalLog !== "none") {
                logBox.style.display = 'block';
                document.getElementById('personal-log-list').innerHTML = myData.personalLog.split("\n").map(l => `<div>• ${l}</div>`).join("");
            } else {
                logBox.style.display = 'none';
            }
        }

        // 연인 상대방의 닉네임 찾기 함수 정의
        let partnerNick = "";
        if (!currentUser.isAdmin && myData.role === 'lovers') {
            for (let targetId in players) {
                if (players[targetId].role === 'lovers' && targetId !== currentUser.id) {
                    partnerNick = players[targetId].nickname;
                    break;
                }
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
                    if ((currentRole === 'citizen' || currentRole === 'lovers' || currentRole === 'soldier' || currentRole === 'assemblyman') && players[currentUser.id].suspect === id) {
                        cardClasses.push('my-selected');
                    } else if (players[currentUser.id].nightTarget === id) {
                        cardClasses.push('my-selected');
                    }
                }

                if (status === 'day_discuss' && voteState === 'voting' && myData.dayVote === id) {
                    cardClasses.push('my-selected');
                }

                if (status === 'day_discuss' && voteState === 'voting') {
                    if (myData.dayVote === id) badgeText = `<span class="badge blue">투표지정</span>`;
                } else if (status === 'night_action' && myData.isAlive) {
                    if (currentRole === 'mafia' && myData.nightTarget === id) badgeText = `<span class="badge">저격대상</span>`;
                    else if (id === myData.nightTarget) badgeText = `<span class="badge green">타겟지정</span>`;
                    else if ((currentRole === 'citizen' || currentRole === 'soldier' || currentRole === 'assemblyman') && id === myData.suspect) badgeText = `<span class="badge green">의심됨</span>`;
                    else if (currentRole === 'lovers' && id === myData.suspect) badgeText = `<span class="badge green">의심됨</span>`;
                }

                // [요청사항 2 반영] 연인끼리만 상단의 상대 연인 이름 실시간 표기 분기문
                let loversAppendText = "";
                if (!currentUser.isAdmin && myData.role === 'lovers' && p.role === 'lovers') {
                    if (id === currentUser.id) {
                        loversAppendText = `<div style="font-size:7.5px; color:#e91e63; font-weight:normal;">(연인: ${partnerNick})</div>`;
                    } else {
                        loversAppendText = `<div style="font-size:7.5px; color:#e91e63; font-weight:normal;">(연인)</div>`;
                    }
                }

                gridContainer.innerHTML += `
                    <div class="${cardClasses.join(' ')}" onclick="handleGridCardClick('${id}')">
                        <span>${p.nickname}</span>
                        ${loversAppendText}
                        ${badgeText}
                    </div>
                `;
            }
        }
    });
}

function handleGridCardClick(targetUid) {
    if (currentUser.isAdmin) return;
    
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const myData = players[currentUser.id];

        if (!myData || !myData.isAlive) return;

        if (gameData.status === 'day_discuss' && gameData.vote_state === 'voting') {
            getDb().ref(`game/players/${currentUser.id}/dayVote`).set(targetUid).then(renderGameScreen);
        } else if (gameData.status === 'night_action') {
            if (currentRole === 'citizen' || currentRole === 'lovers' || currentRole === 'soldier' || currentRole === 'assemblyman') {
                getDb().ref(`game/players/${currentUser.id}/suspect`).set(targetUid).then(renderGameScreen);
            } else {
                getDb().ref(`game/players/${currentUser.id}/nightTarget`).set(targetUid).then(renderGameScreen);
            }
        }
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

// [요청사항 5 반영] 야간 의심 지목 통계를 내림차순 득표수 랭킹 구조로 변환
function toggleSuspectRank() {
    const rBox = document.getElementById('rank-list');
    if (!rBox) return;
    
    if (rBox.style.display === 'block') {
        rBox.style.display = 'none';
        return;
    }

    getDb().ref('game/last_night_suspects').get().then(snap => {
        rBox.innerHTML = '<h4>📢 어젯밤 누적 의심 여론 기록 (득표순 랭킹)</h4>';
        const sData = snap.val();
        if (!sData || sData === "none") {
            rBox.innerHTML += '<div>통계가 없습니다.</div>';
        } else {
            Object.entries(sData).sort((a,b) => b[1] - a[1]).forEach(([nick, count], idx) => {
                rBox.innerHTML += `<div><b>${idx+1}위:</b> ${nick} (${count}표 획득)</div>`;
            });
        }
        rBox.style.display = 'block';
    });
}

function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game/status').get().then(snap => {
        if (snap.val() === 'day_discuss') {
            getDb().ref('game/status').set('night_action');
        } else {
            processNightActions();
        }
    });
}

function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const currentTurnVal = gameData.turn || 1; 
        const quizScore = gameData.quiz_score || 0;
        const historyLogs = gameData.history_logs || [];

        let reports = [];
        let deadList = [];
        const updates = {};
        
        let mafiaTargets = {};
        let protectedUid = "none";
        
        // 스파이 야간 서치 타겟 추적용 변수
        let spyTargetUid = "none";

        for (let id in players) {
            const p = players[id];
            if (!p.isAlive) continue;
            if (p.role === 'mafia' && p.nightTarget && p.nightTarget !== 'none') mafiaTargets[p.nightTarget] = (mafiaTargets[p.nightTarget] || 0) + 1;
            if (p.role === 'doctor' && p.nightTarget && p.nightTarget !== 'none') protectedUid = p.nightTarget;
            if (p.role === 'spy' && p.nightTarget && p.nightTarget !== 'none') spyTargetUid = p.nightTarget;
        }

        // 각 능력자들의 일지 업데이트 로직
        for (let id in players) {
            const p = players[id];
            if (!p.isAlive || p.nightTarget === "none" || !players[p.nightTarget]) continue;
            const t = players[p.nightTarget];
            let line = "";
            let currentLog = p.personalLog === "none" ? "" : (p.personalLog || "");

            if (p.role === 'police') line = `[${currentTurnVal}일차 밤] [${t.nickname}] 조사 -> ${t.role === 'mafia' ? '마피아🔴' : '시민진영⚪'}`;
            
            // [요청사항 7 반영] 무당의 투시 결과를 세부직업이 아닌 시민편/마피아편으로 교정
            if (p.role === 'mudang') {
                const teamSide = (t.role === 'mafia' || t.role === 'spy') ? '마피아 편🔴' : '시민 편⚪';
                line = `[${currentTurnVal}일차 밤] [${t.nickname}] 투시 -> 소속 진영 [${teamSide}]`;
            }
            
            if (p.role === 'detective') line = `[${currentTurnVal}일차 밤] [${t.nickname}] 추적 -> 지목 타겟 [${players[t.nightTarget]?.nickname || '없음'}]`;

            // [요청사항 9 반영] 스파이 정보 조회사항 명시 및 기록 의무화
            if (p.role === 'spy') {
                line = `[${currentTurnVal}일차 밤] [${t.nickname}] 조사 완료 -> 마피아에게 정보가 안전하게 전달되었습니다.`;
            }

            if (line) updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${line}` : line;
        }

        let max = 0; let finalMTarget = "none";
        for (let t in mafiaTargets) {
            if (mafiaTargets[t] > max) { max = mafiaTargets[t]; finalMTarget = t; }
        }

        // [요청사항 6 반영] 연인의 능력 재정의 (대신 죽고 저격당한 연인 살려내기)
        if (finalMTarget !== "none" && finalMTarget !== protectedUid) {
            const targetUser = players[finalMTarget];
            
            if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                updates[`game/players/${finalMTarget}/soldierLife`] = 1;
                reports.push(`군인이 어젯밤 마피아의 기습을 강력한 방패로 막아냈습니다.`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                let mafiaIds = [];
                for (let mId in players) { if (players[mId].role === 'mafia' && players[mId].isAlive) mafiaIds.push(mId); }
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    updates[`game/players/${deadMafia}/deathReason`] = "테러 자폭";
                    reports.push(`테러리스트의 폭사 반격으로 마피아[${players[deadMafia].nickname}]와 테러리스트[${targetUser.nickname}]가 함께 사망했습니다.`);
                }
            } else if (targetUser.role === 'lovers') {
                // 습격당한 연인은 생존하고 다른 파트너 연인을 찾아 대신 유령화 처리
                let substituteUid = "none";
                for (let id in players) {
                    if (players[id].role === 'lovers' && id !== finalMTarget && players[id].isAlive) {
                        substituteUid = id;
                        break;
                    }
                }
                if (substituteUid !== "none") {
                    deadList.push(substituteUid);
                    updates[`game/players/${substituteUid}/deathReason`] = "연인 대신 희생";
                    reports.push(`마피아가 연인인 [${targetUser.nickname}] 학생을 저격했으나, 다른 연인이 대신 몸을 던져 희생하고 파트너를 살려냈습니다.`);
                } else {
                    // 홀로 남은 상황일 경우 자연사 처리
                    deadList.push(finalMTarget);
                    updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                    reports.push(`홀로 외로이 남은 연인 [${targetUser.nickname}] 학생이 마피아의 피습을 받아 사망했습니다.`);
                }
            } else {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                reports.push(`밤사이에 발생한 참혹한 피습 사건으로 인해 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`의사의 헌신적인 수호 덕분에 밤사이 아무도 다치지 않았습니다.`);
        } else {
            reports.push(`밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        // [요청사항 9 반영] 스파이의 조사 멘트 생성 후 아침 보고서(Report)에 임베디드 주입
        if (spyTargetUid !== "none" && players[spyTargetUid]) {
            const spyT = players[spyTargetUid];
            let spyIdentityResult = "직업이 있습니다.";
            if (spyT.role === 'citizen') spyIdentityResult = "시민입니다.";
            if (spyT.role === 'mafia') spyIdentityResult = "마피아입니다.";
            
            reports.push(`[스파이 정보 수집] 어젯밤 스파이가 조사한 결과, [${spyT.nickname}] 학생은 '${spyIdentityResult}' 정보가 마피아 진영에 전달되었습니다.`);
        }

        // 야간의 모든 의심 여론 다중 지목 투표 연산 통합 (득표 랭킹용 자료 수집)
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

        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회차 밤: [${players[d].nickname}] 사망 (${updates[`game/players/${d}/deathReason`]})`);
        });
        if (deadList.length === 0) historyLogs.push(`제 ${currentTurnVal}회차 밤: 아무도 사망하지 않음`);

        let mCount = 0; let cCount = 0;
        for (let id in players) {
            let state = players[id].isAlive;
            if (deadList.includes(id)) state = false;
            if (state) {
                if (players[id].role === 'mafia') mCount++; else cCount++;
            }
        }

        if (mCount === 0) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'citizen_win';
        } else if (mCount >= cCount) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'mafia_win';
        } else {
            updates['game/status'] = 'day_discuss';
        }

        for (let id in players) {
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        updates['game/morning_report'] = reports.join("\n");
        updates['game/turn'] = currentTurnVal + 1;
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = Object.keys(morningSuspectCounts).length > 0 ? morningSuspectCounts : "none";
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';

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
        
        if (winner === 'citizen_win') {
            title.innerText = "🎉 시민 진영 승리! 🎉"; title.style.color = "#4CAF50";
            report.innerText = "마피아 세력을 전원 무력화하여 교실의 정의를 되찾았습니다.";
        } else {
            title.innerText = "🔴 마피아 진영 승리! 🔴"; title.style.color = "#d32f2f";
            report.innerText = "시민 사회가 교묘한 마피아 집단에 의해 완전히 점령되었습니다.";
        }

        const roleKShort = {
            mafia: "마피아", citizen: "시민", spy: "스파이", detective: "사립탐정",
            mudang: "무당", police: "경찰", doctor: "의사", soldier: "군인",
            assemblyman: "국회의원", terrorist: "테러리스트", gangster: "건달", lovers: "연인"
        };

        const mafiaContainer = document.getElementById('final-mafia-list');
        const citizenContainer = document.getElementById('final-citizen-list');
        
        mafiaContainer.innerHTML = "";
        citizenContainer.innerHTML = "";

        for (let id in players) {
            const p = players[id];
            const icon = roleIcons[p.role] || "👤";
            const roleName = roleKShort[p.role] || p.role;
            
            // [요청사항 8 반영] 사망 상태인 경우 명부에 사망 사유 상세 명기
            let statusBadge = "";
            if (p.isAlive) {
                statusBadge = `<span class="char-status-badge alive">🟢 생존</span>`;
            } else {
                const reasonStr = (p.deathReason && p.deathReason !== "none") ? ` (${p.deathReason})` : "";
                statusBadge = `<span class="char-status-badge dead">💀 유령${reasonStr}</span>`;
            }

            const cardHtml = `
                <div class="role-character-card">
                    <div class="char-icon">${icon}</div>
                    <div class="char-nick">${p.nickname}</div>
                    <div class="char-role">${roleName}</div>
                    ${statusBadge}
                </div>
            `;

            if (p.role === 'mafia' || p.role === 'spy') {
                mafiaContainer.innerHTML += cardHtml;
            } else {
                citizenContainer.innerHTML += cardHtml;
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
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
            updates[`game/players/${id}/personalLog`] = "none";
            updates[`game/players/${id}/deathReason`] = "none";
        }

        updates['game/status'] = 'waiting';
        updates['game/turn'] = 1;
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["새로운 대기실 세션이 시작되었습니다."];

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}