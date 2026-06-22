const getDb = () => {
    if (window.sharedDatabase) return window.sharedDatabase;
    return firebase.database();
};

let currentUser = null;
let currentRole = "none";
let currentStatus = "waiting";
let currentQuiz = null;

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
        if (!currentUser) return; // 전역 안전 장치 추가
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

    // 로그인 직후 강제로 상태 동기화 재트리거
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

        if (total >= 26) {
            rolePool = ["mafia", "mafia", "mafia", "mafia", "spy", "detective", "mudang", "police", "doctor", "soldier", "assemblyman", "terrorist", "gangster", "lovers", "lovers"];
        } else if (total >= 22) {
            rolePool = ["mafia", "mafia", "mafia", "spy", "detective", "mudang", "police", "doctor", "soldier", "assemblyman", "terrorist", "lovers", "lovers"];
        } else {
            rolePool = ["mafia", "mafia", "mafia", "detective", "mudang", "police", "doctor", "soldier", "terrorist", "gangster"];
        }

        while (rolePool.length < total) {
            rolePool.push("citizen");
        }
        if (rolePool.length > total) {
            rolePool = rolePool.slice(0, total);
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
            updates[`game/players/${uid}/soldierLife`] = 2;
        });

        updates['game/status'] = 'day_discuss';
        updates['game/turn'] = 1;
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 자유롭게 대화하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";

        getDb().ref().update(updates);
    });
}

// [근본 에러 수정 완료] 로그인 전 비인증 유저 상태일 경우 렌더링 조작 및 상태 조회를 차단하는 1중 안전 가드 추가
getDb().ref('game/status').on('value', (snapshot) => {
    currentStatus = snapshot.val();
    if (!currentUser) return; // 로그인 상태가 아니면 리스너 신호를 가로막아 null 터짐을 원천 방지함

    if (currentStatus === 'waiting') {
        // 대기 상태로 초기화됐을 경우 화면 처리구조
        document.getElementById('waiting-view').style.display = 'block';
        document.getElementById('game-view').style.display = 'none';
        document.getElementById('game-over-view').style.display = 'none';
        return;
    }

    triggerGameViewTransition();
});

