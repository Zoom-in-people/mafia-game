/**
 * 4. ui-render.js
 * 실시간 상태 감시 기반 렌더링 코어 및 교사용 제어기/현황판 (전체 복구형 완벽판)
 */

function changeQuizLevel(level) {
    if (currentUser && currentUser.isAdmin) {
        getDb().ref('game/current_level').set(level);
    }
}

window.toggleAdminRoleView = function(uid) {
    adminRevealMap[uid] = !adminRevealMap[uid];
    renderGameScreen(); 
};

function triggerGameViewTransition() {
    const gameView = document.getElementById('game-view');
    const gameOverView = document.getElementById('game-over-view');
    const waitingView = document.getElementById('waiting-view');
    const authView = document.getElementById('auth-view');

    if (currentStatus === 'waiting') {
        if (gameView) gameView.style.display = 'none';
        if (gameOverView) gameOverView.style.display = 'none';
        if (waitingView) waitingView.style.display = 'block';
        if (authView) authView.style.display = 'none';
        isGameScreenListenerAttached = false;
        return;
    }

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

getDb().ref('game/last_popup_alert_text').on('value', (snapshot) => {
    const txt = snapshot.val();
    if (txt && txt !== "none" && currentUser) {
        alert(txt);
        if (currentUser.isAdmin) {
            getDb().ref('game/last_popup_alert_text').set("none");
        }
    }
});

function renderGameScreen() {
    if (!currentUser) return; 

    if (isGameScreenListenerAttached) return;
    isGameScreenListenerAttached = true;

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
        const turn = gameData.turn || 1;

        if (status === 'waiting') {
            currentStatus = 'waiting';
            triggerGameViewTransition();
            return;
        }

        const roundTitleEl = document.getElementById('round-title');
        if (roundTitleEl) {
            const phaseTxt = (status === 'day_discuss') ? "낮 ☀️" : "밤 🌙";
            roundTitleEl.innerText = `제 ${turn}회차 - ${phaseTxt}`;
        }

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        
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
                    voteTitle.innerText = "🗳️ 현재 낮 의심자 투표가 개시되었습니다!";
                    if (lastNightAssault === currentUser.id) {
                        voteDesc.innerHTML = "<span style='color:#d32f2f; font-size:15px; font-weight:bold;'>🚨 폭행을 당해 투표를 할 수 없습니다.</span>";
                    } else {
                        voteDesc.innerText = "아래 격자판에서 마피아로 의심되는 친구 카드를 터치 선택해 주세요.";
                    }
                    voteAction.style.display = 'none';
                }
            } else if (voteState === 'execution_trial') {
                if (stuVotePanel) {
                    stuVotePanel.style.display = 'block';
                    const accusedNick = players[targetOnTrial] ? players[targetOnTrial].nickname : "조회불가";
                    voteTitle.innerText = `🚨 최다 투표 대상 사형대 진입: [${accusedNick}]`;
                    
                    if (!currentUser.isAdmin) {
                        voteAction.style.display = 'block';
                        
                        if (myData.trialDecision && myData.trialDecision !== "none") {
                            if (trialBtnsArea) trialBtnsArea.style.display = 'none';
                            if (trialResultTxt) {
                                trialResultTxt.style.display = 'block';
                                trialResultTxt.innerText = myData.trialDecision === 'execute' ? "💀 처형 판결을 최종 선택하셨습니다." : "😇 부활 판결을 최종 선택하셨습니다.";
                            }
                            voteDesc.innerText = "이미 재판 찬반 판결 서명을 완료했습니다.";
                        } else {
                            if (trialBtnsArea) trialBtnsArea.style.display = 'flex';
                            if (trialResultTxt) trialResultTxt.style.display = 'none';
                            voteDesc.innerText = "이 대상을 처형할지, 부활시킬지 찬반 투표를 진행합니다.";
                        }
                    } else {
                        voteDesc.innerText = "학생들의 찬반 표결을 기다리고 있습니다.";
                        voteAction.style.display = 'none';
                    }
                }
            } else {
                if (stuVotePanel) stuVotePanel.style.display = 'none';
            }
        } else {
            if (stuVotePanel) stuVotePanel.style.display = 'none';
        }

        // [교구 필수] ⭐ 교사 전용 수동 제어 패널 버튼 및 실시간 가림막 현황판 스크립트 복원 완료
        if (currentUser.isAdmin) {
            const adminPanel = document.getElementById('admin-game-controls');
            if (adminPanel) adminPanel.style.display = 'block';
            
            document.getElementById('admin-start-vote-btn').style.display = (status === 'day_discuss' && voteState === 'none') ? 'block' : 'none';
            document.getElementById('admin-finish-vote-btn').style.display = (status === 'day_discuss' && voteState === 'voting') ? 'block' : 'none';
            document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';

            const nextBtn = document.getElementById('next-stage-btn');
            if (nextBtn) nextBtn.innerText = (status === 'night_action') ? "🌙 밤 종료" : "밤으로 단계 이동";

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

        if (status === 'day_discuss') {
            if (msgBox) { msgBox.className = "alert-box"; msgBox.innerText = report; }
            
            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive && shamanTargetUid !== "none" && players[shamanTargetUid]) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신 (진영 투표)";
                    document.getElementById('quiz-question').innerText = `무당이 [${players[shamanTargetUid].nickname}] 학생의 실제 직업이 무엇인지 물어보고 있습니다.\n아래 진영 카드 중 원하는 진영을 자유롭게 터치하여 투표해 주세요! (언제든 수정 가능)`;
                    
                    const myVote = (ghostVotes && ghostVotes[currentUser.id]) ? ghostVotes[currentUser.id] : "";

                    document.getElementById('quiz-options').innerHTML = `
                        <div style="display: flex; gap: 14px; margin-top: 15px;">
                            <div class="grid-card ${myVote === 'citizen_side' ? 'my-selected' : ''}" 
                                 style="flex: 1; border: ${myVote === 'citizen_side' ? '4px solid #1565c0' : '2px solid #4caf50'}; 
                                        padding: 18px; font-weight: bold; cursor: pointer; text-align: center; 
                                        background: ${myVote === 'citizen_side' ? '#e3f2fd' : '#f9fff9'}; 
                                        color: ${myVote === 'citizen_side' ? '#1565c0' : '#333'};
                                        box-shadow: ${myVote === 'citizen_side' ? 'inset 0 0 10px rgba(21,101,192,0.2), 0 4px 8px rgba(0,0,0,0.1)' : 'none'};
                                        border-radius: 8px; transition: all 0.1s ease;" 
                                 onclick="submitGhostShamanVote('citizen_side')">
                                 ⚪ 시민 진영 소속 ${myVote === 'citizen_side' ? '📊' : ''}
                            </div>
                            <div class="grid-card ${myVote === 'mafia_side' ? 'my-selected' : ''}" 
                                 style="flex: 1; border: ${myVote === 'mafia_side' ? '4px solid #c62828' : '2px solid #e53935'}; 
                                        padding: 18px; font-weight: bold; cursor: pointer; text-align: center; 
                                        background: ${myVote === 'mafia_side' ? '#ffebee' : '#fff9f9'}; 
                                        color: ${myVote === 'mafia_side' ? '#c62828' : '#333'};
                                        box-shadow: ${myVote === 'mafia_side' ? 'inset 0 0 10px rgba(198,40,40,0.2), 0 4px 8px rgba(0,0,0,0.1)' : 'none'};
                                        border-radius: 8px; transition: all 0.1s ease;" 
                                 onclick="submitGhostShamanVote('mafia_side')">
                                 🔴 마피아 진영 소속 ${myVote === 'mafia_side' ? '📊' : ''}
                            </div>
                        </div>
                    `;
                } else {
                    quizBox.style.display = 'none';
                }
            }

        } else if (status === 'night_action') {
            if (msgBox) {
                msgBox.className = "alert-box night";
                msgBox.innerText = report ? `[재판 마감 보고서]\n${report}` : "밤이 되었습니다. 고유 능력을 발동할 대상을 찝어 주세요.";
            }

            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "👻 유령 전용 과학 미션 (정답 시 단서 게이지 누적)";
                    if (!currentQuiz) generateGhostQuiz(gameData.current_level || "2-1");
                } else {
                    quizBox.style.display = 'none';
                }
            }
        }

        if (hintBox) {
            if (hint !== "없음" && status === 'day_discuss') {
                hintBox.innerText = `🔍 단서: ${hint}`; hintBox.style.display = 'block';
            } else { hintBox.style.display = 'none'; }
        }

        const rankBtn = document.getElementById('rank-btn');
        if (rankBtn) rankBtn.style.display = (status === 'day_discuss') ? 'block' : 'none';

        const myNickDisp = document.getElementById('my-nick-name');
        const myRoleNameDisp = document.getElementById('my-role-name');
        if (myNickDisp && myRoleNameDisp) {
            if (!currentUser.isAdmin) {
                currentRole = myData.role;
                myNickDisp.innerText = currentUser.nick;
                myRoleNameDisp.innerText = myData.isAlive ? (roleKorean[currentRole] || currentRole) : "사망자 (유령 👻)";
            } else if (currentUser.isAdmin) {
                myNickDisp.innerText = "교사 시스템 계정"; myRoleNameDisp.innerText = "교사 (관전자)";
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
                    if (myData.dayVote === id) badgeText = `<span class="badge blue">투표지정</span>`;
                } else if (status === 'night_action' && myData.isAlive) {
                    if (currentRole === 'mafia' && myData.nightTarget === id) badgeText = `<span class="badge">저격대상</span>`;
                    else if (id === myData.nightTarget) badgeText = `<span class="badge green">타겟지정</span>`;
                    else if (['citizen', 'soldier', 'assemblyman'].includes(currentRole) && id === myData.suspect) badgeText = `<span class="badge green">의심됨</span>`;
                }

                let loversAppendText = "";
                if (!currentUser.isAdmin && myData.role === 'lovers' && p.role === 'lovers') {
                    loversAppendText = (id === currentUser.id) ? `<div style="font-size:7.5px; color:#e91e63; font-weight:normal;">(연인: ${partnerNick})</div>` : `<div style="font-size:7.5px; color:#e91e63; font-weight:normal;">(연인)</div>`;
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

window.handleGridCardClick = function(targetUid) {
    if (currentUser.isAdmin) return;

    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const myData = players[currentUser.id];

        if (!myData || !myData.isAlive) return;
        const myActualRole = myData.role || "none";

        if (gameData.status === 'day_discuss' && gameData.vote_state === 'voting') {
            if (gameData.last_night_assault === currentUser.id) {
                alert("당신은 어젯밤 건달에게 폭행을 당해 오늘 낮 투표를 하실 수 없습니다!");
                return;
            }
            getDb().ref(`game/players/${currentUser.id}/dayVote`).set(targetUid);
        } else if (gameData.status === 'night_action') {
            if (['citizen', 'lovers', 'soldier', 'assemblyman'].includes(myActualRole)) {
                getDb().ref(`game/players/${currentUser.id}/suspect`).set(targetUid);
            } else {
                getDb().ref(`game/players/${currentUser.id}/nightTarget`).set(targetUid);
            }
        }
    }).catch(err => console.error("격자 카드 클릭 처리 오류:", err));
};

