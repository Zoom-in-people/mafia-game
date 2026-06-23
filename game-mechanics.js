/**
 * 3. game-mechanics.js
 * 직업 배정 알고리즘, 낮/밤 동표 예외 처리, 백엔드 사망 판정 코어 엔진
 */

// [원본 연동] 의심자 지목 투표 마감 및 동표 재투표 연산 엔진
function calculateDayVoteResult(players, lastNightAssault, retryCount) {
    let tally = {};
    for (let id in players) {
        if (id === lastNightAssault || !players[id].isAlive) continue;
        let v = players[id].dayVote;
        if (v && v !== "none" && players[v] && players[v].isAlive) {
            tally[v] = (tally[v] || 0) + 1;
        }
    }

    let max = 0;
    for (let uid in tally) {
        if (tally[uid] > max) max = tally[uid];
    }

    if (max === 0) return { status: "no_votes" };

    let candidates = [];
    for (let uid in tally) {
        if (tally[uid] === max) candidates.push(uid);
    }

    // 동표 발생 시 예외 처리 분기 브릿지
    if (candidates.length > 1) {
        const nextRetry = retryCount + 1;
        if (nextRetry < 3) {
            return { status: "retry", nextRetry: nextRetry };
        } else {
            // 3회 이상 동표 시 후보 중 무작위 1명 선정
            return { status: "forced_trial", candidate: candidates[Math.floor(Math.random() * candidates.length)] };
        }
    }

    return { status: "success", candidate: candidates[0] };
}

// [원본 연동] 찬반 투표 결과 집계 및 생존진영 잔여 정원 판정 매트릭스
function calculateTrialExecution(players, targetUid, tRetry) {
    let exeCount = 0; let revCount = 0;
    for (let id in players) {
        if (players[id].trialDecision === 'execute') exeCount++;
        if (players[id].trialDecision === 'revive') revCount++;
    }

    // 찬반 표결 수가 동일할 때 처리
    if (exeCount === revCount && (exeCount > 0 || revCount > 0)) {
        const nextTRetry = tRetry + 1;
        if (nextTRetry < 3) {
            return { status: "retry", nextTRetry: nextTRetry, exeCount, revCount };
        } else {
            // 3회 이상 찬반 동표 시 부활(살리기) 강제 확정 권한 부여
            exeCount = 0; revCount = 999;
        }
    }

    return {
        status: "success",
        isExecuted: exeCount > revCount,
        exeCount,
        revCount
    };
}

// 승리 기준 도출 연산 헬퍼
function checkVictoryFaction(players, updates) {
    let aliveMafia = 0; let aliveCitizen = 0;
    for (let id in players) {
        let stillAlive = players[id].isAlive;
        if (updates && updates[`game/players/${id}/isAlive`] === false) stillAlive = false;
        if (stillAlive) {
            if (players[id].role === 'mafia') aliveMafia++; else aliveCitizen++;
        }
    }

    if (aliveMafia === 0) return "citizen_win";
    if (aliveMafia >= aliveCitizen) return "mafia_win";
    return "continue";
}