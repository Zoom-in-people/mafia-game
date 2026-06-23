/**
 * 4. ui-render.js
 * 실시간 상태 감시 기반 렌더링 코어 및 교사용 제어기/현황판 완전 복구판
 */

// 대기실 난이도 조정
function changeQuizLevel(level) {
    if (currentUser && currentUser.isAdmin) {
        getDb().ref('game/current_level').set(level);
    }
}

// 교사용 개별 비밀 가림막 해제/잠금 토글
window.toggleAdminRoleView = function(uid) {
    adminRevealMap[uid] = !adminRevealMap[uid];
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

// 원본 기반 실시간 전역 팝업(alert) 수신기 파이프라인 연동
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

    // 중복 리스너 중복 가동 절대 차단 가드
    if (isGameScreenListenerAttached) return;
    isGameScreenListenerAttached = true;

    // 파이어베이스 데이터 체인지 실시간 트리거 구독 (.on 가동으로 새로고침 0% 달성)
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
            isGameScreenListenerAttached = false; // 대기방 복원 시 리스너 락 해제
            return;
        }

        const msgBox = document.getElementById('status-message');
        const hintBox = document.getElementById('hint-display');
        const quizBox = document.getElementById('ghost-quiz-section');
        
        // 내 세션 임시 누락 방어용 가드 객체 생성
        const myData = players[currentUser.id] || { isAlive: true, role: "none", dayVote: "none", trialDecision: "none" };

        const roleKorean = {
            mafia: "마피아 🔴", citizen: "시민 ⚪", spy: "스파이 🕵️‍♂️", detective: "사립탐정 🔍",
            mudang: "무당 🔮", police: "경찰 👮", doctor: "의사 🩺", soldier: "군인 🪖",
            assemblyman: "국회의원 ⚖️", terrorist: "테러리스트 💣", gangster: "건달 🔨", lovers: "연인 💕"
        };

        // 역사 히스토리 하단 정방향 누적 스크롤바 세팅
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
                        voteAction.style.display = myData.isAlive ? 'block' : 'none';
                        
                        if (myData.trialDecision && myData.trialDecision !== "none") {
                            if (trialBtnsArea) trialBtnsArea.style.display = 'none';
                            if (trialResultTxt) {
                                trialResultTxt.style.display = 'block';
                                trialResultTxt.innerText = myData.trialDecision === 'execute' ? "💀 처형 판결을 선택하였습니다." : "😇 부활 판결을 선택하였습니다.";
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

        // ⭐ [완벽 복구] 교사용 동적 조종 버튼 패널 및 실시간 비밀 모니터 보드 원상복구 연동
        if (currentUser.isAdmin) {
            const adminPanel = document.getElementById('admin-game-controls');
            if (adminPanel) adminPanel.style.display = 'block';
            
            document.getElementById('admin-start-vote-btn').style.display = (status === 'day_discuss' && voteState === 'none') ? 'block' : 'none';
            document.getElementById('admin-finish-vote-btn').style.display = (status === 'day_discuss' && voteState === 'voting') ? 'block' : 'none';
            document.getElementById('admin-apply-execution-btn').style.display = (status === 'day_discuss' && voteState === 'execution_trial') ? 'block' : 'none';

            // 교사용 단계 변환 버튼 글자 고정
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

        if (hintBox) {
            if (hint !== "없음" && status === 'day_discuss') {
                hintBox.innerText = `🔍 단서: ${hint}`; hintBox.style.display = 'block';
            } else { hintBox.style.display = 'none'; }
        }

        const rankBtn = document.getElementById('rank-btn');
        if (rankBtn) rankBtn.style.display = (status === 'day_discuss') ? 'block' : 'none';

        // 낮과 밤의 상단 인게임 텍스트 출력 교차 렌더링부
        if (status === 'day_discuss') {
            if (msgBox) { msgBox.innerText = report; msgBox.className = "alert-box"; }
            
            // 낮 시간 유령 전용 영매 감별 보드 활성화
            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive && shamanTargetUid !== "none" && players[shamanTargetUid]) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신";
                    document.getElementById('quiz-question').innerText = `무당이 [${players[shamanTargetUid].nickname}]에 대해 알려달라고 기도를 올렸습니다.\n이 자의 영혼 진영 소속을 감별하여 투표해 주세요!`;
                    
                    if (ghostVotes && ghostVotes[currentUser.id]) {
                        document.getElementById('quiz-options').innerHTML = `<div style='color:#7b1fa2; font-weight:bold; font-size:12px;'>감별 투표 완료: [${ghostVotes[currentUser.id] === 'citizen_side' ? '시민편' : '마피아편'}]을 마킹했습니다.</div>`;
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
                msgBox.innerText = report ? `[재판 마감 보고서]\n${report}` : "밤이 되었습니다. 고유 능력을 발동할 대상을 찝어 주세요.";
                msgBox.className = "alert-box night";
            }

            // 밤이 되면 과학 퀴즈 상자로 실시간 교체
            if (quizBox) {
                if (!currentUser.isAdmin && !myData.isAlive) {
                    quizBox.style.display = 'block';
                    document.getElementById('ghost-mission-title').innerText = "👻 유령 전용 과학 미션 (정답 시 단서 게이지 누적)";
                    if (!currentQuiz) generateGhostQuiz(gameData.current_level || "2-1");
                } else { quizBox.style.display = 'none'; }
            }
        }

        // 인적 사항 이름 바인딩
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

        // 야간 개인 일지 기록 하단 적재 스크롤 세팅
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

        // 28인 가변 격자판 실시간 드로잉
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
                    else if (currentRole === 'lovers' && id === myData.suspect) badgeText = `<span class="badge green">의심됨</span>`;
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

function handleGridCardClick(targetUid) {
    if (currentUser.isAdmin) return;
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const myData = players[currentUser.id];

        if (!myData || !myData.isAlive) return;

        if (gameData.status === 'day_discuss' && gameData.vote_state === 'voting') {
            if (gameData.last_night_assault === currentUser.id) {
                alert("당신은 어젯밤 건달에게 폭행을 당해 오늘 낮 투표를 하실 수 없습니다!");
                return;
            }
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