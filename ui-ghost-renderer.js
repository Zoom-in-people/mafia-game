/**
 * 5. ui-ghost-renderer.js
 * 사망 유령 스크린 컴팩트 진영 카드 및 야간 과학 미션 분리 렌더링 엔진 (타임라인 완벽 매핑판)
 */

function renderGhostSection(status, report, msgBox, gameData, players, myData, shamanTargetUid, ghostVotes) {
    const quizBox = document.getElementById('ghost-quiz-section');
    if (!quizBox) return;

    // [★구조 개혁] 낮과 밤의 타임라인 역할을 명확하게 분리하여 UI 중첩 현상을 원천 방지합니다.
    if (status === 'day_discuss') {
        if (msgBox) { msgBox.className = "alert-box"; msgBox.innerText = report; }
        
        // 1. 낮에는 무조건 [무당의 영매 신호 수신 및 진영 투표]만 활성화합니다. (과학 미션은 철저히 가림)
        if (!currentUser.isAdmin && !myData.isAlive && shamanTargetUid !== "none" && players[shamanTargetUid]) {
            quizBox.style.display = 'block';
            document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신";
            document.getElementById('quiz-question').innerText = `[${players[shamanTargetUid].nickname}]의 진영 소속을 감별해 주세요.`;
            
            const myVote = (ghostVotes && ghostVotes[currentUser.id]) ? ghostVotes[currentUser.id] : "";

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
            // 무당이 밤에 아무도 고르지 않은 판(예: 1회차 낮 등)에는 깔끔하게 영역 차단
            quizBox.style.display = 'none';
        }

    } else if (status === 'night_action') {
        // 2. 밤이 되는 순간, 낮의 영매 투표창은 강제로 증발하고 오직 [유령 전용 과학 미션]만 노출됩니다.
        if (!currentUser.isAdmin && !myData.isAlive) {
            quizBox.style.display = 'block';
            document.getElementById('ghost-mission-title').innerText = "👻 유령 전용 과학 미션";
            
            // 낮의 투표 선택지가 찌꺼기로 노출되어 오류를 유발하는 현상을 깨끗하게 청소 초기화합니다.
            if (!currentQuiz) {
                generateGhostQuiz(gameData.current_level || "2-1");
            }
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
            oBox.innerHTML += `<button class="quiz-opt-btn" style="padding:6px; margin-bottom:4px; font-size:13px; width:100%;" onclick="submitQuizAnswer(${idx})">${idx + 1}. ${opt}</button>`;
        });
    }
}

function submitQuizAnswer(idx) {
    if (idx === currentQuiz.c) {
        alert('정답입니다! 단서 유령 에너지가 1 쌓였습니다.');
        getDb().ref('game/quiz_score').transaction((score) => (score || 0) + 1);
    } else { alert('오답입니다. 다음 문제를 준비합니다.'); }
    currentQuiz = null;
    
    // 문제를 풀고 나면 즉시 렌더러를 다시 돌려 다음 문제를 매끄럽게 준비합니다.
    if (typeof renderGameScreen === 'function') {
        isGameScreenListenerAttached = false; 
        renderGameScreen();
    }
}