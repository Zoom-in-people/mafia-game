/**
 * 5. ui-ghost-renderer.js
 * 사망 유령 스크린 컴팩트 진영 카드 및 야간 과학 미션 분리 렌더링 엔진 (버그 교정판)
 */

function renderGhostSection(status, report, msgBox, gameData, players, myData, shamanTargetUid, ghostVotes) {
    const quizBox = document.getElementById('ghost-quiz-section');
    if (!quizBox) return;

    // [★버그 해결 2-1] 파이어베이스 원본 트리의 실시간 대소문자 데이터 필드명을 다이렉트로 추적하도록 안전 패치
    const liveShamanTargetUid = gameData.shaman_target_uid || "none";
    const liveGhostVotes = gameData.shaman_ghost_votes || {};

    if (status === 'day_discuss') {
        if (msgBox) { msgBox.className = "alert-box"; msgBox.innerText = report; }
        
        // [★버그 해결 2-2] 증발했던 유령 투표 보드를 실시간 노드 감지 조건식을 통해 완벽하게 다시 부활시켰습니다.
        if (!currentUser.isAdmin && !myData.isAlive && liveShamanTargetUid !== "none" && players[liveShamanTargetUid]) {
            quizBox.style.display = 'block';
            document.getElementById('ghost-mission-title').innerText = "🔮 무당의 영매 신호 수신";
            document.getElementById('quiz-question').innerText = `무당이 지목한 [${players[liveShamanTargetUid].nickname}] 학생의 실제 진영 소속을 감별 투표해 주세요.`;
            
            const myVote = liveGhostVotes[currentUser.id] || "";

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
    
    if (typeof renderGameScreen === 'function') {
        isGameScreenListenerAttached = false; 
        renderGameScreen();
    }
}