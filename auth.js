/**
 * 2. auth.js
 * 유저 인증(로그인/회원가입), 중복 로그인 방지, 퇴장/튕김 후 재접속 세션 복구 총괄
 */

// ─────────────────────────────────────────────────────────────────────
// [★기능 개편] 직업 가이드 모달 - 진영 선택 → 직업 선택 → 상세 설명
// 이전에는 텍스트 덩어리 하나로 모든 직업을 나열했습니다.
// 이제 진영 버튼 → 직업 버튼 → 카드형 상세 설명 3단계 인터랙티브 구조로 변경합니다.
// 닫기 버튼은 flex 하단에 고정되어 내용이 길어도 항상 보입니다.
// ─────────────────────────────────────────────────────────────────────

const _roleGuideData = {
    mafia: {
        icon: '🔴', name: '마피아',
        factionLabel: '마피아 진영', factionClass: 'tag-faction-mafia',
        timing: '🌙 밤에 활동',
        desc: '밤마다 팀원과 채팅으로 작전을 짠 후 저격 대상을 지목하여 처단합니다.\n마피아끼리는 서로의 정체를 알고 있으며, 밤 전용 비밀 채팅방을 이용할 수 있습니다.'
    },
    spy: {
        icon: '🕵️‍♂️', name: '스파이',
        factionLabel: '마피아 진영', factionClass: 'tag-faction-mafia',
        timing: '🌙 밤에 활동',
        desc: '밤에 지목한 유저의 정체를 조사합니다.\n마피아를 조사하면 접선 성공! 조사 일지에 마피아 전체 명단이 공개됩니다.\n마피아는 스파이의 정체를 모르지만, 접선에 성공하면 서로의 존재를 알게 됩니다.'
    },
    citizen: {
        icon: '⚪', name: '시민',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '☀️ 낮에 활동',
        desc: '특별한 고유 능력은 없지만, 예리한 추리와 설득력 있는 발언으로 마피아를 찾아냅니다.\n낮 투표에서 마피아를 처형하는 것이 목표입니다.'
    },
    police: {
        icon: '👮', name: '경찰',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🌙 밤에 활동',
        desc: '밤마다 지목한 유저가 마피아 진영(마피아·스파이)인지, 시민 진영인지 판별합니다.\n조사 결과는 내 조사 일지 기록부에만 기록됩니다.'
    },
    detective: {
        icon: '🔍', name: '사립탐정',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🌙 밤에 활동',
        desc: '밤마다 지목한 대상이 어젯밤에 누구에게 자신의 능력을 발동했는지 그 동선을 역추적합니다.\n결과는 조사 일지 기록부에 기록됩니다.'
    },
    mudang: {
        icon: '🔮', name: '무당',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🌙 밤 지목 → ☀️ 낮 결과',
        desc: '밤에 기도를 올릴 대상을 지목합니다.\n다음 날 낮에 사망한 유령들이 그 대상의 진짜 진영을 투표해 주고,\n그 결과가 조사 일지 기록부에 기록됩니다.'
    },
    doctor: {
        icon: '🩺', name: '의사',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🌙 밤에 활동',
        desc: '밤마다 마피아의 공격으로부터 지킬 대상 1명을 지목합니다.\n마피아가 그 대상을 공격하면 사망하지 않습니다.\n아침 브리핑에 누가 공격받았는지 이름이 공개됩니다.'
    },
    soldier: {
        icon: '🪖', name: '군인',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🛡️ 패시브 능력',
        desc: '마피아의 공격을 최초 1회 완전히 막아내는 방탄 면역 목숨을 가집니다 (총 2라이프).\n첫 번째 공격은 막아내지만, 두 번째 공격을 받으면 사망합니다.'
    },
    assemblyman: {
        icon: '⚖️', name: '국회의원',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🛡️ 패시브 능력 (1회)',
        desc: '낮 투표 처형대에 소환되어 처형 판결을 받아도 면책특권이 자동 발동하여 1회 즉시 무죄 부활합니다.\n단, 면책특권은 1회뿐이며 이후에는 일반 시민과 동일합니다.'
    },
    terrorist: {
        icon: '💣', name: '테러리스트',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '💥 죽을 때 발동',
        desc: '낮에 투표로 처형당하거나 밤에 마피아에게 저격당할 때,\n자신을 처단한 쪽의 인원 1명을 무작위로 골라 자폭 길동무로 동반 처단합니다.'
    },
    gangster: {
        icon: '🔨', name: '건달',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🌙 밤에 활동',
        desc: '밤에 지목한 대상을 협박 폭행하여 다음 날 낮 투표권을 완전히 박탈합니다.\n(의심자 지목 투표 + 사형대 찬반 표결 모두 불가합니다.)'
    },
    lovers: {
        icon: '💕', name: '연인',
        factionLabel: '시민 진영', factionClass: 'tag-faction-citizen',
        timing: '🛡️ 패시브 능력 (2명 고정)',
        desc: '항상 2명이 한 쌍으로 배정됩니다.\n연인 중 한 명이 마피아에게 저격을 받으면, 다른 연인이 대신 몸을 던져 대리 사망합니다.\n공격받은 연인은 살아남습니다.'
    }
};

