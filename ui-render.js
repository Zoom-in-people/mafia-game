/**
 * 4. ui-render.js
 * 실시간 상태 감시 기반 렌더링 코어 (새로고침 제로 달성)
 */

function changeQuizLevel(level) {
    if (currentUser && currentUser.isAdmin) {
        getDb().ref('game/current_level').set(level);
    }
}

window.toggleAdminRoleView = function(uid) {
    adminRevealMap[uid] = !adminRevealMap[uid];
    // 실시간 구독중이므로 수동 트리거 없이 즉시 드로잉 연동
    renderGameScreen();
};

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

    renderGameScreen();
}

let isGameScreenListenerAttached = false;

function renderGameScreen() {
    if (!currentUser) return; 

    // 중복 전역 리스너 바인딩 잠금
    if (isGameScreenListenerAttached) return;
    isGameScreenListenerAttached = true;

    // [★실시간 무인 새로고침의 심장] 모든 데이터 변경 발생 시 자동 재출력 구조화
    getDb().ref('game').on('value', (snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const status = gameData.status || "waiting";
        const voteState = gameData.vote_state || 'none';
        const targetOnTrial = gameData.target_on_trial || 'none';
        const report = gameData.morning_report || "";
        const historyLogs = gameData.history_logs || [];
        const hint = gameData.current_hint || "없음";
        const lastNightAssault = gameData.last_night_assault || "none";
        const shamanTargetUid = gameData.shaman_target_uid || "none";
        const ghostVotes = gameData.shaman_ghost_votes || {};

        if (status === 'waiting') {
            isGameScreenListenerAttached = false; // 대기방 폭파 시 잠금 해제
            return;
        }

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        
        // 내 가입 노드가 일시 증발했더라도 튕김을 막는 방어 가드
        const myData = players[currentUser.id] || { isAlive: true, role: "none", dayVote: "none", trialDecision: "none" };

        const roleKorean = {
            mafia: "마피아 🔴", citizen: "시민 ⚪", spy: "스파이 🕵️‍♂️", detective: "사립탐정 🔍",
            mudang: "무당 🔮", police: "경찰 👮", doctor: "의사 🩺", soldier: "군인 🪖",
            assemblyman: "국회의원 ⚖️", terrorist: "테러리스트 💣", gangster: "건달 🔨", lovers: "연인 💕"
        };

        const logContainer = document.getElementById('history-log-list');
        if (logContainer) {
            logContainer.innerHTML = historyLogs.map(log => `<div>• ${log}</div>`).join("");
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        const stuVotePanel = document.getElementById('student-vote-panel');
        const voteTitle = document.getElementById('vote-panel-title');
        const voteDesc = document.getElementById('vote-panel-desc');
        const voteAction = document.getElementById('vote-action-area');
        
        const trialBtnsArea = document.getElementById('trial-interactive-buttons');
        const trialResultTxt = document.getElementById('trial-submit-result-text');

        if (status === 'day_discuss') {
            if (voteState === 'voting') {
                if (stuVotePanel) {
                    stuVotePanel.style.display = 'block';
                    voteTitle.innerText = "🗳️ 현재 낮 의심자 투표 진행 중!";
                    if (lastNightAssault === currentUser.id) {
                        voteDesc.innerHTML = "<span style='color:#d32f2f; font-weight:bold;'>🚨 건달에게 협박당해 투표권을 상실했습니다.</span>";
                    } else {
                        voteDesc.innerText = "마피아로 의심되는 유저 카드를 하단 격자판에서 선택해 주세요.";
                    }
                    voteAction.style.display = 'none';
                }
            } else if (voteState === 'execution_trial') {
                if (stuVotePanel) {
                    stuVotePanel.style.display = 'block';
                    const accusedNick = players[targetOnTrial] ? players[targetOnTrial].nickname : "알 수 없음";
                    voteTitle.innerText = `🚨 사형대 집행 찬반 투표: [${accusedNick}]`;
                    
                    if (!currentUser.isAdmin) {
                        voteAction.style.display = myData.isAlive ? 'block' : 'none';
                        
                        if (myData.trialDecision && myData.trialDecision !== "none") {
                            if (trialBtnsArea) trialBtnsArea.style.display = 'none';
                            if (trialResultTxt) {
                                trialResultTxt.style.display = 'block';
                                trialResultTxt.innerText = myData.trialDecision === 'execute' ? "💀 처형 찬성을 선택하셨습니다." : "😇 부활 반대를 선택하셨습니다.";
                            }
                            voteDesc.innerText = "최종 결정을 제출 완료했습니다. 교사의 정산을 기다리세요.";
                        } else {
                            if (trialBtnsArea) trialBtnsArea.style.display = 'flex';
                            if (trialResultTxt) trialResultTxt.style.display = 'none';
                            voteDesc.innerText = "사형대에 오른 학생을 처형할지 무죄 방면할지 투표해 주세요.";
                        }
                    } else {
                        voteDesc.innerText = "학생들의 찬반 표결 서명을 실시간으로 수집 중입니다.";
                        voteAction.style.display = 'none';
                    }
                }
            } else {
                if (stuVotePanel) stuVotePanel.style.display = 'none';
            }
        } else {
            if (stuVotePanel) stuVotePanel.style.display = 'none';
        }

        // 마스터 교사 컨트롤러 실시간 스위칭 맵
        if (currentUser.isAdmin) {
            document.getElementById('admin-start-vote-btn').style.display = (status === 'day_discuss' && voteState === 'none') ? 'block' : 'none';
            document.getElementById('admin-finish-vote-btn').style.display = (status === 'day_discuss' && voteState === 'voting') ? 'block' : 'none';
            document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';

            const nextBtn = document.getElementById('next-stage-btn');
            if (nextBtn) nextBtn.innerText = (status === 'night_action') ? "🌙 밤 정산 종료 및 낮 개시" : "밤으로 단계 이동";

            const monitor = document.getElementById('admin-secret-monitor');
            const tableBody = document.getElementById('admin-live-roles-table');
            if (monitor && tableBody) {
                monitor.style.display = 'block';
                let htmlRows = "";
                for (let id in players) {
                    const p = players[id]; const isRevealed = adminRevealMap[id];
                    htmlRows += `
                        <tr ${p.isAlive ? "" : "class='monitor-dead'"}>
                            <td><b>${p.isAlive ? "🟢 생존" : "💀 유령"}</b></td>
                            <td>${p.nickname}</td>
                            <td>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    ${isRevealed ? `<span style='color:#c62828;'>${roleKorean[p.role]}</span>` : `<span style='color:#999;'>🙈 가려짐</span>`}
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
                hintBox.innerText = `🔍 단서 배너: ${hint}`; hintBox.style.display = 'block';
            } else { hintBox.style.display = 'none'; }
        }

        const rankBtn = document.getElementById('rank-btn');
        if (rankBtn) rankBtn.style.display = (status === 'day_discuss') ? 'block' : 'none';

        if (status === 'day_discuss') {
            if (msgBox) { msgBox.innerText = report; msgBox.className = "alert-box"; }
            
            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive && shamanTargetUid !== "none" && players[shamanTargetUid]) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신";
                    document.getElementById('quiz-question').innerText = `무당이 [${players[shamanTargetUid].nickname}]에 대해 알려달라고 기도를 올렸습니다.\n이 자의 영혼 진영 소속을 감별하여 투표해 주세요!`;
                    
                    if (ghostVotes && ghostVotes[currentUser.id]) {
                        document.getElementById('quiz-options').innerHTML = `<div style='color:#7b1fa2; font-weight:bold; font-size:12px;'>투표 완료: [${ghostVotes[currentUser.id] === 'citizen_side' ? '시민편' : '마피아편'}] 마킹됨.</div>`;
                    } else {
                        document.getElementById('quiz-options').innerHTML = `
                            <button class="quiz-opt-btn" onclick="submitGhostShamanVote('citizen_side')">⚪ 시민진영 소속이다</button>
                            <button class="quiz-opt-btn" onclick="submitGhostShamanVote('mafia_side')">🔴 마피아진영 소속이다</button>
                        `;
                    }
                } else { quizBox.style.display = 'none'; }
            }

        } else if (status === 'night_action') {
            if (msgBox) {
                msgBox.innerText = report ? `[상황 판결 보고서]\n${report}` : "밤이 되었습니다. 마피아는 대상을 저격하고, 특수 직업은 능력을 발동하세요.";
                msgBox.className = "alert-box night";
            }

            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "👻 유령 전용 과학 미션";
                    if (!currentQuiz) generateGhostQuiz(gameData.current_level || "2-1");
                } else { quizBox.style.display = 'none'; }
            }
        }

        const turnDisp = document.getElementById('turn-display');
        if (turnDisp) turnDisp.innerText = `제 ${gameData.turn || 1}회차 - ${status === 'day_discuss' ? '낮' : '밤'}`;

        const myNickDisp = document.getElementById('my-nick-name');
        const myRoleNameDisp = document.getElementById('my-role-name');
        if (myNickDisp && myRoleNameDisp) {
            if (!currentUser.isAdmin) {
                currentRole = myData.role;
                myNickDisp.innerText = currentUser.nick;
                myRoleNameDisp.innerText = myData.isAlive ? (roleKorean[currentRole] || currentRole) : "사망자 (유령 👻)";
            } else if (currentUser.isAdmin) {
                myNickDisp.innerText = "교사 제어 시스템"; myRoleNameDisp.innerText = "교사 (관전자)";
            }
        }

        const logBox = document.getElementById('my-personal-log-box');
        if (logBox && !currentUser.isAdmin) {
            if (myData.personalLog && myData.personalLog !== "none") {
                logBox.style.display = 'block';
                document.getElementById('personal-log-list').innerHTML = myData.personalLog.split("\n").map(l => `<div>• ${l}</div>`).join("");
                document.getElementById('personal-log-list').scrollTop = document.getElementById('personal-log-list').scrollHeight;
            } else { logBox.style.display = 'none'; }
        }

        let partnerNick = "";
        if (!currentUser.isAdmin && myData.role === 'lovers') {
            for (let targetId in players) {
                if (players[targetId].role === 'lovers' && targetId !== currentUser.id) {
                    partnerNick = players[targetId].nickname; break;
                }
            }
        }

        // 하단 28인 격자판 동적 실시간 매핑 드로잉
        const gridContainer = document.getElementById('player-grid');
        if (gridContainer) {
            gridContainer.innerHTML = '';

            for (let id in players) {
                const p = players[id]; let cardClasses = ['grid-card']; let badgeText = '';
                if (!p.isAlive) cardClasses.push('dead');

                if (status === 'night_action' && !currentUser.isAdmin && myData.isAlive) {
                    if (['citizen', 'lovers', 'soldier', 'assemblyman'].includes(currentRole) && myData.suspect === id) {
                        cardClasses.push('my-selected');
                    } else if (myData.nightTarget === id) {
                        cardClasses.push('my-selected');
                    }
                }

                if (status === 'day_discuss' && voteState === 'voting' && myData.dayVote === id) {
                    cardClasses.push('my-selected');
                }

                if (status === 'day_discuss' && voteState === 'voting') {
                    if (myData.dayVote === id) badgeText = `<span class="badge blue">선택완료</span>`;
                } else if (status === 'night_action' && myData.isAlive) {
                    if (currentRole === 'mafia' && myData.nightTarget === id) badgeText = `<span class="badge">저격지정</span>`;
                    else if (id === myData.nightTarget) badgeText = `<span class="badge green">능력지정</span>`;
                    else if (['citizen', 'soldier', 'assemblyman', 'lovers'].includes(currentRole) && id === myData.suspect) badgeText = `<span class="badge green">의심의결</span>`;
                }

                let loversAppendText = "";
                if (!currentUser.isAdmin && myData.role === 'lovers' && p.role === 'lovers') {
                    loversAppendText = (id === currentUser.id) ? `<div style="font-size:7.5px; color:#e91e63;">(연인: ${partnerNick})</div>` : `<div style="font-size:7.5px; color:#e91e63;">(연인)</div>`;
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
            if (gameData.last_night_assault === currentUser.id) return alert("건달에게 지목당해 투표가 불가능합니다.");
            getDb().ref(`game/players/${currentUser.id}/dayVote`).set(targetUid);
        } else if (gameData.status === 'night_action') {
            if (['citizen', 'lovers', 'soldier', 'assemblyman'].includes(currentRole)) {
                getDb().ref(`game/players/${currentUser.id}/suspect`).set(targetUid);
            } else {
                getDb().ref(`game/players/${currentUser.id}/nightTarget`).set(targetUid);
            }
        }
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
            report.innerText = "교실에 숨어있던 모든 마피아를 색출해 냈습니다!";
        } else {
            title.innerText = "🔴 마피아 진영 승리! 🔴"; title.style.color = "#d32f2f";
            report.innerText = "마피아가 교실을 완전히 장악했습니다.";
        }

        const roleKShort = {
            mafia: "마피아", citizen: "시민", spy: "스파이", detective: "사립탐정",
            mudang: "무당", police: "경찰", doctor: "의사", soldier: "군인",
            assemblyman: "국회의원", terrorist: "테러리스트", gangster: "건달", lovers: "연인"
        };

        const mafiaContainer = document.getElementById('final-mafia-list');
        const citizenContainer = document.getElementById('final-citizen-list');
        mafiaContainer.innerHTML = ""; citizenContainer.innerHTML = "";

        for (let id in players) {
            const p = players[id]; const icon = roleIcons[p.role] || "👤"; const roleName = roleKShort[p.role] || p.role;
            let statusBadge = p.isAlive ? `<span class="char-status-badge alive">🟢 생존</span>` : `<span class="char-status-badge dead">💀 유령 (${p.deathReason || '사망'})</span>`;

            const cardHtml = `
                <div class="role-character-card">
                    <div class="char-icon">${icon}</div>
                    <div class="char-nick">${p.nickname}</div>
                    <div class="char-role">${roleName}</div>
                    ${statusBadge}
                </div>
            `;
            if (p.role === 'mafia' || p.role === 'spy') mafiaContainer.innerHTML += cardHtml;
            else citizenContainer.innerHTML += cardHtml;
        }
    });
}