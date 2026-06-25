/**
 * 4. ui-render.js
 * 실시간 상태 감시 기반 생존자 화면 및 교사용 제어반 렌더링 메인 코어
 */

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
        if (typeof renderGameOverScreen === 'function') renderGameOverScreen();
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

        // 유령 전용 뷰 드로잉 파트 분리 이월 (`ui-ghost-renderer.js`에서 위임 처리)
        if (typeof renderGhostSection === 'function') {
            renderGhostSection(status, report, msgBox, gameData, players, myData, shamanTargetUid, ghostVotes);
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