const _factionGroups = {
    mafia: {
        label: '🔴 마피아 진영',
        subLabel: '마피아 · 스파이',
        btnClass: 'faction-mafia',
        roles: ['mafia', 'spy']
    },
    citizen: {
        label: '⚪ 시민 진영',
        subLabel: '시민 · 경찰 · 사립탐정 · 무당 · 의사 · 군인 · 국회의원 · 테러리스트 · 건달 · 연인',
        btnClass: 'faction-citizen',
        roles: ['citizen', 'police', 'detective', 'mudang', 'doctor', 'soldier', 'assemblyman', 'terrorist', 'gangster', 'lovers']
    }
};

// [★신규] 직업 가이드 홈 화면 (진영 선택)
window._showRoleGuideHome = function() {
    const body = document.getElementById('role-modal-body');
    if (!body) return;
    body.innerHTML = `
        <p style="text-align:center; color:#888; font-size:13px; margin:0 0 12px;">진영을 선택하면 직업 목록을 볼 수 있어요</p>
        <button class="role-faction-btn faction-mafia" onclick="window._showRoleFaction('mafia')">
            🔴 마피아 진영<br>
            <span style="font-size:12px; font-weight:normal;">마피아 · 스파이</span>
        </button>
        <button class="role-faction-btn faction-citizen" onclick="window._showRoleFaction('citizen')">
            ⚪ 시민 진영<br>
            <span style="font-size:12px; font-weight:normal;">시민 · 경찰 · 사립탐정 · 무당 · 의사 · 군인 · 국회의원 · 테러리스트 · 건달 · 연인</span>
        </button>
    `;
};

// [★신규] 직업 목록 화면 (특정 진영)
window._showRoleFaction = function(factionKey) {
    const body = document.getElementById('role-modal-body');
    if (!body) return;
    const faction = _factionGroups[factionKey];
    const jobBtns = faction.roles.map(roleKey => {
        const rd = _roleGuideData[roleKey];
        return `<button class="role-job-btn" onclick="window._showRoleDetail('${roleKey}','${factionKey}')">${rd.icon} ${rd.name}</button>`;
    }).join('');

    body.innerHTML = `
        <button class="role-back-btn" onclick="window._showRoleGuideHome()">← 진영 선택으로</button>
        <h4 style="margin:0 0 6px; text-align:center;">${faction.label} 직업 목록</h4>
        <div class="role-job-grid">${jobBtns}</div>
    `;
};