// 화면 전환 통합 함수 격리 처리구조
function triggerGameViewTransition() {
    if (currentStatus === 'game_over') {
        document.getElementById('game-view').style.display = 'none';
        document.getElementById('game-over-view').style.display = 'block';
        if (currentUser.isAdmin) {
            const resetPanel = document.getElementById('admin-reset-controls');
            if (resetPanel) resetPanel.style.display = 'block';
        }
        renderGameOverScreen();
        return;
    } else {
        document.getElementById('game-over-view').style.display = 'none';
    }

    document.getElementById('waiting-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'block';

    if (currentRole === 'mafia' && currentStatus === 'night_action') {
        getDb().ref('game/mafia_targets').on('value', () => { renderGameScreen(); });
    } else {
        getDb().ref('game/mafia_targets').off();
    }

    renderGameScreen();
}

function renderGameScreen() {
    if (!currentUser) return; // 2중 안전 장치
    
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const status = gameData.status;
        const turn = gameData.turn;
        const mafiaTargets = gameData.mafia_targets || {};
        const report = gameData.morning_report || "";
        const hint = gameData.current_hint || "없음";

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        const myData = players[currentUser.id] || { isAlive: true };

        if (currentUser.isAdmin) {
            const adminPanel = document.getElementById('admin-game-controls');
            if (adminPanel) adminPanel.style.display = 'block';
        }

        if (hintBox) {
            if (hint !== "없음" && status === 'day_discuss') {
                hintBox.innerText = `🔍 유령들이 풀어서 획득한 단서: ${hint}`;
                hintBox.style.display = 'block';
            } else {
                hintBox.style.display = 'none';
            }
        }

        if (status === 'day_discuss') {
            if (msgBox) {
                msgBox.innerText = report;
                msgBox.className = "alert-box";
            }
            if (quizBox) quizBox.style.display = 'none';
            if (currentUser.isAdmin) {
                const nextBtn = document.getElementById('next-stage-btn');
                if (nextBtn) nextBtn.innerText = "다음 단계로 (밤으로 이동)";
            }
        } else if (status === 'night_action') {
            if (msgBox) {
                msgBox.innerText = "밤이 되었습니다. 각자의 능력을 사용하거나 의심 대상을 메모하세요.";
                msgBox.className = "alert-box night";
            }
            if (currentUser.isAdmin) {
                const nextBtn = document.getElementById('next-stage-btn');
                if (nextBtn) nextBtn.innerText = "다음 단계로 (아침 결과 처리)";
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

        const myRoleNameDisp = document.getElementById('my-role-name');
        if (myRoleNameDisp) {
            if (!currentUser.isAdmin && players[currentUser.id]) {
                currentRole = players[currentUser.id].role;
                const roleKorean = {
                    mafia: "마피아 🔴", citizen: "시민 ⚪", spy: "스파이 🕵️‍♂️", detective: "사립탐정 🔍",
                    mudang: "무당 🔮", police: "경찰 👮", doctor: "의사 🩺", soldier: "군인 🪖",
                    assemblyman: "국회의원 ⚖️", terrorist: "테러리스트 💣", gangster: "건달 🔨", lovers: "연인 💕"
                };
                myRoleNameDisp.innerText = myData.isAlive ? (roleKorean[currentRole] || currentRole) : "사망자 (유령 👻)";
            } else if (currentUser.isAdmin) {
                myRoleNameDisp.innerText = "교사 (관전자)";
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

                if (status === 'night_action' && currentRole === 'mafia' && myData.isAlive) {
                    let mCount = 0;
                    for (let mUid in mafiaTargets) {
                        if (mafiaTargets[mUid] === id) mCount++;
                    }
                    if (mCount > 0) badgeText = `<span class="badge">의심됨(${mCount})</span>`;
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

function handleCardClick(targetUid) {
    if (currentStatus !== 'night_action' || currentUser.isAdmin) return;

    getDb().ref(`game/players/${targetUid}`).get().then((snapshot) => {
        // 내 생존 여부 재검사 가드 처리구조
        return getDb().ref(`game/players/${currentUser.id}`).get();
    }).then((mySnap) => {
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

    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        let counts = {};

        for (let id in players) {
            const suspectId = players[id].suspect;
            if (suspectId && suspectId !== "none" && players[suspectId] && players[suspectId].isAlive) {
                const sNick = players[suspectId].nickname;
                counts[sNick] = (counts[sNick] || 0) + 1;
            }
        }

        let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        rankListBox.innerHTML = '<h4>현재 생존자 의심 투표 순위</h4>';
        if (sorted.length === 0) rankListBox.innerHTML += '<div>아직 집계된 의심 투표가 없습니다.</div>';
        
        sorted.forEach(([nick, count], index) => {
            rankListBox.innerHTML += `<div>${index + 1}위: ${nick} (${count}표)</div>`;
        });
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

function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const mafiaTargets = gameData.mafia_targets || {};
        const turn = gameData.turn;
        const quizScore = gameData.quiz_score || 0;

        let reports = [];
        let deadList = [];
        
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

        if (finalMafiaTarget !== "none" && finalMafiaTarget !== protectedUser) {
            const targetUser = players[finalMafiaTarget];
            
            if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                getDb().ref(`game/players/${finalMafiaTarget}/soldierLife`).set(1);
                reports.push(`군인인 누군가가 밤사이에 강력한 습격을 버텨냈습니다.`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMafiaTarget);
                let mafiaIds = Object.keys(mafiaTargets);
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    reports.push(`테러리스트의 기지로 습격하려던 마피아[${players[deadMafia].nickname}]와 테러리스트[${targetUser.nickname}]가 동반 사망했습니다.`);
                }
            } else if (targetUser.role === 'lovers') {
                deadList.push(finalMafiaTarget);
                for (let id in players) {
                    if (players[id].role === 'lovers' && id !== finalMafiaTarget) {
                        deadList.push(id);
                        reports.push(`연인 중 한 명인 [${targetUser.nickname}]이 습격을 받자 다른 연인도 함께 쓰러졌습니다.`);
                    }
                }
            } else {
                deadList.push(finalMafiaTarget);
                reports.push(`밤사이에 참혹한 습격으로 인해 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMafiaTarget !== "none" && finalMafiaTarget === protectedUser) {
            reports.push(`의사의 기적적인 치료 덕분에 밤사이에 아무도 죽지 않았습니다.`);
        } else {
            reports.push(`밤사이에 아무런 소동도 일어나지 않았습니다.`);
        }

        let nextHint = "없음";
        if (quizScore >= 2) {
            let longestNameMafia = "";
            let shortestNameMafia = "";
            for (let id in players) {
                if (players[id].role === 'mafia' && players[id].isAlive) {
                    const nick = players[id].nickname;
                    if (!longestNameMafia || nick.length > longestNameMafia.length) longestNameMafia = nick;
                    if (!shortestNameMafia || nick.length < shortestNameMafia.length) shortestNameMafia = nick;
                }
            }
            if (longestNameMafia && longestNameMafia.length > 3) {
                nextHint = "마피아 중 한 명의 닉네임은 3글자보다 깁니다.";
            } else if (shortestNameMafia) {
                nextHint = "마피아 중 한 명의 닉네임은 4글자 이하입니다.";
            }
        }

        const updates = {};
        deadList.forEach(dUid => {
            updates[`game/players/${dUid}/isAlive`] = false;
            if (players[dUid]) players[dUid].isAlive = false;
        });

        let aliveMafiaCount = 0;
        let aliveCitizenSideCount = 0;

        for (let id in players) {
            if (players[id].isAlive) {
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

        for (let id in players) {
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        updates['game/morning_report'] = reports.join("\n");
        updates['game/turn'] = turn + 1;
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = nextHint;

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
        }

        updates['game/status'] = 'waiting';
        updates['game/turn'] = 0;
        updates['game/current_hint'] = "없음";

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}