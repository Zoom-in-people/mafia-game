/**
 * 4. phase-controller.js
 * 교사용 토론/투표 제어 및 낮/밤 타이머/단계 전환 총괄 컨트롤러
 */

// [교사용 액션] 🗳️ 학생 낮 의심자 투표 개시
function serverStartDayVote() {
    if (!G_State.isAdmin) return;
    
    const dbRef = firebase.database().ref(`rooms/${G_State.roomId}/game`);
    dbRef.update({
        dayVoteState: "voting",
        statusMessage: "🗳️ 낮 의심자 투표가 시작되었습니다! 마피아로 의심되는 유저를 선택하세요."
    }).then(() => {
        console.log("낮 투표 개시 성공");
    }).catch(err => alert("투표 개시 오류: " + err.message));
}

// [교사용 액션] 📊 투표 마감 및 최다 득표자 사형대 소환
function serverFinishDayVote() {
    if (!G_State.isAdmin) return;

    const dbRef = firebase.database().ref(`rooms/${G_State.roomId}`);
    dbRef.once("value", (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData || !roomData.game) return;

        const players = roomData.game.players || {};
        const lastNightAssault = roomData.game.lastNightAssault || "";
        const currentRetry = roomData.game.dayVoteRetryCount || 0;

        // game-mechanics.js의 순수 연산 코어 호출
        const result = calculateDayVoteResult(players, lastNightAssault, currentRetry);

        let updates = {};
        if (result.status === "retry") {
            // 동표 발생 시: 투표 데이터를 초기화하고 재투표 진행
            updates["game/dayVoteRetryCount"] = result.nextRetry;
            updates["game/statusMessage"] = `⚖️ 최다 득표 동표가 발생하여 재투표를 실시합니다. (현재 ${result.nextRetry}회차 재투표)`;
            for (let id in players) {
                updates[`game/players/${id}/dayVote`] = "none";
            }
        } else if (result.status === "forced_trial" || result.status === "success") {
            // 사형대 진출자 확정
            const targetUid = result.candidate;
            const targetNick = players[targetUid] ? players[targetUid].nickname : "미상";

            updates["game/dayVoteState"] = "trial";
            updates["game/trialTarget"] = targetUid;
            updates["game/statusMessage"] = `💀 [${targetNick}] 학생이 최종 사형대에 올랐습니다! 찬반 판결을 내려주세요.`;
            
            // 모든 플레이어의 찬반 투표 기록 초기화
            for (let id in players) {
                updates[`game/players/${id}/trialDecision`] = "none";
            }
        } else {
            updates["game/statusMessage"] = "🗳️ 투표 참여자가 없어 사형대 소환 없이 낮 토론이 계속됩니다.";
        }

        dbRef.update(updates);
    });
}

// [교사용 액션] ⚖️ 처형/부활 찬반 표결 최종 확정 및 사망 처리
function serverCalculateExecution() {
    if (!G_State.isAdmin) return;

    const dbRef = firebase.database().ref(`rooms/${G_State.roomId}`);
    dbRef.once("value", (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData || !roomData.game) return;

        const players = roomData.game.players || {};
        const targetUid = roomData.game.trialTarget;
        const tRetry = roomData.game.trialRetryCount || 0;

        if (!targetUid || !players[targetUid]) {
            alert("사형대에 오른 유저 정보가 올바르지 않습니다.");
            return;
        }

        // game-mechanics.js의 찬반 집계 연산 호출
        const result = calculateTrialExecution(players, targetUid, tRetry);

        let updates = {};
        let logMsg = "";

        if (result.status === "retry") {
            updates["game/trialRetryCount"] = result.nextTRetry;
            updates["game/statusMessage"] = `⚖️ 찬반 투표 결과가 동수(${result.exeCount} vs ${result.revCount})입니다! 최종 재투표를 실시합니다.`;
            for (let id in players) {
                updates[`game/players/${id}/trialDecision`] = "none";
            }
            dbRef.update(updates);
            return;
        }

        // 투표 결과 확정 및 반영
        updates["game/dayVoteState"] = "none";
        updates["game/trialTarget"] = "";
        updates["game/trialRetryCount"] = 0;

        const targetNick = players[targetUid].nickname;

        if (result.isExecuted) {
            // 처형 찬성이 많을 때 -> 국회의원 면책특권 및 테러리스트 자폭 체크
            if (players[targetUid].role === "assemblyman") {
                logMsg = `⚖️ [국회의원 면책특권] 사형대에 오른 ${targetNick} 유저가 국회의원 능력을 발동하여 생존했습니다!`;
                updates["game/statusMessage"] = `😇 ${targetNick} 유저는 국회의원이었습니다! 처형이 무효화됩니다.`;
            } else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                logMsg = `💀 [낮 투표 처형] 투표 결과 찬성 ${result.exeCount}표 / 반대 ${result.revCount}표로 인해 [${targetNick}] 학생이 처형되었습니다.`;
                updates["game/statusMessage"] = `💀 투표 결과에 따라 [${targetNick}] 학생이 처형되었습니다.`;

                // [테러리스트 길동무 능력 검증]
                if (players[targetUid].role === "terrorist") {
                    let avengers = [];
                    for (let id in players) {
                        if (id !== targetUid && players[id].isAlive && players[id].dayVote === targetUid && players[id].trialDecision === "execute") {
                            avengers.push(id);
                        }
                    }
                    if (avengers.length > 0) {
                        const randomVictimUid = avengers[Math.floor(Math.random() * avengers.length)];
                        const victimNick = players[randomVictimUid].nickname;
                        updates[`game/players/${randomVictimUid}/isAlive`] = false;
                        logMsg += ` 💣 [테러 자폭] 테러리스트였던 ${targetNick}이(가) 자신을 처형시킨 ${victimNick}을(를) 길동무로 삼아 동반 사망했습니다!`;
                    }
                }
            }
        } else {
            logMsg = `😇 [낮 투표 부활] 찬성 ${result.exeCount}표 / 반대 ${result.revCount}표로 과반수가 처형에 반대하여 [${targetNick}] 학생이 온전히 부활했습니다.`;
            updates["game/statusMessage"] = `😇 과반수의 반대로 [${targetNick}] 학생의 처형이 부활(부결)되었습니다.`;
        }

        // 기록 작성 및 승리 조건 체크
        const currentLog = roomData.game.historyLog || "";
        updates["game/historyLog"] = currentLog + (currentLog ? "\n" : "") + logMsg;

        const victory = checkVictoryFaction(players, updates);
        if (victory !== "continue") {
            updates["game/phase"] = "gameover";
            updates["game/winnerFaction"] = victory;
        }

        dbRef.update(updates);
    });
}