// [★신규] 직업 상세 설명 화면
window._showRoleDetail = function(roleKey, factionKey) {
    const body = document.getElementById('role-modal-body');
    if (!body) return;
    const rd = _roleGuideData[roleKey];
    if (!rd) return;

    body.innerHTML = `
        <button class="role-back-btn" onclick="window._showRoleFaction('${factionKey}')">← 직업 목록으로</button>
        <div class="role-desc-card">
            <div class="role-desc-icon">${rd.icon}</div>
            <div class="role-desc-name">${rd.name}</div>
            <div class="role-tag-row">
                <span class="role-tag ${rd.factionClass}">${rd.factionLabel}</span>
                <span class="role-tag tag-timing">${rd.timing}</span>
            </div>
            <hr style="border:none; border-top:1px solid #e0e0e0; margin:10px 0;">
            <div class="role-desc-text">${rd.desc}</div>
        </div>
    `;
};

window.showRoleDescriptions = function() {
    const modal = document.getElementById('role-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    window._showRoleGuideHome();
};

window.closeRoleModal = function() {
    const modal = document.getElementById('role-modal');
    if (modal) modal.style.display = 'none';
};

// ─────────────────────────────────────────────────────────────────────
// 로그인 / 회원가입 / 탭 전환 / 퇴장 (기존 코드 유지)
// ─────────────────────────────────────────────────────────────────────

function switchAuthTab(type) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('tab-login-btn');
    const registerBtn = document.getElementById('tab-register-btn');
    
    if (type === 'login') {
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (loginBtn) loginBtn.classList.add('active');
        if (registerBtn) registerBtn.classList.remove('active');
    } else {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (loginBtn) loginBtn.classList.remove('active');
        if (registerBtn) registerBtn.classList.add('active');
    }
}

function handleRegister() {
    const nickInput = document.getElementById('register-nickname');
    const pwInput = document.getElementById('register-password');
    if (!nickInput || !pwInput) return;

    const nick = nickInput.value.trim();
    const pw = pwInput.value.trim();

    if (!nick) return alert('회원가입하실 닉네임을 정확히 입력해 주세요.');
    if (nick.length > 8) return alert('닉네임은 최대 8자까지만 허용됩니다.');
    if (!pw) return alert('사용하실 패스워드를 입력해 주세요.');

    if (['교사', 'teacher', 'admin', '관리자'].includes(nick)) {
        return alert('해당 닉네임은 마스터 예약어로 회원가입할 수 없습니다.');
    }

    getDb().ref(`accounts/${nick}`).get().then((snapshot) => {
        if (snapshot.exists()) {
            return alert('이미 존재하는 닉네임입니다. 로그인 탭에서 로그인을 진행해 주세요.');
        }

        getDb().ref(`accounts/${nick}`).set({
            password: pw,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            alert('회원가입이 정상 완료되었습니다! 로그인 탭으로 이동해 로그인해 주세요.');
            switchAuthTab('login');
            nickInput.value = '';
            pwInput.value = '';
        });
    }).catch(err => alert('회원가입 처리 중 데이터베이스 오류: ' + err.message));
}

