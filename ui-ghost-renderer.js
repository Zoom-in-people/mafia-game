/**
 * 5. ui-ghost-renderer.js
 * 사망 유령 스크린 컴팩트 진영 카드 드로잉 및 게임 종료 뷰 핸들러
 */

function renderGhostSection(status, report, msgBox, gameData, players, myData, shamanTargetUid, ghostVotes) {
    const quizBox = document.getElementById('ghost-quiz-section');
    if (!quizBox) return;

    if (status === 'day_discuss') {
        if (msgBox) { msgBox.className = "alert-box"; msgBox.innerText = report; }
        
        // [★요청사항 2 반영] 유령 학생 진영 선택 박스를 컴팩트하게 슬림화 교정
        if (!currentUser.isAdmin && !myData.isAlive && shamanTargetUid !== "none" && players[shamanTargetUid]) {
            quizBox.style.display = 'block';
            document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신";
            document.getElementById('quiz-question').innerText = `[${players[shamanTargetUid].nickname}]의 진영 소속을 감별해 주세요.`;
            
            const myVote = (ghostVotes && ghostVotes[currentUser.id]) ? ghostVotes[currentUser.id] : "";

            // 패딩을 18px -> 8px로 축소하고 마진과 레이아웃을 단정하게 재조정
            document.getElementById('quiz-options').innerHTML = `
                <div style="display: flex; gap: 10px; margin-top: 8px;">
                    <div class="grid-card ${myVote === 'citizen_side' ? 'my-selected' : ''}" 
                         style="flex: 1; border: ${myVote === 'citizen_side' ? '3px solid #1565c0' : '1px solid #4caf50'}; 
                                padding: 8px; font-size: 13px; font-weight: bold; cursor: pointer; text-align: center; 
                                background: ${myVote === 'citizen_side' ? '#e3f2fd' : '#f9fff9'}; 
                                color: ${myVote === 'citizen_side' ? '#1565c0' : '#333'};
                                border-radius: 6px; transition: all 0.1s ease;" 
                         onclick="submitGhostShamanVote('citizen_side')">
                         ⚪ 시민편 ${myVote === 'citizen_side' ? '📊' : ''}
                    </div>
                    <div class="grid-card ${myVote === 'mafia_side' ? 'my-selected' : ''}" 
                         style="flex: 1; border: ${myVote === 'mafia_side' ? '3px solid #c62828' : '1px solid #e53935'}; 
                                padding: 8px; font-size: 13px; font-weight: bold; cursor: pointer; text-align: center; 
                                background: ${myVote === 'mafia_side' ? '#ffebee' : '#fff9f9'}; 
                                color: ${myVote === 'mafia_side' ? '#c62828' : '#333'};
                                border-radius: 6px; transition: all 0.1s ease;" 
                         onclick="submitGhostShamanVote('mafia_side')">
                         🔴 마피아편 ${myVote === 'mafia_side' ? '📊' : ''}
                    </div>
                </div>
            `;
        } else {
            quizBox.style.display = 'none';
        }

    } else if (status === 'night_action') {
        if (!currentUser.isAdmin && !myData.isAlive) {
            quizBox.style.display = 'block';
            document.getElementById('ghost-mission-title').innerText = "👻 유령 전용 과학 미션";
            if (!currentQuiz) generateGhostQuiz(gameData.current_level || "2-1");
        } else {
            quizBox.style.display = 'none';
        }
    }
}

window.submitGhostShamanVote = function(side) {
    if (!currentUser) return;
    getDb().ref(`game/shaman_ghost_votes/${currentUser.id}`).set(side).then(() => {
        console.log("영혼의 진영 선택 완료: " + side);
    });
};

function generateGhostQuiz(level) {
    const pool = quizBank[level] || quizBank["2-1"];
    currentQuiz = pool[Math.floor(Math.random() * pool.length)];
    const qBox = document.getElementById('quiz-question');
    const oBox = document.getElementById('quiz-options');

    if (qBox && oBox) {
        qBox.innerText = currentQuiz.q; oBox.innerHTML = '';
        currentQuiz.a.forEach((opt, idx) => {
            oBox.innerHTML += `<button class="quiz-opt-btn" style="padding:6px; margin-bottom:4px; font-size:13px;" onclick="submitQuizAnswer(${idx})">${idx + 1}. ${opt}</button>`;
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