// [교사용 액션] 🌙 밤으로 단계 강제 이동 (교사 버튼 이벤트)
function handleNextStage() {
    if (!G_State.isAdmin) return;

    const dbRef = firebase.database().ref(`rooms/${G_State.roomId}`);
    dbRef.once("value", (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData || !roomData.game) return;

        const currentPhase = roomData.game.phase || "day";
        let updates = {};

        if (currentPhase === "day") {
            // 낮 -> 밤 이동 (플레이어들의 밤 행동 데이터 초기화)
            updates["game/phase"] = "night";
            updates["game/statusMessage"] = "🌙 조용한 밤이 찾아왔습니다. 특수 직업군 및 마피아는 밤의 능력을 사용해 주세요.";
            
            const players = roomData.game.players || {};
            for (let id in players) {
                updates[`game/players/${id}/nightTarget`] = "none";
                updates[`game/players/${id}/dayVote`] = "none";
                updates[`game/players/${id}/trialDecision`] = "none";
            }
            updates["game/dayVoteState"] = "none";
            updates["game/trialTarget"] = "";
            updates["game/dayVoteRetryCount"] = 0;
            updates["game/trialRetryCount"] = 0;

            dbRef.update(updates);
        } else {
            // 밤 -> 낮 정산 연산 처리 프로세스 호출 (코드가 길어 분리 배치)
            processNightToDaySettlement(roomData, dbRef);
        }
    });
}