function handleLogin() {
    const nickInput = document.getElementById('login-nickname');
    const pwInput = document.getElementById('login-password');
    if (!nickInput || !pwInput) return;

    const nick = nickInput.value.trim();
    const pw = pwInput.value.trim();

    if (!nick) return alert('닉네임을 입력해 주세요.');
    if (!pw) return alert('비밀번호를 입력해 주세요.');

    if (nick === '교사' || nick === 'teacher' || nick === 'admin') {
        if (pw === 'teacherpw') { 
            currentUser = { id: 'admin_master', nick: '교사(관전)', isAdmin: true };
            currentStatus = 'waiting';
            window._userConfirmedInRoom = false;
            triggerGameViewTransition();
            return;
        } else {
            return alert('교사 마스터 패스워드가 올바르지 않습니다.');
        }
    }

    getDb().ref().get().then((rootSnap) => {
        const rootData = rootSnap.val() || {};
        const account = rootData.accounts?.[nick];
        const users = rootData.rooms?.users || {};
        const gamePlayers = rootData.game?.players || {};
        const gameStatus = rootData.game?.status || 'waiting';

        if (!account) {
            return alert('가입되지 않은 닉네임입니다. 먼저 회원가입을 완료해 주세요.');
        }
        if (account.password !== pw) {
            return alert('비밀번호가 일치하지 않습니다.');
        }

        let existingUid = null;
        let isAnActivePlayer = false;

        if (gameStatus !== 'waiting') {
            for (let uid in gamePlayers) {
                if (gamePlayers[uid].nickname === nick) {
                    existingUid = uid;
                    isAnActivePlayer = true;
                    break;
                }
            }
        }

        if (!existingUid) {
            for (let uid in users) {
                if (uid !== 'admin_master' && users[uid] && users[uid].nickname === nick) {
                    existingUid = uid;
                    break;
                }
            }
        }

        if (existingUid) {
            if (gameStatus !== 'waiting' && isAnActivePlayer) {
                currentUser = { id: existingUid, nick: nick, isAdmin: false };
                
                const restoreUpdates = {};
                restoreUpdates[`game/players/${existingUid}/isAiControlled`] = false; 
                restoreUpdates[`rooms/users/${existingUid}`] = { nickname: nick, joinedAt: firebase.database.ServerValue.TIMESTAMP };
                
                getDb().ref().update(restoreUpdates).then(() => {
                    console.log(`${nick} 학생 인게임 세션 원상 복구 및 난입 안착.`);
                    window._userConfirmedInRoom = false;
                    triggerGameViewTransition();
                });
            } else {
                currentUser = { id: existingUid, nick: nick, isAdmin: false };
                
                getDb().ref(`rooms/users/${existingUid}`).set({
                    nickname: nick,
                    joinedAt: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    console.log(`${nick} 학생 대기실 유령 로그인 해제 후 오버라이트 안착 완료.`);
                    window._userConfirmedInRoom = false;
                    triggerGameViewTransition();
                });
            }
        } else {
            if (gameStatus !== 'waiting') {
                return alert('이미 게임 세션이 가동 중이므로 새로 난입할 수 없습니다. 다음 판을 기다려 주세요.');
            }

            const newUid = 'stu_' + Math.random().toString(36).substr(2, 9);
            currentUser = { id: newUid, nick: nick, isAdmin: false };

            getDb().ref(`rooms/users/${newUid}`).set({
                nickname: nick,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                window._userConfirmedInRoom = false;
                triggerGameViewTransition();
            });
        }
    }).catch(err => alert('로그인 처리 중 데이터 통신 오류: ' + err.message));
}

// [★신규] 대기실 전용 나가기 함수 (게임 중 나가기와 메시지가 다름)
function handleWaitingExit() {
    if (!currentUser) return;
    if (!confirm('대기실에서 나가시겠습니까?')) return;

    if (!currentUser.isAdmin) {
        window._userConfirmedInRoom = false; // 추방 감지 오작동 방지
        getDb().ref(`rooms/users/${currentUser.id}`).remove()
            .then(() => clearSession())
            .catch(() => clearSession());
    } else {
        clearSession();
    }
}

function handleExit() {
    if (!currentUser) return;
    const confirmExit = confirm("정말 이 방에서 나가시겠습니까? (나간 동안은 AI가 대신 진행합니다.)");
    if (!confirmExit) return;

    if (!currentUser.isAdmin) {
        const myUid = currentUser.id; 

        getDb().ref(`game/players/${myUid}`).update({
            isAiControlled: true
        }).then(() => {
            return getDb().ref(`rooms/users/${myUid}`).remove();
        }).then(() => {
            clearSession(); 
        }).catch(err => {
            console.error("퇴장 AI 이월 연산 중 예외 발생:", err);
            clearSession();
        });
    } else {
        clearSession();
    }
}

function clearSession() {
    currentUser = null;
    location.reload(); 
}