window.submitTrialDecision = function(decisionType) {
    if (!currentUser || currentUser.isAdmin) return;
    getDb().ref(`game/players/${currentUser.id}/isAlive`).get().then(snap => {
        if (!snap.val()) return alert("사망 유령 상태에서는 재판 표결권이 없습니다.");
        getDb().ref(`game/players/${currentUser.id}/trialDecision`).set(decisionType);
    });
};

window.submitGhostShamanVote = function(side) {
    if (!currentUser) return;
    getDb().ref(`game/shaman_ghost_votes/${currentUser.id}`).set(side).then(() => {
        console.log("영혼의 진영 선택 완료: " + side);
    });
};

window.handleClearShamanVote = function() {
    if (!currentUser) return;
    getDb().ref(`game/shaman_ghost_votes/${currentUser.id}`).remove().then(() => {
        console.log("투표 초기화 완료");
    });
};

window.toggleSuspectRank = function() {
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
    }).catch(err => console.error("랭킹 로드 오류:", err));
};

function generateGhostQuiz(level) {
    const pool = quizBank[level] || quizBank["2-1"];
    currentQuiz = pool[Math.floor(Math.random() * pool.length)];
    const qBox = document.getElementById('quiz-question');
    const oBox = document.getElementById('quiz-options');

    if (qBox && oBox) {
        qBox.innerText = currentQuiz.q; oBox.innerHTML = '';
        currentQuiz.a.forEach((opt, idx) => {
            oBox.innerHTML += `<button class="quiz-opt-btn" onclick="submitQuizAnswer(${idx})">${idx + 1}. ${opt}</button>`;
        });
    }
}

function submitQuizAnswer(idx) {
    if (idx === currentQuiz.c) {
        alert('정답입니다! 단서 유령 에너지가 1 쌓였습니다.');
        getDb().ref('game/quiz_score').transaction((score) => (score || 0) + 1);
    } else { alert('오답입니다. 다음 문제를 준비합니다.'); }
    currentQuiz = null;
    renderGameScreen();
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