// [핵심 서브 루틴] 🌙 밤 정산 연산 및 아침 소생 프로세스
function processNightToDaySettlement(roomData, dbRef) {
    const players = roomData.game.players || {};
    let updates = {};

    let mafiaTarget = null;
    let doctorTarget = null;
    let gangsterTarget = null;
    let soldierTarget = null;

    // 1단계: 플레이어 밤 타겟팅 전수 수집
    for (let id in players) {
        if (!players[id].isAlive) continue;
        const role = players[id].role;
        const target = players[id].nightTarget;
        if (!target || target === "none") continue;

        if (role === "mafia") mafiaTarget = target;
        if (role === "doctor") doctorTarget = target;
        if (role === "gangster") gangsterTarget = target;
        if (role === "soldier") soldierTarget = target;
    }

    let logMsg = `☀️ 제 ${roomData.game.round || 1}회차 밤이 지나고 아침이 밝았습니다.\n`;
    let assaultedUid = "";

    // 2단계: 건달의 투표 박탈 징계 정산
    for (let id in players) {
        if (gangsterTarget && id === gangsterTarget) {
            updates[`game/players/${id}/isTupyoBlocked`] = true;
        } else {
            updates[`game/players/${id}/isTupyoBlocked`] = false;
        }
    }
    if (gangsterTarget && players[gangsterTarget]) {
        logMsg += `🔨 [건달 협박] 어떤 유저가 건달에게 밤새 협박당해 오늘 낮 투표권이 완전히 봉쇄됩니다.\n`;
    }

    // 3단계: 마피아 습격 및 의사 방어 연산 체인
    if (mafiaTarget && players[mafiaTarget]) {
        if (mafiaTarget === doctorTarget) {
            logMsg += `🩺 [의사 세이브] 마피아가 [${players[mafiaTarget].nickname}] 학생을 습격했으나 의사의 극적인 치료로 소생했습니다!\n`;
        } else if (mafiaTarget === soldierTarget && !players[mafiaTarget].soldierArmorBroken) {
            updates[`game/players/${mafiaTarget}/soldierArmorBroken`] = true;
            logMsg += `🪖 [군인 방탄 발동] 마피아가 군인 [${players[mafiaTarget].nickname}] 학생을 습격했으나 방탄조끼로 1회 방어해 생존했습니다! 정체가 전면 공개됩니다.\n`;
        } else {
            // 연인 대리 사망 특성 체크
            let loverSubstitute = null;
            if (players[mafiaTarget].role === "lovers") {
                for (let partnerId in players) {
                    if (partnerId !== mafiaTarget && players[partnerId].role === "lovers" && players[partnerId].isAlive) {
                        loverSubstitute = partnerId;
                        break;
                    }
                }
            }

            if (loverSubstitute) {
                updates[`game/players/${loverSubstitute}/isAlive`] = false;
                assaultedUid = loverSubstitute;
                logMsg += `💕 [연인 대리 희생] 마피아가 [${players[mafiaTarget].nickname}]을(를) 쐈으나, 연인인 [${players[loverSubstitute].nickname}]이(가) 대신 탄환을 맞고 사망했습니다.\n`;
            } else {
                updates[`game/players/${mafiaTarget}/isAlive`] = false;
                assaultedUid = mafiaTarget;
                logMsg += `🔴 [마피아 저격 성공] 밤새 마피아의 잔혹한 습격으로 인해 [${players[mafiaTarget].nickname}] 학생이 사망했습니다.\n`;
            }
        }
    } else {
        logMsg += `🕊️ 밤새 아무런 일도 일어나지 않는 평화로운 밤이었습니다.\n`;
    }

    // 4단계: 무당/경찰/탐정의 개별 비밀 조사 결과 반영 로직 처리
    processSpecialRoleLogs(players, updates, mafiaTarget);

    // 라운드 증감 및 변수 병합
    const nextRound = (roomData.game.round || 1) + 1;
    updates["game/phase"] = "day";
    updates["game/round"] = nextRound;
    updates["game/lastNightAssault"] = assaultedUid;
    updates["game/statusMessage"] = assaultedUid 
        ? `☀️ 아침이 되었습니다. 밤새 [${players[assaultedUid].nickname}] 학생이 사망했습니다. 토론을 시작해 주세요.` 
        : "☀️ 평화로운 아침이 되었습니다. 사망자가 없습니다! 자유롭게 토론하세요.";

    const currentLog = roomData.game.historyLog || "";
    updates["game/historyLog"] = currentLog + (currentLog ? "\n" : "") + logMsg.trim();

    // 승리 판정 후 업로드
    const victory = checkVictoryFaction(players, updates);
    if (victory !== "continue") {
        updates["game/phase"] = "gameover";
        updates["game/winnerFaction"] = victory;
    }

    dbRef.update(updates);
}

// 각 특수 직업의 밤 일지 생성 서브 모듈
function processSpecialRoleLogs(players, updates, mafiaTarget) {
    for (let id in players) {
        const role = players[id].role;
        const target = players[id].nightTarget;
        if (!target || target === "none" || !players[target]) continue;

        let pLog = (players[id].personalLog || "") + (players[id].personalLog ? "\n" : "");

        if (role === "police") {
            const isMafiaTeam = (players[target].role === "mafia" || players[target].role === "spy");
            pLog += `👮 [경찰 조사] ${players[target].nickname} 학생은 ${isMafiaTeam ? "🔴 마피아 진영" : "⚪ 선량한 시민"}입니다.`;
            updates[`game/players/${id}/personalLog`] = pLog;
        }
        if (role === "spy") {
            const isMafia = (players[target].role === "mafia");
            pLog += `🕵️‍♂️ [스파이 조사] ${players[target].nickname}의 실제 직업은 [${players[target].role}]입니다.`;
            updates[`game/players/${id}/personalLog`] = pLog;
            
            // 상호 정체 알림
            if (isMafia) {
                pLog += ` 🤝 마피아인 ${players[target].nickname}와 상호 접선에 성공했습니다!`;
                updates[`game/players/${id}/personalLog`] = pLog;
                let mLog = (players[target].personalLog || "") + (players[target].personalLog ? "\n" : "");
                mLog += `🤝 [스파이 접선] 조력자 스파이 [${players[id].nickname}] 유저와 비밀 접선에 성공했습니다!`;
                updates[`game/players/${target}/personalLog`] = mLog;
            }
        }
        if (role === "detective") {
            const tTarget = players[target].nightTarget || "none";
            const tTargetNick = (tTarget !== "none" && players[tTarget]) ? players[tTarget].nickname : "없음";
            pLog += `🔍 [탐정 잠행] ${players[target].nickname} 학생이 밤에 향한 동선 대상: [${tTargetNick}]`;
            updates[`game/players/${id}/personalLog`] = pLog;
        }
    }
}

// [교사용 액션] 🚨 게임 강제 종료
function handleForceStopGame() {
    if (!confirm("정말로 현재 게임을 강제로 종료하고 초기화하시겠습니까?")) return;
    firebase.database().ref(`rooms/${G_State.roomId}/game`).remove()
        .then(() => alert("게임이 강제 정지되었습니다."))
        .catch(err => alert("종료 오류: " + err.message));
}