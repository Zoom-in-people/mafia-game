/**
 * 1. config.js
 * 프로젝트 전역 환경 설정 및 인게임 상태 구조 변수, 공통 퀴즈 상수 풀 관리
 */

// Firebase 실시간 데이터베이스 인스턴스 범용 확보 헬퍼
const getDb = () => {
    if (window.sharedDatabase) return window.sharedDatabase;
    return firebase.database();
};

// 인게임 엔진 제어용 전역 변수 모음
let currentUser = null;       // 현재 로그인 세션 객체
let currentRole = "none";     // 본인의 배정 직업 명칭
let currentStatus = "waiting"; // 시스템 상태 스테이지 (waiting / day_discuss / night_action / game_over)
let currentQuiz = null;       // 유령 세션용 실시간 대입 과학 문제 객체
let adminRevealMap = {};      // 교사용 관전 스크린 개별 블라인드 토글용 메모리 구조체

// 각 직업 성격별 대표 이모지 고유 캐릭터 아이콘 맵
const roleIcons = {
    mafia: "🦹", 
    citizen: "🧑‍🤝‍🧑", 
    spy: "🕵️", 
    detective: "🔍",
    mudang: "🔮", 
    police: "👮", 
    doctor: "🩺", 
    soldier: "🪖",
    assemblyman: "⚖️", 
    terrorist: "💣", 
    gangster: "🔨", 
    lovers: "💕"
};

// 과학 교육과정 연계 학년/학기별 문제 은행 및 넌센스 이월 상용 풀
const quizBank = {
    "1-1": [
        { q: "과학: 물질의 세 가지 상태 중 모양과 부피가 일정한 상태는?", a: ["고체", "액체", "기체", "플라스마"], c: 0 },
        { q: "넌센스: 지구가 황당해하는 말을 세 글자로?", a: ["지구머니", "지구용사", "어이없다", "둥글둥글"], c: 0 }
    ],
    "1-2": [
        { q: "과학: 빛이 거울에 부딪혀서 나아가는 방향이 바뀌는 현상은?", a: ["굴절", "반사", "분산", "합성"], c: 1 },
        { q: "넌센스: 왕이 넘어지면 무엇이라고 할까?", a: ["킹콩", "킹바다", "킹스맨", "킹왕짱"], c: 0 }
    ],
    "2-1": [
        { q: "과학: 물질을 구성하는 가장 작은 독립된 입자는?", a: ["원자", "분자", "원소", "이온"], c: 1 },
        { q: "넌센스: 세상에서 가장 차가운 바다는?", a: ["썰렁해", "냉동해", "북극해", "남극해"], c: 0 }
    ],
    "2-2": [
        { q: "과학: 식물이 빛에너지를 이용하여 영양분을 만드는 과정은?", a: ["호흡", "증산", "광합성", "소화"], c: 2 },
        { q: "넌센스: 의사들이 가장 좋아하는 행동은?", a: ["주사하기", "치료하기", "수술하기", "혈압재기"], c: 0 }
    ]
};