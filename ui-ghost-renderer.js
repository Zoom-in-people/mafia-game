/**
 * 5-2. ui-ghost-renderer.js
 * 사망 유령 전용 과학 퀴즈 뱅크 가동 및 낮 시간 무당 지목 타겟 진영 감별 투표 렌더러 (프리징 교정판)
 */

// 유령 화면 인터페이스 허브 함수 (ui-render.js의 실시간 메인 리스너 내부에서 매번 호출됨)
window.renderGhostUI = function(gameData, players) {
    const ghostSection = document.getElementById('ghost-quiz-section');
    if (!ghostSection) return;

    // 1. 로그인 안 했거나 관리자(교사) 계정인 경우 유령방 미션 판넬 숨김
    if (!currentUser || currentUser.isAdmin) {
        ghostSection.style.display = 'none';
        return;
    }

    const myId = currentUser.id;
    const myData = players[myId];

    // 2. 현재 내가 살아있는 생존자라면 유령방 패널을 철저히 숨기고 즉시 종료
    if (!myData || myData.isAlive) {
        ghostSection.style.display = 'none';
        return;
    }

    // 3. [유령 상태 확정] 유령 패널 시각화 활성화
    ghostSection.style.display = 'block';

    const gameStatus = gameData.status || 'day_discuss';
    const shamanTargetUid = gameData.shaman_target_uid || 'none';
    const currentLevel = gameData.quiz_level || '2-1'; // 교사가 설정한 과학 단원 정보

    // -----------------------------------------------------------------
    // [분기 A] 낮 시간 토론 중이고 + 어젯밤 무당이 지목한 영매 타겟이 존재할 때
    // ➡️ 유령 전용 무당 지목 대상 '진영 감별 투표소'로 화면 강제 전환
    // -----------------------------------------------------------------
    if (gameStatus === 'day_discuss' && shamanTargetUid !== 'none' && players[shamanTargetUid]) {
        const targetUser = players[shamanTargetUid];
        const ghostVotes = gameData.shaman_ghost_votes || {};
        const myVoteSide = ghostVotes[myId] || 'none'; 

        document.getElementById('ghost-mission-title').innerHTML = "🔮 [유령방 영매 통신] 무당의 영혼 감별 요청";
        
        const questionText = `⚠️ 어젯밤 무당이 [${targetUser.nickname}] 학생을 신내림 타겟으로 지목했습니다!\n\n먼저 사망한 과학 탐정단 유령들의 직관과 로그 기록을 모아주세요.\n[${targetUser.nickname}] 학생의 진짜 배정 진영은 어디입니까?`;
        document.getElementById('quiz-question').innerText = questionText;

        const optionsContainer = document.getElementById('quiz-options');
        optionsContainer.innerHTML = ''; // 중복 쌓임 청소

        // 버튼 1: 시민 진영 투표 버튼
        const btnCitizen = document.createElement('button');
        btnCitizen.innerText = "⚪ 선량한 시민 편이다";
        btnCitizen.style.margin = "5px 0";
        if (myVoteSide === 'citizen_side') {
            btnCitizen.className = "my-selected";
            btnCitizen.style.backgroundColor = "#1e88e5";
        } else {
            btnCitizen.style.backgroundColor = "#90caf9";
        }
        btnCitizen.onclick = () => submitGhostShamanVote(myId, 'citizen_side');

        // 버튼 2: 마피아 진영 투표 버튼
        const btnMafia = document.createElement('button');
        btnMafia.innerText = "🔴 음흉한 마피아 편이다";
        btnMafia.style.margin = "5px 0";
        if (myVoteSide === 'mafia_side') {
            btnMafia.className = "my-selected";
            btnMafia.style.backgroundColor = "#e53935";
        } else {
            btnMafia.style.backgroundColor = "#ef9a9a";
        }
        btnMafia.onclick = () => submitGhostShamanVote(myId, 'mafia_side');

        optionsContainer.appendChild(btnCitizen);
        optionsContainer.appendChild(btnMafia);
        return; 
    }

    // -----------------------------------------------------------------
    // [분기 B] 밤 시간이거나 + 낮이더라도 무당의 지목 타겟이 없을 때
    // ➡️ 유령 전용 '중학교 과학 복습 퀴즈 레이스' 미션 화면 표출
    // -----------------------------------------------------------------
    document.getElementById('ghost-mission-title').innerHTML = "🧪 [유령 과학 미션] 영혼의 데이터 복원 레이스";
    
    const bank = quizBank[currentLevel] || quizBank["2-1"];
    if (!currentQuiz || !bank.some(q => q.q === currentQuiz.q)) {
        const randomIndex = Math.floor(Math.random() * bank.length);
        currentQuiz = bank[randomIndex];
    }

    document.getElementById('quiz-question').innerText = `🧬 문제: ${currentQuiz.q}`;

    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';

    currentQuiz.a.forEach((optionText, idx) => {
        const optBtn = document.createElement('button');
        optBtn.innerText = `${idx + 1}. ${optionText}`;
        optBtn.style.backgroundColor = "#b3e5fc";
        optBtn.style.color = "#0d47a1";
        optBtn.style.margin = "4px 0";
        optBtn.style.fontSize = "14px";
        
        optBtn.onclick = () => handleGhostSubmitQuiz(idx, currentLevel);
        optionsContainer.appendChild(optBtn);
    });
};

function submitGhostShamanVote(myUid, side) {
    getDb().ref(`game/shaman_ghost_votes/${myUid}`).set(side).then(() => {
        console.log(`🔮 [영매 제보] 무당 타겟 투표 완료 -> ${side}`);
    }).catch(err => console.error("유령 투표 전송 오류:", err));
}

// 과학 퀴즈 정답 제출 판정 프로세서
function handleGhostSubmitQuiz(chosenIdx, currentLevel) {
    if (!currentQuiz) return;

    if (chosenIdx === currentQuiz.c) {
        alert("🎉 정답입니다! 유령들의 염력으로 힌트 복원 게이지를 1점 상승시킵니다.");
        
        // [★버그 1 해결] 프리징 방지: DB를 갱신하기 전에 퀴즈 변수를 먼저 비워야
        // 변화된 점수 리스너가 돌 때 완전히 새로운 문제를 정상적으로 뽑아오게 됩니다.
        currentQuiz = null;

        getDb().ref('game/quiz_score').transaction((currentScore) => {
            return (currentScore || 0) + 1;
        });
    } else {
        alert("❌ 오답입니다! 교과서를 다시 한번 확인해 보세요. 다른 문제로 전환됩니다.");
        
        // [★버그 2 해결] 오답 프리징 방지: 문제를 비운 뒤, 무조건 값이 변하는 타임스탬프 노드를 찔러
        // 전역 리스너가 튕김이나 먹통 없이 강제 화면 리렌더링을 즉시 수행하도록 처리합니다.
        currentQuiz = null; 
        getDb().ref('game/ghost_sync_trigger').set(firebase.database.ServerValue.TIMESTAMP);
    }
}