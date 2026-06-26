/**
 * 3-1. game-mechanics.js
 * 파이어베이스 독립형 순수 규칙/투표/승리 판정 연산 엔진
 */

/**
 * [연산 1] 낮 의심자 지목 투표 결과 집계 및 동표 루프 계산
 * @param {Object} players - 현재 room의 플레이어 전체 오브젝트
 * @param {string} lastNightAssault - 어젯밤 건달에게 폭행당한 유저 UID (투표권 박탈)
 * @param {number} currentRetry - 현재 회차의 동표 재투표 횟수
 * @returns {Object} { status: "success"|"retry"|"forced_trial", candidate: string, nextRetry: number }
 */
function calculateDayVoteResult(players, lastNightAssault, currentRetry) {
    let voteCounts = {}; // uid -> 득표수
    let totalVotes = 0;

    // 1. 살아있는 생존자들의 투표권 전수 집계
    for (let id in players) {
        if (!players[id].isAlive) continue; // 사망자는 투표권 없음
        if (id === lastNightAssault) continue; // 건달에게 폭행당한 유저 투표권 봉쇄

        const targetUid = players[id].dayVote;
        // 유효한 유저에게 투표한 경우에만 카운트 누적
        if (targetUid && targetUid !== "none" && players[targetUid] && players[targetUid].isAlive) {
            voteCounts[targetUid] = (voteCounts[targetUid] || 0) + 1;
            totalVotes++;
        }
    }

    // 만약 투표에 참여한 학생이 아무도 없다면 재판 없이 낮 종료 리턴
    if (totalVotes === 0) {
        return { status: "success", candidate: "none" };
    }

    // 2. 최다 득표수 및 최다 득표자(후보군) 추출
    let maxVotes = 0;
    let candidates = [];

    Object.entries(voteCounts).forEach(([uid, count]) => {
        if (count > maxVotes) {
            maxVotes = count;
            candidates = [uid]; // 최다 득표자 갱신
        } else if (count === maxVotes) {
            candidates.push(uid); // 동표 발생 시 후보군에 추가
        }
    });

    // 3. 동표 예외 처리 분기 연산
    if (candidates.length > 1) {
        const nextRetry = currentRetry + 1;
        if (nextRetry < 3) {
            // 1~2회차 동표: 다시 투표하도록 리턴
            return { status: "retry", nextRetry: nextRetry };
        } else {
            // 3회차에도 최종 동표일 때: 교실 수업 지연 방지를 위해 후보 중 1명 랜덤 강제 소환
            const randomPick = candidates[Math.floor(Math.random() * candidates.length)];
            return { status: "forced_trial", candidate: randomPick };
        }
    }

    // 동표 없이 깔끔하게 1명이 결정된 경우 사형대 진출 확정
    return { status: "success", candidate: candidates[0] };
}


/**
 * [연산 2] 사형대 처형 vs 무죄 부활 찬반 재판 표결 정산
 * @param {Object} players - 플레이어 전체 오브젝트
 * @param {string} targetUid - 사형대에 올라간 학생의 UID
 * @param {number} tRetry - 현재 찬반 재투표 회수
 * @returns {Object} { status: "success"|"retry", isExecuted: boolean, nextTRetry: number, exeCount, revCount }
 */
function calculateTrialExecution(players, targetUid, tRetry) {
    let exeCount = 0; // 처형(execute) 표수
    let revCount = 0; // 부활(revive) 표수

    // 생존자들의 최종 찬반 서명 판결 집계
    for (let id in players) {
        if (!players[id].isAlive) continue; // 사망 유령은 표결권 없음
        
        if (players[id].trialDecision === 'execute') exeCount++;
        if (players[id].trialDecision === 'revive') revCount++;
    }

    // 찬성/반대 완벽한 동표 발생 시 예외 처리
    if (exeCount === revCount && (exeCount > 0 || revCount > 0)) {
        const nextTRetry = tRetry + 1;
        if (nextTRetry < 3) {
            // 1~2회차 동표: 찬반 판결 재투표 가동
            return { status: "retry", nextTRetry: nextTRetry, exeCount: exeCount, revCount: revCount };
        } else {
            // 3회차 최종 동표 시: '의심스러울 때는 피고인의 이익으로' 규정에 의거 무죄 부활 면제 처리
            return { status: "success", isExecuted: false, nextTRetry: 0, exeCount: exeCount, revCount: revCount };
        }
    }

    // 과반수 결과 계산 (처형 표가 더 많으면 최종 처형)
    const isExecuted = exeCount > revCount;
    return { status: "success", isExecuted: isExecuted, nextTRetry: 0, exeCount: exeCount, revCount: revCount };
}


/**
 * [연산 3] 마피아 vs 시민 진영 최종 실시간 승리 조건 검증 엔진
 * @param {Object} players - 플레이어 전체 오브젝트
 * @param {Object} pendingUpdates - 이번 턴에 반영될 파이어베이스 백엔드 업데이트 예정 스니펫
 * @returns {string} "citizen_win" | "mafia_win" | "continue"
 */
function checkVictoryFaction(players, pendingUpdates) {
    let aliveMafia = 0;
    let aliveCitizen = 0;

    for (let id in players) {
        // [레이스 컨디션 방지 가드] 현재 생사 상태를 보되, 이번 정산에서 죽을 예정(isAlive: false)인 유저면 사망자로 조기 계산
        let isStillAlive = players[id].isAlive;
        if (pendingUpdates && pendingUpdates[`game/players/${id}/isAlive`] === false) {
            isStillAlive = false;
        }

        if (isStillAlive) {
            // 마피아 머릿수와 시민 진영 머릿수를 각각 분리 카운트
            if (players[id].role === 'mafia') {
                aliveMafia++;
            } else {
                // 기존 규칙에 의거, 스파이를 포함한 모든 특수직업 및 일반 시민은 시민 머릿수로 합산 계산
                aliveCitizen++;
            }
        }
    }

    // 판정 분기 1: 마피아가 전멸하면 시민 진영 즉시 승리
    if (aliveMafia === 0) {
        return "citizen_win";
    }
    // 판정 분기 2: 마피아의 수가 살아있는 시민의 수와 같거나 많아지면 마피아 진영 즉시 승리
    else if (aliveMafia >= aliveCitizen) {
        return "mafia_win";
    }

    // 어느 쪽도 조건을 충족하지 못했다면 게임 계속 진행
    return "continue";
}